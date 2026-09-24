<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\ExportedReport;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
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
                'customer' => $o->customer_name ?: ($o->customer?->full_name ?? 'Customer'),
                'items_sold' => $itemsSummary ?: 'No items listed',
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
                'customer' => $o->customer_name ?: ($o->customer?->full_name ?? 'Customer'),
                'driver' => $o->driver?->name ?? 'Unassigned',
                'rider' => $o->driver?->name ?? 'Unassigned',
                'datetime' => $o->created_at?->format('Y-m-d') ?? now()->format('Y-m-d'),
                'time' => $o->delivery_minutes ? $o->delivery_minutes.' mins' : '-- mins',
                'distance' => $o->delivery_distance_km ? $o->delivery_distance_km.' km' : '-- km',
                'status' => $o->status ?: 'Preparing',
            ]);

        $customers = Customer::query()
            ->withCount(['orders as completed_orders_count' => function ($q) {
                $q->whereIn('status', ['Completed', 'Delivered']);
            }])
            ->withSum(['orders as completed_orders_sum' => function ($q) {
                $q->whereIn('status', ['Completed', 'Delivered']);
            }], 'total')
            ->withMax('orders as last_order_date', 'created_at')
            ->latest('id')
            ->take(50)
            ->get()
            ->map(function (Customer $c) {
                $count = (int) ($c->completed_orders_count ?? 0);
                $spent = (float) ($c->completed_orders_sum ?? 0);
                $pts = (int) round($spent / 2);
                $freq = $count >= 15 ? 'Frequent' : ($count >= 5 ? 'Regular' : 'New');
                $lastDate = $c->last_order_date ? Carbon::parse($c->last_order_date)->format('Y-m-d') : '—';

                return [
                    'id' => $c->id,
                    'name' => $c->full_name,
                    'orders' => $count.' orders',
                    'orders_count' => $count,
                    'spent' => $spent,
                    'points' => $pts.' pts',
                    'last' => $lastDate,
                    'freq' => $freq,
                ];
            });

        $topItems = app(\App\Services\TopSellingService::class)->getTopSelling(10)->map(fn ($i) => [
            'id' => $i['id'],
            'name' => $i['name'],
            'category' => $i['category'],
            'units' => $i['units'],
            'units_sold' => $i['units_sold'],
            'price' => $i['price'],
            'image' => $i['image'],
            'change' => $i['change'] ?? '—',
        ])->values();

        $exports = ExportedReport::query()->latest('created_at')->take(10)->get()->map(fn ($e) => [
            'id' => $e->id,
            'name' => $e->name,
            'date' => $e->created_at?->format('M d, Y'),
            'size' => $e->size ?: '1.0 MB',
            'format' => $e->format,
            'type' => $e->type ?? $e->format,
            'role' => $e->role ?? 'admin',
            'created_at' => $e->created_at?->toISOString(),
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

    public function customers(Request $request)
    {
        $perPage = (int) $request->query('per_page', 5);
        $search = trim((string) $request->query('search', ''));
        $statusFilter = trim((string) $request->query('status', ''));

        $query = Customer::query()
            ->withCount(['orders as completed_orders_count' => function ($q) {
                $q->whereIn('status', ['Completed', 'Delivered']);
            }])
            ->withSum(['orders as completed_orders_sum' => function ($q) {
                $q->whereIn('status', ['Completed', 'Delivered']);
            }], 'total')
            ->withMax('orders as last_order_date', 'created_at');

        if ($search !== '') {
            $query->where('full_name', 'like', "%{$search}%");
        }

        if ($statusFilter !== '' && strtolower($statusFilter) !== 'all' && strtolower($statusFilter) !== 'all customers') {
            $norm = strtolower($statusFilter);
            if ($norm === 'frequent') {
                $query->whereHas('orders', function ($q) {
                    $q->whereIn('status', ['Completed', 'Delivered']);
                }, '>=', 15);
            } elseif ($norm === 'regular') {
                $query->whereHas('orders', function ($q) {
                    $q->whereIn('status', ['Completed', 'Delivered']);
                }, '>=', 5)
                ->whereHas('orders', function ($q) {
                    $q->whereIn('status', ['Completed', 'Delivered']);
                }, '<', 15);
            } elseif ($norm === 'new') {
                $query->whereHas('orders', function ($q) {
                    $q->whereIn('status', ['Completed', 'Delivered']);
                }, '<', 5);
            }
        }

        $paginated = $query->latest('id')->paginate($perPage);

        $items = collect($paginated->items())->map(function (Customer $c) {
            $count = (int) ($c->completed_orders_count ?? 0);
            $spent = (float) ($c->completed_orders_sum ?? 0);
            $pts = (int) round($spent / 2);
            $freq = $count >= 15 ? 'Frequent' : ($count >= 5 ? 'Regular' : 'New');
            $lastDate = $c->last_order_date ? Carbon::parse($c->last_order_date)->format('Y-m-d') : '—';

            return [
                'id' => $c->id,
                'name' => $c->full_name,
                'orders' => $count.' orders',
                'orders_count' => $count,
                'spent' => $spent,
                'points' => $pts.' pts',
                'last' => $lastDate,
                'freq' => $freq,
            ];
        });

        return response()->json([
            'data' => $items,
            'current_page' => $paginated->currentPage(),
            'last_page' => $paginated->lastPage(),
            'per_page' => $paginated->perPage(),
            'total' => $paginated->total(),
        ]);
    }

    public function generate(Request $request)
    {
        $data = $request->validate([
            'period' => ['required', 'string'],
            'format_type' => ['required', 'string'],
            'export_as' => ['required', 'string'],
            'size' => ['nullable', 'string'],
        ]);

        $ext = match (strtolower($data['export_as'])) {
            'excel', 'xlsx' => 'xlsx',
            'csv' => 'csv',
            default => 'pdf',
        };
        $report = ExportedReport::query()->create([
            'name' => str_replace(' ', '_', $data['format_type']).'_'.$data['period'].'.'.$ext,
            'format' => strtoupper($data['export_as']),
            'size' => $data['size'] ?? '1.2 MB',
            'type' => $data['format_type'],
            'role' => $request->user()?->role ?? 'admin',
        ]);

        return response()->json([
            'data' => [
                'id' => $report->id,
                'name' => $report->name,
                'date' => $report->created_at?->format('M d, Y'),
                'size' => $report->size,
                'format' => $report->format,
                'type' => $report->type,
                'role' => $report->role,
                'created_at' => $report->created_at?->toISOString(),
            ],
        ], 201);
    }

    public function logExport(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string'],
            'format' => ['nullable', 'string'],
            'size' => ['nullable', 'string'],
            'type' => ['nullable', 'string'],
        ]);

        $role = $request->user()?->role ?? 'admin';
        $format = strtoupper($data['format'] ?? pathinfo($data['name'], PATHINFO_EXTENSION) ?: 'PDF');

        $report = ExportedReport::query()->create([
            'name' => $data['name'],
            'format' => $format,
            'size' => $data['size'] ?? '1.0 MB',
            'type' => $data['type'] ?? $format,
            'role' => $role,
        ]);

        return response()->json([
            'message' => 'Export logged successfully',
            'data' => [
                'id' => $report->id,
                'name' => $report->name,
                'date' => $report->created_at?->format('M d, Y'),
                'size' => $report->size,
                'format' => $report->format,
                'type' => $report->type,
                'role' => $report->role,
                'created_at' => $report->created_at?->toISOString(),
            ],
        ], 201);
    }

    public function destroy(ExportedReport $report)
    {
        $report->delete();

        return response()->json(['message' => 'Report deleted successfully']);
    }
}
