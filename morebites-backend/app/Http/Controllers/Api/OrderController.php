<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Customer;
use App\Models\LoyaltySetting;
use App\Models\MenuItem;
use App\Models\Notification;
use App\Models\Order;
use App\Models\OrderItem;
use App\Services\InventoryDeductionService;
use App\Services\LoyaltyService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OrderController extends Controller
{
    /**
     * PROMPT 49 DIAGNOSTIC REPORT — Walk-in vs. Online Orders in Sales & Lifecycle:
     * 1. Statuses Counted Toward Total Sales:
     *    - Dashboard (`DashboardController::index`) and Supervisor Web (`Dashboard.jsx`, `Reports.jsx`)
     *      count strictly `status = 'Completed'` for both walk-in (`Dine-in`, `Takeout`) and `Online Order`
     *      records via a single unified query.
     *    - Previously, `ReportController::index` (`total_sales_today`) and `DashboardController::index`
     *      hourly chart (`$salesRows`) had no `status` filter (summing Pending/Preparing/Ready/Cancelled).
     *      Both now filter strictly for `status = 'Completed'` within the `Asia/Manila` day window.
     * 2. Real-World Payment Timing vs. Lifecycle Dead-End:
     *    - Walk-in (`Dine-in`/`Takeout`) orders set `payment_status = 'Paid'` at POS creation (`store()`),
     *      whereas COD `Online Order` records start as `payment_status = 'Unpaid'` and become `'Paid'`
     *      when the rider marks delivery `'Completed'`. There is no separate `paid_at` column.
     *    - Previously, walk-in orders started at `'Preparing'` -> `'Mark Ready'` (`'Ready'`), and once
     *      at `'Ready'`, `transform()` returned `action = 'View'`, leaving all 12 walk-in orders in the
     *      database stuck at `'Ready'` with no UI button to reach `'Completed'`.
     * 3. Fix Implemented (Option A — Unified `Completed` Rule Across Both Order Types):
     *    - `transform()` now returns `action = 'Complete'` for walk-in (`Dine-in`/`Takeout`) orders in
     *      `'Ready'` status so staff can mark them `'Completed'` upon customer handoff.
     *    - Both walk-in and online orders now consistently reflect in Dashboard Total Sales, Hourly Sales
     *      Chart, Orders Completed, and Reports Total Sales Today as soon as they reach `'Completed'`.
     */
    public function index(Request $request)
    {
        $query = Order::query()->with('items')->latest();

        if ($status = $request->query('status')) {
            if ($status !== 'All') {
                $query->where('status', $status);
            }
        }
        if ($type = $request->query('type')) {
            if ($type !== 'All') {
                $query->where('order_type', $type);
            }
        }
        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('order_code', 'like', "%{$search}%")
                    ->orWhere('customer_name', 'like', "%{$search}%");
            });
        }

        $orders = $query->get()->map(fn (Order $o) => $this->transform($o));

        $manilaNow = \Illuminate\Support\Carbon::now('Asia/Manila');
        $todayStartUtc = $manilaNow->copy()->startOfDay()->setTimezone('UTC');
        $todayEndUtc = $manilaNow->copy()->endOfDay()->setTimezone('UTC');

        $todayQuery = Order::query()
            ->realOrderCodes()
            ->whereBetween('created_at', [$todayStartUtc, $todayEndUtc]);

        $stats = [
            'total' => (clone $todayQuery)->count(),
            'completed' => (clone $todayQuery)->where('status', 'Completed')->count(),
            'pending' => (clone $todayQuery)->where('status', 'Pending')->count(),
            'delivery' => (clone $todayQuery)->where('status', 'Out for Delivery')->count(),
        ];

        return response()->json(['data' => $orders, 'meta' => ['stats' => $stats]]);
    }

    public function lookupLoyalty(Request $request)
    {
        $request->validate([
            'phone' => ['required', 'string', 'regex:/^09\d{9}$/'],
        ], [
            'phone.regex' => 'Phone must be an 11-digit Philippine mobile number starting with 09.',
        ]);

        $phone = $request->query('phone');

        $customer = Customer::query()
            ->where('phone', $phone)
            ->orWhereRaw("REPLACE(REPLACE(phone, ' ', ''), '-', '') = ?", [$phone])
            ->first();

        if (! $customer) {
            return response()->json([
                'found' => false,
                'message' => 'No loyalty account for this number',
            ]);
        }

        app(LoyaltyService::class)->lazyCheckExpiry($customer);
        $customer->refresh();

        $settings = LoyaltySetting::current();
        $pesoValue = (float) $settings->peso_value_per_point;
        $balance = (int) $customer->loyalty_points;

        return response()->json([
            'found' => true,
            'customer' => [
                'id' => $customer->id,
                'customer_code' => $customer->customer_code,
                'name' => $customer->full_name,
                'phone' => $customer->phone,
                'points' => $balance,
                'points_worth' => round($balance * $pesoValue, 2),
                'points_expire_at' => $customer->points_expire_at?->toIso8601String(),
            ],
        ]);
    }

    public function showByKey(string $key)
    {
        $order = Order::query()
            ->where('idempotency_key', $key)
            ->with(['items'])
            ->first();

        if (! $order) {
            return response()->json(['message' => 'Order not found.'], 404);
        }

        return response()->json(['data' => $this->transform($order)]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'idempotency_key' => ['nullable', 'string', 'max:191'],
            'customer_name' => ['required', 'string'],
            'order_type' => ['required', 'string', 'in:Dine-in,Takeout'],
            'status' => ['nullable', 'string'],
            'loyalty_customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.name' => ['required', 'string'],
            'items.*.menu_item_id' => ['nullable', 'integer'],
            'items.*.size' => ['nullable', 'string'],
            'items.*.removed_ingredients' => ['nullable', 'array'],
            'items.*.special_instructions' => ['nullable', 'string', 'max:500'],
            'items.*.qty' => ['required', 'integer', 'min:1'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
            'delivery_address' => ['nullable', 'string'],
        ]);

        $idempotencyKey = $data['idempotency_key'] ?? null;
        if (! empty($idempotencyKey)) {
            $existingOrder = Order::query()
                ->where('idempotency_key', $idempotencyKey)
                ->first();

            if ($existingOrder) {
                return response()->json(['data' => $this->transform($existingOrder->load('items'))], 200);
            }
        }

        $service = app(InventoryDeductionService::class);
        $service->validateCartAvailability($data['items']);

        /**
         * PROMPT INVESTIGATION REPORT: Order ID Sequencing
         *
         * Previously, order IDs were calculated via `count() + 21`, which is not thread-safe
         * under concurrent requests. Order IDs are now generated via a true database
         * auto-increment column (`order_sequences`), zero-padded to 5 digits: #ORD-00028.
         */
        try {
            $order = DB::transaction(function () use ($data, $request, $idempotencyKey) {
                if (! empty($idempotencyKey)) {
                    $existingOrder = Order::query()
                        ->where('idempotency_key', $idempotencyKey)
                        ->lockForUpdate()
                        ->first();

                    if ($existingOrder) {
                        return $existingOrder->load('items');
                    }
                }

                $deductionService = app(InventoryDeductionService::class);
                $resolvedItems = collect($data['items'])->map(function ($item) use ($deductionService) {
                    $snapshottedRemoved = $deductionService->snapshotRemovedIngredientsForLine($item);
                    $effectiveUnitPrice = $deductionService->resolveEffectiveUnitPriceForLine($item, $snapshottedRemoved);

                    return array_merge($item, [
                        '_snapshotted_removed' => $snapshottedRemoved,
                        'unit_price' => $effectiveUnitPrice,
                    ]);
                })->all();

                $total = collect($resolvedItems)->sum(fn ($i) => $i['qty'] * $i['unit_price']);

                $order = Order::query()->create([
                    'order_code' => Order::generateOrderCode(),
                    'idempotency_key' => $idempotencyKey,
                    'customer_id' => null,
                    'loyalty_customer_id' => $data['loyalty_customer_id'] ?? null,
                    'customer_name' => $data['customer_name'],
                    'order_type' => $data['order_type'],
                    'total' => $total,
                    'status' => $data['status'] ?? 'Preparing',
                    'payment_method' => 'COD',
                    'payment_status' => 'Paid',
                    'delivery_address' => $data['delivery_address'] ?? null,
                ]);

                foreach ($resolvedItems as $item) {
                    $hasSizeInName = ! empty($item['size']) && str_contains($item['name'], '('.$item['size'].')');
                    $name = ! empty($item['size']) && ! $hasSizeInName
                        ? $item['name'].' ('.$item['size'].')'
                        : $item['name'];

                    OrderItem::query()->create([
                        'order_id' => $order->id,
                        'menu_item_id' => $item['menu_item_id'] ?? null,
                        'name' => $name,
                        'size' => $item['size'] ?? null,
                        'removed_ingredients' => $item['_snapshotted_removed'] ?? null,
                        'special_instructions' => ! empty($item['special_instructions']) ? trim((string) $item['special_instructions']) : null,
                        'qty' => $item['qty'],
                        'unit_price' => $item['unit_price'],
                        'line_total' => $item['qty'] * $item['unit_price'],
                    ]);
                }

                $actor = $request->user()?->name ?: 'Staff';
                ActivityLog::query()->create([
                    'actor' => $actor,
                    'action' => 'Created order '.$order->order_code,
                ]);

                app(InventoryDeductionService::class)->deductForOrder($order);

                Notification::createOrderNotification($order);

                return $order->load('items');
            });
        } catch (\Illuminate\Database\QueryException $e) {
            if (! empty($idempotencyKey)) {
                $existingOrder = Order::query()
                    ->where('idempotency_key', $idempotencyKey)
                    ->first();

                if ($existingOrder) {
                    return response()->json(['data' => $this->transform($existingOrder->load('items'))], 200);
                }
            }
            throw $e;
        }

        $statusCode = (! empty($idempotencyKey) && $order->wasRecentlyCreated === false) ? 200 : 201;

        return response()->json(['data' => $this->transform($order)], $statusCode);
    }

    public function updateStatus(Request $request, Order $order)
    {
        $data = $request->validate([
            'status' => ['required', 'string'],
            'cancellation_reason' => ['nullable', 'string'],
        ]);

        $user = $request->user();
        if ($data['status'] === 'Cancelled') {
            if ($user && in_array(strtolower($user->role), ['customer', 'driver'], true)) {
                return response()->json([
                    'message' => 'Only staff can cancel orders.',
                    'errors' => ['status' => ['Only staff can cancel orders.']],
                ], 403);
            }

            // Cancelling twice is a no-op
            if ($order->status === 'Cancelled') {
                return response()->json(['data' => $this->transform($order->load('items'))]);
            }

            if (in_array($order->status, ['Completed', 'Delivered'], true)) {
                return response()->json([
                    'message' => 'Completed orders cannot be cancelled.',
                    'errors' => ['status' => ['Completed orders cannot be cancelled.']],
                ], 422);
            }
        } elseif ($order->status === 'Cancelled') {
            return response()->json([
                'message' => 'Cancelled orders cannot be reopened or updated.',
                'errors' => ['status' => ['Cancelled orders cannot be reopened or updated.']],
            ], 422);
        }

        $previous = $order->status;
        $updatePayload = ['status' => $data['status']];
        if ($data['status'] === 'Cancelled' && ! empty($data['cancellation_reason'])) {
            $updatePayload['cancellation_reason'] = $data['cancellation_reason'];
        }

        if (in_array($data['status'], ['Completed', 'Delivered'], true)) {
            $deliveredAt = $order->delivered_at ?? now();
            $updatePayload['delivered_at'] = $deliveredAt;
            if ($order->order_type === 'Online Order') {
                $updatePayload = array_merge($updatePayload, $order->calculateLateDeliveryPayload($deliveredAt));
            }
            $updatePayload['payment_status'] = 'Paid';
        }
        $order->update($updatePayload);

        if (in_array($data['status'], ['Completed', 'Delivered'], true)) {
            app(\App\Services\LoyaltyService::class)->creditForOrder($order->fresh());
        }

        if ($data['status'] === 'Cancelled' && $previous !== 'Cancelled') {
            app(InventoryDeductionService::class)->restockForOrder($order);
            app(\App\Services\LoyaltyService::class)->refundForOrder($order);
        }

        if ($data['status'] !== $previous) {
            Notification::createOrderNotification($order);
            $actor = $user?->name ?: 'Staff';
            $reasonSuffix = ($data['status'] === 'Cancelled' && $order->cancellation_reason)
                ? " ({$order->cancellation_reason})"
                : '';
            ActivityLog::query()->create([
                'actor' => $actor,
                'action' => "Order {$order->order_code} status updated to {$data['status']}{$reasonSuffix}",
            ]);
        }

        return response()->json(['data' => $this->transform($order->load('items'))]);
    }

    public function menuOptions()
    {
        $service = app(InventoryDeductionService::class);
        $service->clearExpiredBatchPromos();

        $formatNum = fn (float $v) => floor($v) == $v ? number_format($v, 0) : number_format($v, 2);

        $menuItems = MenuItem::query()
            ->with([
                'sizes.ingredients.inventoryItem' => fn ($q) => $q->withTrashed()->with('batches'),
                'ingredients' => fn ($q) => $q->with([
                    'inventoryItem' => fn ($q) => $q->withTrashed()->with('batches'),
                ]),
            ])
            ->where('archived', false)
            ->orderBy('name')
            ->get();

        $service->syncMenuAvailability($menuItems);

        $items = $menuItems
            ->map(function (MenuItem $m) use ($service, $formatNum) {
                $stockReason = $service->unserviceableReason($m);
                $stockOk = $stockReason === null;
                $promoActive = (bool) $m->promo_active && (float) ($m->promo_discount_percent ?? 0) > 0;

                $isBeverage = strcasecmp(trim((string) $m->category), 'Beverages') === 0;

                $sizes = $m->sizes->map(function ($s) use ($m, $service, $isBeverage) {
                    $sizeReason = $service->unserviceableReason($m, 1, $s->name);
                    $orig = (float) $s->price;
                    $eff = $m->applyPromoPrice($orig);

                    return [
                        'name' => $s->name,
                        'original_price' => $orig,
                        'price' => $eff,
                        'available' => (bool) $m->available && $sizeReason === null,
                        'stockReason' => $sizeReason,
                        'ingredients' => $isBeverage
                            ? collect()
                            : $s->ingredients
                                ->filter(fn ($ing) => $ing->is_removable !== false)
                                ->map(fn ($ing) => [
                                    'id' => $ing->id,
                                    'inventory_item_id' => $ing->inventory_item_id,
                                    'name' => $ing->inventoryItem?->name ?? 'Ingredient',
                                    'qty_per_serving' => (float) $ing->qty_per_serving,
                                    'unit' => $ing->unit ?: $ing->inventoryItem?->unit,
                                    'inventory_price' => (float) ($ing->inventoryItem?->price ?? 0),
                                    'price' => $ing->computedPrice(),
                                    'is_removable' => true,
                                ])->values(),
                    ];
                })->values();

                $ingredients = $isBeverage
                    ? collect()
                    : $m->ingredients
                        ->filter(fn ($ing) => $ing->is_removable !== false)
                        ->map(fn ($ing) => [
                            'id' => $ing->id,
                            'menu_item_size_id' => $ing->menu_item_size_id,
                            'inventory_item_id' => $ing->inventory_item_id,
                            'name' => $ing->inventoryItem?->name ?? 'Ingredient',
                            'qty_per_serving' => (float) $ing->qty_per_serving,
                            'unit' => $ing->unit ?: $ing->inventoryItem?->unit,
                            'inventory_price' => (float) ($ing->inventoryItem?->price ?? 0),
                            'price' => $ing->computedPrice(),
                            'is_removable' => true,
                        ])->values();

                $hasAvailableSize = ! $m->has_sizes || $sizes->isEmpty() || $sizes->contains(fn ($s) => $s['available']);
                $itemAvailable = (bool) $m->available && $stockOk && $hasAvailableSize;

                $origMin = $sizes->min('original_price');
                $origMax = $sizes->max('original_price');
                $minPrice = $sizes->min('price');
                $maxPrice = $sizes->max('price');

                $originalEffective = $m->has_sizes && $origMin !== null ? (float) $origMin : (float) $m->price;
                $effectivePrice = $m->has_sizes && $minPrice !== null ? (float) $minPrice : $m->applyPromoPrice((float) $m->price);

                $originalPriceFormatted = $m->has_sizes && $origMin !== null
                    ? ($origMin == $origMax
                        ? '₱'.$formatNum((float) $origMin)
                        : '₱'.$formatNum((float) $origMin).' - ₱'.$formatNum((float) $origMax))
                    : '₱'.$formatNum((float) $m->price);

                $priceFormatted = $m->has_sizes && $minPrice !== null
                    ? ($minPrice == $maxPrice
                        ? '₱'.$formatNum((float) $minPrice)
                        : '₱'.$formatNum((float) $minPrice).' - ₱'.$formatNum((float) $maxPrice))
                    : '₱'.$formatNum($effectivePrice);

                return [
                    'id' => $m->id,
                    'name' => $m->name,
                    'category' => $m->category,
                    'subcategory' => $m->subcategory,
                    'original_price' => $originalEffective,
                    'original_price_formatted' => $originalPriceFormatted,
                    'price' => $effectivePrice,
                    'price_formatted' => $priceFormatted,
                    'promo_active' => $promoActive,
                    'promo_discount_percent' => $promoActive ? (float) $m->promo_discount_percent : null,
                    'promo_label' => $promoActive ? ($m->promo_label ?: "Today's Special") : null,
                    'available' => $itemAvailable,
                    'stockOk' => $stockOk,
                    'stockReason' => $stockReason,
                    'has_sizes' => (bool) $m->has_sizes,
                    'sizes' => $sizes,
                    'ingredients' => $ingredients,
                ];
            })
            ->values();

        return response()->json(['data' => $items]);
    }

    private function transform(Order $o): array
    {
        $itemsLabel = $o->items->map(function ($i) {
            $removedNames = collect($i->removed_ingredients ?? [])
                ->map(fn ($r) => is_array($r) ? ($r['name'] ?? null) : (is_string($r) ? $r : null))
                ->filter()
                ->values();
            $removedSuffix = $removedNames->isNotEmpty()
                ? ' (Without: '.$removedNames->implode(', ').')'
                : '';
            $noteSuffix = ! empty($i->special_instructions)
                ? ' [Note: '.$i->special_instructions.']'
                : '';

            return $i->qty.'x '.$i->name.$removedSuffix.$noteSuffix;
        })->implode(', ');
        $isOnline = $o->order_type === 'Online Order';

        $action = match ($o->status) {
            'Pending' => 'Confirm',
            'Preparing' => 'Mark Ready',
            'Ready' => $isOnline ? ($o->driver_id ? 'Track' : 'Dispatch') : 'Complete',
            'Out for Delivery' => $isOnline ? 'Track' : 'View',
            'Completed' => 'View',
            default => 'View',
        };

        return [
            'id' => $o->order_code,
            'db_id' => $o->id,
            'customer' => $o->customer_name,
            'type' => $o->order_type,
            'items' => $itemsLabel,
            'items_list' => $o->items->map(fn ($i) => [
                'id' => $i->id,
                'name' => $i->name,
                'size' => $i->size,
                'qty' => (int) $i->qty,
                'unit_price' => (float) $i->unit_price,
                'line_total' => (float) $i->line_total,
                'removed_ingredients' => $i->removed_ingredients ?? [],
                'special_instructions' => $i->special_instructions ?? null,
            ])->values(),
            'price' => (float) $o->total,
            'status' => $o->status,
            'cancellation_reason' => $o->cancellation_reason,
            'inventory_deducted' => (bool) $o->inventory_deducted,
            'action' => $action,
            'address' => $o->delivery_address,
            'loyalty_customer_id' => $o->loyalty_customer_id,
            'points_used' => (int) ($o->points_used ?? 0),
            'points_discount' => (float) ($o->points_discount ?? 0),
            'estimated_delivery_minutes' => (int) ($o->estimated_delivery_minutes ?: $o->delivery_minutes ?: 0),
            'late_minutes' => (int) ($o->late_minutes ?? 0),
            'late_discount_percent' => (int) ($o->late_discount_percent ?? 0),
            'late_discount' => (float) ($o->late_discount ?? 0),
            'created_at' => $o->created_at?->toIso8601String(),
            'delivered_at' => $o->delivered_at?->toIso8601String(),
            'reported_issues' => $o->reportedIssues(),
        ];
    }
}
