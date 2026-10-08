<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Customer;
use App\Models\MenuItem;
use App\Models\Notification;
use App\Models\Order;
use App\Models\OrderItem;
use App\Services\InventoryDeductionService;
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

    public function store(Request $request)
    {
        $data = $request->validate([
            'customer_name' => ['required', 'string'],
            'order_type' => ['required', 'string', 'in:Dine-in,Takeout'],
            'status' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.name' => ['required', 'string'],
            'items.*.menu_item_id' => ['nullable', 'integer'],
            'items.*.size' => ['nullable', 'string'],
            'items.*.qty' => ['required', 'integer', 'min:1'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
            'delivery_address' => ['nullable', 'string'],
        ]);

        $service = app(InventoryDeductionService::class);
        $service->validateCartAvailability($data['items']);

        /**
         * PROMPT INVESTIGATION REPORT: Order ID Sequencing
         *
         * Previously, order IDs were calculated via `count() + 21`, which is not thread-safe
         * under concurrent requests. Order IDs are now generated via a true database
         * auto-increment column (`order_sequences`), zero-padded to 5 digits: #ORD-00028.
         */
        $order = DB::transaction(function () use ($data) {
            $total = collect($data['items'])->sum(fn ($i) => $i['qty'] * $i['unit_price']);

            $order = Order::query()->create([
                'order_code' => Order::generateOrderCode(),
                'customer_id' => null,
                'customer_name' => $data['customer_name'],
                'order_type' => $data['order_type'],
                'total' => $total,
                'status' => $data['status'] ?? 'Preparing',
                'payment_method' => 'COD',
                'payment_status' => 'Paid',
                'delivery_address' => $data['delivery_address'] ?? null,
            ]);

            foreach ($data['items'] as $item) {
                $hasSizeInName = ! empty($item['size']) && str_contains($item['name'], '('.$item['size'].')');
                $name = ! empty($item['size']) && ! $hasSizeInName
                    ? $item['name'].' ('.$item['size'].')'
                    : $item['name'];

                OrderItem::query()->create([
                    'order_id' => $order->id,
                    'menu_item_id' => $item['menu_item_id'] ?? null,
                    'name' => $name,
                    'size' => $item['size'] ?? null,
                    'qty' => $item['qty'],
                    'unit_price' => $item['unit_price'],
                    'line_total' => $item['qty'] * $item['unit_price'],
                ]);
            }

            ActivityLog::query()->create([
                'actor' => 'Admin',
                'action' => 'Created order '.$order->order_code,
            ]);

            app(InventoryDeductionService::class)->deductForOrder($order);

            Notification::createOrderNotification($order);

            return $order->load('items');
        });

        return response()->json(['data' => $this->transform($order)], 201);
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
        }

        $previous = $order->status;
        $updatePayload = ['status' => $data['status']];
        if ($data['status'] === 'Cancelled' && ! empty($data['cancellation_reason'])) {
            $updatePayload['cancellation_reason'] = $data['cancellation_reason'];
        }

        if (in_array($data['status'], ['Completed', 'Delivered'], true)) {
            if ($order->order_type === 'Online Order') {
                $updatePayload['delivered_at'] = $order->delivered_at ?? now();
            }
            $updatePayload['payment_status'] = 'Paid';
        }
        $order->update($updatePayload);

        if ($data['status'] === 'Cancelled' && $previous !== 'Cancelled') {
            app(InventoryDeductionService::class)->restockForOrder($order);
        }

        if ($data['status'] !== $previous) {
            Notification::createOrderNotification($order);
        }

        return response()->json(['data' => $this->transform($order->load('items'))]);
    }

    public function menuOptions()
    {
        $service = app(InventoryDeductionService::class);
        $service->syncMenuAvailability();

        $items = MenuItem::query()
            ->with(['sizes', 'ingredients.inventoryItem'])
            ->where('archived', false)
            ->where('available', true)
            ->orderBy('name')
            ->get()
            ->filter(fn (MenuItem $m) => $service->canServe($m))
            ->map(function (MenuItem $m) {
                $sizes = $m->sizes->map(fn ($s) => [
                    'name' => $s->name,
                    'price' => (float) $s->price,
                ])->values();

                $minPrice = $sizes->min('price');
                $maxPrice = $sizes->max('price');
                $effectivePrice = $m->has_sizes && $minPrice !== null ? (float) $minPrice : (float) $m->price;

                $priceFormatted = $m->has_sizes && $minPrice !== null
                    ? ($minPrice == $maxPrice
                        ? '₱'.number_format($minPrice, 0)
                        : '₱'.number_format($minPrice, 0).' - ₱'.number_format($maxPrice, 0))
                    : '₱'.number_format((float) $m->price, 0);

                return [
                    'id' => $m->id,
                    'name' => $m->name,
                    'category' => $m->category,
                    'subcategory' => $m->subcategory,
                    'price' => $effectivePrice,
                    'price_formatted' => $priceFormatted,
                    'has_sizes' => (bool) $m->has_sizes,
                    'sizes' => $sizes,
                ];
            })
            ->values();

        return response()->json(['data' => $items]);
    }

    private function transform(Order $o): array
    {
        $itemsLabel = $o->items->map(fn ($i) => $i->qty.'x '.$i->name)->implode(', ');
        $isOnline = $o->order_type === 'Online Order';

        $action = match ($o->status) {
            'Pending' => 'Confirm',
            'Preparing' => 'Mark Ready',
            'Ready' => $isOnline ? 'Track' : 'Complete',
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
            'price' => (float) $o->total,
            'status' => $o->status,
            'cancellation_reason' => $o->cancellation_reason,
            'inventory_deducted' => (bool) $o->inventory_deducted,
            'action' => $action,
            'address' => $o->delivery_address,
            'created_at' => $o->created_at?->toIso8601String(),
        ];
    }
}
