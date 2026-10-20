<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\InventoryItem;
use App\Models\Notification;
use App\Models\Order;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    /**
     * PROMPT 37 & SALES OVERVIEW SYNC DIAGNOSTIC REPORT:
     * 1. Endpoint & Data Source Comparison:
     *    - Every Dashboard panel (Total Sales stat card, New Orders stat card, Active Driver stat card,
     *      Low Stock Alert stat card, Sales Overview chart, Activity Log, Order Breakdown donut chart,
     *      and Live Orders Queue) reads from the single `GET /api/dashboard` endpoint (`DashboardController::index`).
     *    - However, inside `DashboardController::index`, the Sales Overview chart (`$completedSalesOrders`) had its
     *      own separate query and hour-bucketing logic that diverged from the Total Sales stat card (`$totalSales`):
     *      a) Status Mismatch (`Completed` vs `['Completed', 'Delivered']`):
     *         `$totalSales` and `$completedSalesOrders` filtered strictly by `->where('status', 'Completed')`,
     *         whereas `ReportController` and `OrderController::updateStatus` treat both `'Completed'` and `'Delivered'`
     *         as completed revenue statuses.
     *      b) Timestamp Column Mismatch (`created_at` vs completion timestamp `delivered_at ?? updated_at`):
     *         Orders placed on a previous day (or earlier in the day) and marked `'Completed'`/`'Delivered'` today
     *         have `delivered_at` / `updated_at` in today's `Asia/Manila` window, or orders placed today have
     *         `created_at` in today's `Asia/Manila` window.
     *      c) Hour Window Clipping (`From 8:00 AM` / `To 8:00 PM` + off-by-one `$endHour - 1`):
     *         While `$totalSales`, `$totalOrders`, `$orderStatus`, and `$recentOrders` queried the full 24-hour
     *         Philippine day (`00:00:00` to `23:59:59 Asia/Manila`), the Daily Sales Overview chart generated slots
     *         only for `$defaultStart = 8` through `$effectiveEnd = $endHour - 1` (`8 AM` to `7 PM`) and discarded any
     *         sales occurring at `8 PM` (`$endHour`), late night (`9 PM`–`11 PM`), or early morning (`12 AM`–`7 AM`).
     *         Even worse, when an order was completed at `8:15 PM` or `10:00 PM` PHT, the `Total Sales` stat card showed
     *          the sale (e.g. `₱450.00`), while every slot in `d.sales` (`8 AM`–`7 PM`) remained `0`, causing the frontend
     *         `hasSales` check (`displaySalesData.some(item => Number(item.v) > 0)`) to evaluate to `false` and cover the
     *         chart with the EmptyState overlay ("No sales yet today") even though Total Sales was non-zero!
     *      d) Fixed `[0, 30000]` YAxis Scale Hiding Real Sales Bars:
     *         In `SuperAdminDashboard.jsx`, the chart hardcoded `domain={[0, 30000]}` with ticks `[0, 6000, ..., 30000]`.
     *         For typical food orders of `₱100`–`₱450`, a bar height of `150 / 30000` is `0.5%` of 220px (~1 pixel tall),
     *         making real sales bars visually invisible on the chart.
     * 2. Empty-State Pattern Check:
     *    - The Sales Overview chart uses the clean `<EmptyState icon="chart" ... />` overlay (`.sa-chart-empty-overlay`)
     *      with no dashed border (`border: none`). This `<EmptyState />` icon-and-text pattern is preserved for when
     *      there are genuinely zero sales today.
     * 3. Fix Implemented:
     *    - Unified `$todayCompletedOrdersQuery` so both the `Total Sales` stat card and the `Daily` Sales Overview chart
     *      derive from the exact same today-scoped (`Asia/Manila`) completed orders (`whereIn('status', ['Completed', 'Delivered'])`).
     *    - Included inclusive `startHour` to `endHour` slots (`$h <= $endHour`, so `To 8:00 PM` includes the `8 PM` slot)
     *      and automatically expanded the Daily slot range to include the Manila hour of any completed order today that
     *      falls outside the default `From`/`To` dropdown bounds so today's chart bars always sum to `Total Sales`.
     *    - Updated the frontend `YAxis` domain and tick formatter to scale dynamically to the actual sales amounts when
     *      sales are present while keeping the clean `₱0`–`₱30K` backdrop when sales are zero.
     */
    public function index(Request $request)
    {
        $period = $request->query('period', 'Daily');
        $fromTime = $request->query('from_time', $request->query('fromTime', $request->query('from_hour')));
        $toTime = $request->query('to_time', $request->query('toTime', $request->query('to_hour')));

        $manilaNow = Carbon::now('Asia/Manila');
        $todayStartUtc = $manilaNow->copy()->startOfDay()->setTimezone('UTC');
        $todayEndUtc = $manilaNow->copy()->endOfDay()->setTimezone('UTC');

        $todayOrders = Order::query()
            ->realOrderCodes()
            ->whereBetween('created_at', [$todayStartUtc, $todayEndUtc]);

        $todayCompletedOrders = (clone $todayOrders)
            ->whereIn('status', ['Completed', 'Delivered'])
            ->orderBy('created_at')
            ->get(['id', 'order_code', 'total', 'status', 'created_at', 'delivered_at', 'updated_at']);

        // Total sales strictly sums today's Completed/Delivered orders from the shared today query
        $totalSales = (float) $todayCompletedOrders->sum('total');

        $totalOrders = (clone $todayOrders)->count();
        $activeOrders = (clone $todayOrders)->whereIn('status', [
            'Pending', 'Preparing', 'Ready', 'Assigned', 'Picked Up', 'Out for Delivery',
        ])->count();

        // Active driver count matching non-archived active drivers case-insensitively and multi-role drivers
        $activeDrivers = User::query()
            ->where(function ($query) {
                $query->where('role', 'driver')
                    ->orWhereJsonContains('role_access', 'driver');
            })
            ->where('role', '!=', 'super_admin')
            ->whereNull('archived_at')
            ->whereNotIn('status', ['Blacklisted', 'Blocklisted', 'Inactive', 'inactive'])
            ->where(function ($q) {
                $q->whereRaw('LOWER(status) = ?', ['active'])
                    ->orWhere('status', 'Active')
                    ->orWhereNull('status');
            })
            ->count();

        // Low stock alert: non-archived items where status is Low Stock / Out of Stock OR stock <= reorder_level
        $lowStockQuery = InventoryItem::query()
            ->where(function ($q) {
                $q->whereNull('status')
                    ->orWhere('status', '!=', 'Archived');
            })
            ->where(function ($q) {
                $q->whereIn('status', ['Low Stock', 'Out of Stock'])
                    ->orWhereColumn('stock', '<=', 'reorder_level');
            });

        $lowStocksCount = (clone $lowStockQuery)->count();

        // Parse From / To time filters for daily view
        $parseHour = function ($val, ?int $default): ?int {
            if ($val === null || $val === '') return $default;
            if (is_numeric($val)) return (int) $val;
            $clean = preg_replace('/^(from|to)\s+/i', '', trim((string) $val));
            try {
                return (int) Carbon::createFromFormat('g:i A', $clean)->format('G');
            } catch (\Throwable $e) {
                try {
                    return (int) Carbon::parse($clean)->format('G');
                } catch (\Throwable $e2) {
                    return $default;
                }
            }
        };

        $startHour = $parseHour($fromTime, 8); // default 8 AM
        $endHour = $parseHour($toTime, 20);    // default To 8:00 PM (hour 20)
        if ($startHour !== null && $endHour !== null && $startHour > $endHour) {
            [$startHour, $endHour] = [$endHour, $startHour];
        }

        // Determine date boundaries and slot buckets for Sales Overview period
        $periodName = ucfirst(strtolower((string) $period));
        switch ($periodName) {
            case 'Weekly':
                $salesStartUtc = $manilaNow->copy()->startOfWeek()->setTimezone('UTC');
                $salesEndUtc = $manilaNow->copy()->endOfWeek()->setTimezone('UTC');
                $slots = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                break;
            case 'Monthly':
                $salesStartUtc = $manilaNow->copy()->startOfMonth()->setTimezone('UTC');
                $salesEndUtc = $manilaNow->copy()->endOfMonth()->setTimezone('UTC');
                $slots = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
                if ($manilaNow->copy()->endOfMonth()->day > 28) {
                    $slots[] = 'Week 5';
                }
                break;
            case 'Yearly':
                $salesStartUtc = $manilaNow->copy()->startOfYear()->setTimezone('UTC');
                $salesEndUtc = $manilaNow->copy()->endOfYear()->setTimezone('UTC');
                $slots = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                break;
            case 'Daily':
            default:
                $periodName = 'Daily';
                $salesStartUtc = $todayStartUtc;
                $salesEndUtc = $todayEndUtc;
                $slots = [];
                break;
        }

        // Reuse the exact same todayCompletedOrders dataset for Daily so Total Sales and Sales Overview always match
        $completedSalesOrders = $periodName === 'Daily'
            ? $todayCompletedOrders
            : Order::query()
                ->realOrderCodes()
                ->whereBetween('created_at', [$salesStartUtc, $salesEndUtc])
                ->whereIn('status', ['Completed', 'Delivered'])
                ->get(['total', 'created_at']);

        $periodSales = (float) $completedSalesOrders->sum('total');

        $aggregatedSales = [];
        $orderHours = [];
        foreach ($completedSalesOrders as $ord) {
            $dt = Carbon::parse($ord->created_at)->setTimezone('Asia/Manila');
            $total = (float) $ord->total;

            switch ($periodName) {
                case 'Weekly':
                    $key = $dt->format('D'); // Mon, Tue, etc.
                    break;
                case 'Monthly':
                    $day = (int) $dt->format('j');
                    $key = $day <= 7 ? 'Week 1' : ($day <= 14 ? 'Week 2' : ($day <= 21 ? 'Week 3' : ($day <= 28 ? 'Week 4' : 'Week 5')));
                    break;
                case 'Yearly':
                    $key = $dt->format('M'); // Jan, Feb, etc.
                    break;
                case 'Daily':
                default:
                    $key = $dt->format('g A'); // 8 AM, 9 AM, etc.
                    $orderHours[] = (int) $dt->format('G');
                    break;
            }

            $aggregatedSales[$key] = ($aggregatedSales[$key] ?? 0.0) + $total;
        }

        if ($periodName === 'Daily') {
            $defaultStart = $startHour ?? 8;
            $defaultEnd = $endHour ?? 20;
            // Always ensure all hours that have completed sales today are included in the chart slots
            if (! empty($orderHours)) {
                $defaultStart = min($defaultStart, min($orderHours));
                $defaultEnd = max($defaultEnd, max($orderHours));
            }
            if ($defaultStart > $defaultEnd) {
                $defaultStart = $defaultEnd;
            }

            $slots = [];
            for ($h = $defaultStart; $h <= $defaultEnd; $h++) {
                $slots[] = Carbon::today('Asia/Manila')->setHour($h)->format('g A');
            }
        }

        $formattedSales = collect($slots)->map(fn ($slot) => [
            't' => $slot,
            'v' => (float) ($aggregatedSales[$slot] ?? 0.0),
        ]);

        // Left-side donut chart Order Breakdown widget: strictly Manila today window
        $statusCounts = (clone $todayOrders)
            ->select('status', DB::raw('COUNT(*) as value'))
            ->groupBy('status')
            ->pluck('value', 'status');

        $completedCount = (int) ($statusCounts['Completed'] ?? 0) + (int) ($statusCounts['Delivered'] ?? 0);
        $outForDeliveryCount = (int) ($statusCounts['Out for Delivery'] ?? 0)
            + (int) ($statusCounts['Assigned'] ?? 0)
            + (int) ($statusCounts['Picked Up'] ?? 0);
        $preparingCount = (int) ($statusCounts['Preparing'] ?? 0) + (int) ($statusCounts['Ready'] ?? 0);

        $orderStatus = collect([
            ['name' => 'Preparing', 'value' => $preparingCount],
            ['name' => 'Pending', 'value' => (int) ($statusCounts['Pending'] ?? 0)],
            ['name' => 'Completed', 'value' => $completedCount],
            ['name' => 'Cancelled', 'value' => (int) ($statusCounts['Cancelled'] ?? 0)],
            ['name' => 'Out for Delivery', 'value' => $outForDeliveryCount],
        ]);

        // Live Orders Queue: strictly today in Asia/Manila, real order format, customer name resolution
        $recentOrders = Order::query()
            ->realOrderCodes()
            ->with('customer')
            ->whereBetween('created_at', [$todayStartUtc, $todayEndUtc])
            ->latest('created_at')
            ->take(5)
            ->get()
            ->map(function (Order $o) {
                $customerName = ($o->customer?->full_name ?: $o->customer?->name)
                    ?: ($o->customer_name ?: 'Walk-in Customer');

                return [
                    'id' => $o->order_code,
                    'customer' => $customerName,
                    'status' => $o->status,
                    'amount' => '₱'.number_format((float) $o->total, 2),
                ];
            });

        // Activity Log: strictly today in Asia/Manila with timezone-converted timestamp
        $activity = ActivityLog::query()
            ->whereBetween('created_at', [$todayStartUtc, $todayEndUtc])
            ->latest('created_at')
            ->take(8)
            ->get()
            ->map(fn ($a) => [
                'time' => $a->created_at?->copy()->setTimezone('Asia/Manila')->format('g:i A') ?: 'Just now',
                'user' => $a->actor ?: 'Admin',
                'action' => $a->action,
                'status' => 'Success',
            ]);

        // Low stocks list: non-archived items where status is Low Stock / Out of Stock OR stock <= reorder_level
        $lowStocks = (clone $lowStockQuery)
            ->orderBy('stock', 'asc')
            ->take(5)
            ->get()
            ->map(fn ($i) => [
                'name' => $i->name,
                'qty' => rtrim(rtrim(number_format($i->stock, 2), '0'), '.').' '.$i->unit,
                'level' => $i->reorder_level > 0
                    ? (int) min(100, max(0, ($i->stock / $i->reorder_level) * 50))
                    : 0,
                'status' => $i->status,
                'stock' => (float) $i->stock,
                'reorder_level' => (float) $i->reorder_level,
            ]);

        // Ensure persistent notifications table has seed data if empty
        if (Notification::count() === 0) {
            $recentOrdersForNotifs = Order::query()->latest()->take(10)->get();
            foreach ($recentOrdersForNotifs as $ord) {
                Notification::createOrderNotification($ord);
            }
            $lowStockItems = (clone $lowStockQuery)
                ->orderBy('stock', 'asc')
                ->take(5)
                ->get();
            foreach ($lowStockItems as $item) {
                Notification::createLowStockNotification($item);
            }
            $activityLogs = ActivityLog::query()->latest()->take(10)->get();
            foreach ($activityLogs as $act) {
                $lower = strtolower($act->action);
                $tab = 'System';
                $type = 'system';
                if (str_contains($lower, 'order')) {
                    $tab = 'Orders';
                    $type = 'order_new';
                } elseif (str_contains($lower, 'delivery') || str_contains($lower, 'driver')) {
                    $tab = 'Dispatch';
                    $type = 'dispatch';
                } elseif (str_contains($lower, 'stock') || str_contains($lower, 'inventory')) {
                    $tab = 'Inventory';
                    $type = 'low_stock';
                } elseif (str_contains($lower, 'account') || str_contains($lower, 'user')) {
                    $tab = 'System';
                    $type = 'account';
                }
                Notification::create([
                    'user_id' => null,
                    'title' => $act->action,
                    'message' => "By {$act->actor}",
                    'type' => $type,
                    'tab' => $tab,
                    'nav' => $tab === 'System' ? 'Account' : $tab,
                    'is_read' => true,
                    'read_at' => $act->created_at,
                    'created_at' => $act->created_at,
                    'updated_at' => $act->created_at,
                ]);
            }
        }

        $user = $request->user();
        $allNotifications = Notification::query()
            ->forUser($user)
            ->withExists(['reads as is_read_by_user' => function ($q) use ($user) {
                $q->where('user_id', $user?->id);
            }])
            ->latest()
            ->take(50)
            ->get()
            ->map(fn (Notification $n) => [
                'id' => $n->id,
                'tab' => $n->tab,
                'type' => $n->type,
                'title' => $n->title,
                'body' => $n->message,
                'message' => $n->message,
                'time' => $n->created_at?->diffForHumans() ?: 'Just now',
                'timestamp' => $n->created_at?->timestamp ?? 0,
                'unread' => ! (bool) $n->is_read_by_user,
                'is_read' => (bool) $n->is_read_by_user,
                'nav' => $n->nav,
            ]);

        return response()->json([
            'data' => [
                'period' => $period,
                'stats' => [
                    'total_sales' => (float) $totalSales,
                    'total_sales_label' => '₱'.number_format($totalSales, 2),
                    'period_sales' => (float) $periodSales,
                    'period_sales_label' => '₱'.number_format($periodSales, 2),
                    'total_orders' => $totalOrders,
                    'active_orders' => $activeOrders,
                    'active_drivers' => $activeDrivers,
                    'low_stocks_count' => $lowStocksCount,
                ],
                'sales' => $formattedSales,
                'order_status' => $orderStatus,
                'recent_orders' => $recentOrders,
                'activity_log' => $activity,
                'low_stocks' => $lowStocks,
                'notifications' => $allNotifications,
            ],
        ]);
    }
}
