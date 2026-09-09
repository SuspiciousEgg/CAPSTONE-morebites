<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Customer;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Services\InventoryDeductionService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OrderController extends Controller
{
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

        $stats = [
            'total' => Order::query()->whereDate('created_at', today())->count(),
            'completed' => Order::query()->whereDate('created_at', today())->where('status', 'Completed')->count(),
            'pending' => Order::query()->whereDate('created_at', today())->where('status', 'Pending')->count(),
            'delivery' => Order::query()->whereDate('created_at', today())->where('status', 'Out for Delivery')->count(),
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
            'items.*.qty' => ['required', 'integer', 'min:1'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
            'delivery_address' => ['nullable', 'string'],
        ]);

        $service = app(InventoryDeductionService::class);
        foreach ($data['items'] as $line) {
            if (! empty($line['menu_item_id'])) {
                $menu = MenuItem::query()->find($line['menu_item_id']);
                if ($menu) {
                    $reason = $service->unserviceableReason($menu, (int) $line['qty']);
                    if ($reason === 'expired') {
                        throw ValidationException::withMessages([
                            'items' => ["The item '{$menu->name}' cannot be ordered because one or more ingredients are expired."],
                        ]);
                    }
                    if ($reason === 'insufficient' || ! $menu->available) {
                        throw ValidationException::withMessages([
                            'items' => ["The item '{$menu->name}' is currently unavailable."],
                        ]);
                    }
                }
            }
        }

        $order = DB::transaction(function () use ($data) {
            $total = collect($data['items'])->sum(fn ($i) => $i['qty'] * $i['unit_price']);
            $code = 'ORD-'.str_pad((string) (Order::query()->count() + 21), 5, '0', STR_PAD_LEFT);

            $customer = Customer::query()->firstOrCreate(
                ['full_name' => $data['customer_name']],
                [
                    'customer_code' => 'C001-'.str_pad((string) (Customer::query()->count() + 1), 5, '0', STR_PAD_LEFT),
                    'status' => 'ACTIVE',
                    'registered_at' => now(),
                ]
            );

            $order = Order::query()->create([
                'order_code' => '#'.$code,
                'customer_id' => $customer->id,
                'customer_name' => $data['customer_name'],
                'order_type' => $data['order_type'],
                'total' => $total,
                'status' => $data['status'] ?? 'Preparing',
                'payment_method' => 'COD',
                'payment_status' => 'Paid',
                'delivery_address' => $data['delivery_address'] ?? null,
            ]);

            foreach ($data['items'] as $item) {
                OrderItem::query()->create([
                    'order_id' => $order->id,
                    'menu_item_id' => $item['menu_item_id'] ?? null,
                    'name' => $item['name'],
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

            return $order->load('items');
        });

        return response()->json(['data' => $this->transform($order)], 201);
    }

    public function updateStatus(Request $request, Order $order)
    {
        $data = $request->validate([
            'status' => ['required', 'string'],
        ]);

        $previous = $order->status;
        $order->update(['status' => $data['status']]);

        if ($data['status'] === 'Cancelled' && $previous !== 'Cancelled') {
            app(InventoryDeductionService::class)->restockForOrder($order);
        }

        return response()->json(['data' => $this->transform($order->load('items'))]);
    }

    public function menuOptions()
    {
        $service = app(InventoryDeductionService::class);
        $items = MenuItem::query()
            ->with(['sizes', 'ingredients.inventoryItem'])
            ->where('archived', false)
            ->where('available', true)
            ->orderBy('name')
            ->get()
            ->filter(fn (MenuItem $m) => $service->canServe($m))
            ->map(fn (MenuItem $m) => [
                'id' => $m->id,
                'name' => $m->name,
                'category' => $m->category,
                'price' => (float) $m->price,
                'has_sizes' => $m->has_sizes,
                'sizes' => $m->sizes->map(fn ($s) => [
                    'name' => $s->name,
                    'price' => (float) $s->price,
                ]),
            ])
            ->values();

        return response()->json(['data' => $items]);
    }

    private function transform(Order $o): array
    {
        $itemsLabel = $o->items->map(fn ($i) => $i->qty.'x '.$i->name)->implode(', ');

        $action = match ($o->status) {
            'Pending' => 'Confirm',
            'Preparing' => 'Mark Ready',
            'Ready', 'Out for Delivery' => 'Track',
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
            'action' => $action,
            'address' => $o->delivery_address,
            'created_at' => $o->created_at?->toIso8601String(),
        ];
    }
}
