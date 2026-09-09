<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    public function index(Request $request)
    {
        $query = Customer::query()->withCount('orders')->withSum('orders', 'total')->latest('registered_at');

        if ($status = $request->query('status')) {
            if ($status !== 'All Status') {
                $query->where('status', $status);
            }
        }
        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('full_name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('customer_code', 'like', "%{$search}%");
            });
        }

        $customers = $query->get()->map(fn (Customer $c) => $this->transform($c));

        return response()->json([
            'data' => $customers,
            'meta' => [
                'stats' => [
                    'total' => Customer::query()->count(),
                    'active' => Customer::query()->where('status', 'ACTIVE')->count(),
                    'new_month' => Customer::query()->where('registered_at', '>=', now()->copy()->startOfMonth())->count(),
                    'frequent' => Customer::query()->withCount('orders')->get()->filter(fn ($c) => $c->orders_count >= 15)->count(),
                ],
            ],
        ]);
    }

    public function show(Customer $customer)
    {
        $customer->load(['orders' => fn ($q) => $q->with('items')->latest()->take(10)]);
        $customer->loadCount('orders');
        $customer->loadSum('orders', 'total');

        $history = $customer->orders->map(fn ($o) => [
            'id' => $o->order_code,
            'datetime' => $o->created_at?->format('M d, Y h:i A'),
            'items' => $o->items->sum('qty').' items',
            'total' => (float) $o->total,
            'status' => $o->status === 'Completed' ? 'Delivered' : $o->status,
        ]);

        return response()->json([
            'data' => [
                ...$this->transform($customer),
                'order_history' => $history,
            ],
        ]);
    }

    private function transform(Customer $c): array
    {
        $last = $c->relationLoaded('orders')
            ? $c->orders->first()
            : $c->orders()->latest()->first();

        return [
            'id' => $c->customer_code,
            'db_id' => $c->id,
            'name' => $c->full_name,
            'phone' => $c->phone,
            'email' => $c->email,
            'address' => $c->delivery_address,
            'registered' => $c->registered_at?->format('M d, Y'),
            'registeredFull' => $c->registered_at?->format('M d, Y h:i A'),
            'orders' => $c->orders_count ?? $c->orders()->count(),
            'spent' => (float) ($c->orders_sum_total ?? 0),
            'lastOrder' => $last?->created_at?->format('M d, Y') ?? '-',
            'status' => $c->status,
        ];
    }
}
