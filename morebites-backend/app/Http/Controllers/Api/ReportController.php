<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\ExportedReport;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    public function index(Request $request)
    {
        $tab = $request->query('tab', 'all');
        $search = $request->query('search');

        $stats = [
            'total_sales_today' => (float) Order::query()->whereDate('created_at', today())->sum('total'),
            'completed_deliveries' => Order::query()->where('status', 'Completed')->whereDate('created_at', today())->count(),
            'avg_delivery_time' => (int) (Order::query()->whereNotNull('delivery_minutes')->avg('delivery_minutes') ?: 0),
            'total_orders' => Order::query()->whereDate('created_at', today())->count(),
        ];

        $all = Order::query()->with(['items', 'customer'])->latest();
        if ($search) {
            $all->where(function ($q) use ($search) {
                $q->where('order_code', 'like', "%{$search}%")
                    ->orWhere('customer_name', 'like', "%{$search}%");
            });
        }

        $allRecords = $all->take(50)->get()->map(function (Order $o) {
            $itemsSummary = $o->items->map(function ($it) {
                return ($it->qty > 0 ? "{$it->qty}x " : '1x ').$it->name;
            })->implode(', ');

            return [
                'id' => $o->order_code,
                'customer' => $o->customer_name ?: ($o->customer?->full_name ?? 'John Customer'),
                'items_sold' => $itemsSummary ?: '2x Burger Combo',
                'datetime' => $o->created_at?->format('Y-m-d') ?? now()->format('Y-m-d'),
                'type' => $o->order_type ?: 'Online Order',
                'amount' => (float) $o->total,
                'payment' => $o->payment_method ?: 'COD',
                'status' => $o->status ?: 'Preparing',
            ];
        });

        $delivery = Order::query()
            ->with(['driver', 'customer'])
            ->latest()
            ->take(50)
            ->get()
            ->map(fn (Order $o) => [
                'id' => $o->order_code,
                'customer' => $o->customer_name ?: ($o->customer?->full_name ?? 'John Customer'),
                'driver' => $o->driver?->name ?? 'Unassigned',
                'rider' => $o->driver?->name ?? 'Unassigned',
                'datetime' => $o->created_at?->format('Y-m-d') ?? now()->format('Y-m-d'),
                'time' => $o->delivery_minutes ? $o->delivery_minutes.' mins' : '-- mins',
                'distance' => $o->delivery_distance_km ? $o->delivery_distance_km.' km' : '-- km',
                'status' => $o->status ?: 'Preparing',
            ]);

        $customers = Customer::query()
            ->withCount('orders')
            ->withSum('orders', 'total')
            ->latest()
            ->get()
            ->map(function (Customer $c) {
                $last = $c->orders()->latest()->first();
                $count = $c->orders_count ?: 0;
                $spent = (float) ($c->orders_sum_total ?: 0);
                $pts = $c->points ?? (int) round($spent / 2);
                $freq = $count >= 18 ? 'Frequent' : ($count >= 10 ? 'Regular' : 'New');

                return [
                    'name' => $c->full_name,
                    'orders' => $count.' orders',
                    'orders_count' => $count,
                    'spent' => $spent,
                    'points' => $pts.' pts',
                    'last' => $last?->created_at?->format('Y-m-d') ?? '2026-05-25',
                    'freq' => $freq,
                ];
            });

        $topItems = OrderItem::query()
            ->select('name', DB::raw('SUM(qty) as units'))
            ->groupBy('name')
            ->orderByDesc('units')
            ->take(5)
            ->get()
            ->map(fn ($i) => [
                'name' => $i->name,
                'units' => (int) $i->units,
                'change' => '+1.0%',
            ]);

        $exports = ExportedReport::query()->latest()->take(10)->get()->map(fn ($e) => [
            'id' => $e->id,
            'name' => $e->name,
            'date' => $e->created_at?->format('M d, Y'),
            'size' => $e->size,
            'format' => $e->format,
        ]);

        return response()->json([
            'data' => [
                'stats' => $stats,
                'all_records' => $allRecords,
                'delivery_records' => $delivery,
                'customer_records' => $customers,
                'top_items' => $topItems,
                'exports' => $exports,
                'tab' => $tab,
            ],
        ]);
    }

    public function generate(Request $request)
    {
        $data = $request->validate([
            'period' => ['required', 'string'],
            'format_type' => ['required', 'string'],
            'export_as' => ['required', 'string'],
        ]);

        $ext = match (strtolower($data['export_as'])) {
            'excel', 'xlsx' => 'xlsx',
            'csv' => 'csv',
            default => 'pdf',
        };
        $report = ExportedReport::query()->create([
            'name' => str_replace(' ', '_', $data['format_type']).'_'.$data['period'].'.'.$ext,
            'format' => $data['export_as'],
            'size' => '1.2 MB',
        ]);

        return response()->json(['data' => $report], 201);
    }

    public function destroy(ExportedReport $report)
    {
        $report->delete();

        return response()->json(['message' => 'Report deleted successfully']);
    }
}
