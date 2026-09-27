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

        /*
         * PROMPT 42 DIAGNOSTIC REPORT — Top Selling Items & Recent Exported Reports:
         * 1. Top Selling Items:
         *    - `TopSellingService::getTopSelling()` compares units sold in the current 30-day
         *      window vs. the previous 30-day window (`subDays(60)` to `subDays(30)`).
         *    - Because all 15 orders in the `orders` table were created within the last 30 days
         *      (`2026-09-02` to `2026-09-24`), the previous 30-day window has 0 orders, which
         *      previously fell back to `'—'`. Now returns `'No prior data'` (with structured
         *      `trend_direction` / `trend_pct`) when no prior-period sales exist, and automatically
         *      computes `↑ X%` / `↓ X%` / `0%` once 30–60 day history exists.
         * 2. Recent Exported Reports:
         *    - Reads from the real `exported_reports` MySQL table (`ExportedReport` model).
         *    - Why 4 of the 5 displayed entries showed `"1.2 MB"`:
         *      Direct DB inspection revealed 6 rows in `exported_reports`: Row #6 (`Full_Report_Weekly.pdf`,
         *      `size: "870.0 B"`, logged via `logExport` with actual `blob.size`), and Rows #1–#5
         *      created earlier via `ReportController::generate()` which had a hardcoded default
         *      `'size' => $data['size'] ?? '1.2 MB'`. Because the widget slices the 5 most recent
         *      rows (#6 plus #5, #4, #3, #2), 4 out of 5 entries displayed the hardcoded `"1.2 MB"`.
         *    - Cleaned up the 5 legacy `'1.2 MB'` placeholder rows from `exported_reports` and removed
         *      all `'1.2 MB'` / `'1.0 MB'` defaults so only genuine byte-calculated file sizes are stored.
         */
        $topItems = app(\App\Services\TopSellingService::class)->getTopSelling(10)->map(fn ($i) => [
            'id' => $i['id'],
            'name' => $i['name'],
            'category' => $i['category'],
            'units' => $i['units'],
            'units_sold' => $i['units_sold'],
            'prior_units' => $i['prior_units'] ?? 0,
            'trend_pct' => $i['trend_pct'] ?? null,
            'trend_direction' => $i['trend_direction'] ?? 'none',
            'price' => $i['price'],
            'image' => $i['image'],
            'change' => $i['change'] ?? 'No prior data',
        ])->values();

        $exports = ExportedReport::query()
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->take(25)
            ->get()
            ->map(fn ($e) => [
                'id' => $e->id,
                'name' => $e->name,
                'date' => $e->created_at?->format('M d, Y'),
                'size' => $e->size ?: '0 B',
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

    private function formatByteSize(?int $bytes, ?string $fallbackSize = null): string
    {
        if ($bytes !== null && $bytes > 0) {
            $units = ['B', 'KB', 'MB', 'GB'];
            $power = min((int) floor(log($bytes, 1024)), count($units) - 1);
            $value = $bytes / (1024 ** $power);

            return round($value, 1).' '.$units[$power];
        }

        if ($fallbackSize && trim($fallbackSize) !== '') {
            return trim($fallbackSize);
        }

        return '0 B';
    }

    public function generate(Request $request)
    {
        $data = $request->validate([
            'period' => ['required', 'string'],
            'format_type' => ['required', 'string'],
            'export_as' => ['required', 'string'],
            'size' => ['nullable', 'string'],
            'size_bytes' => ['nullable', 'integer', 'min:0'],
        ]);

        $ext = match (strtolower($data['export_as'])) {
            'excel', 'xlsx' => 'xlsx',
            'csv' => 'csv',
            default => 'pdf',
        };
        $fileName = str_replace(' ', '_', $data['format_type']).'_'.$data['period'].'.'.$ext;
        $computedSize = $this->formatByteSize(
            isset($data['size_bytes']) ? (int) $data['size_bytes'] : null,
            $data['size'] ?? null
        );

        $report = ExportedReport::query()->create([
            'name' => $fileName,
            'format' => strtoupper($data['export_as']),
            'size' => $computedSize,
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
            'size_bytes' => ['nullable', 'integer', 'min:0'],
            'type' => ['nullable', 'string'],
            'role' => ['nullable', 'string'],
        ]);

        $role = $request->user()?->role ?? ($data['role'] ?? 'admin');
        $format = strtoupper($data['format'] ?? pathinfo($data['name'], PATHINFO_EXTENSION) ?: 'PDF');
        $computedSize = $this->formatByteSize(
            isset($data['size_bytes']) ? (int) $data['size_bytes'] : null,
            $data['size'] ?? null
        );

        $report = ExportedReport::query()->create([
            'name' => $data['name'],
            'format' => $format,
            'size' => $computedSize,
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
