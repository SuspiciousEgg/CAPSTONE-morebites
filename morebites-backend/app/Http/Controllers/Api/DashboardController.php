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
     * PROMPT 37 DIAGNOSTIC REPORT:
     * 1. Query & Endpoint:
     *    - The Live Orders Queue table calls GET /api/dashboard (dashboardApi.get()).
     *    - Previously, it executed: Order::query()->whereDate('created_at', today())->latest()->take(5)->get().
     * 2. WHERE clause date filter:
     *    - whereDate('created_at', today()) used Laravel's default server timezone (UTC).
     *    - In Philippine timezone (Asia/Manila, UTC+8), today spans from 00:00:00 to 23:59:59 PHT
     *      (16:00:00 UTC yesterday to 15:59:59 UTC today).
     *    - Filtering with whereDate('created_at', today()) in UTC dropped morning orders placed between
     *      12:00 AM and 7:59 AM PHT while capturing orders from the following morning UTC window.
     * 3. Customer name join:
     *    - It directly accessed $o->customer_name without joining or resolving the registered customer
     *      profile ($o->customer->full_name).
     * 4. ORDER BY / LIMIT:
     *    - The query used latest()->take(5). Because the seeded test order #ORD-PRIOR-1 had created_at
     *      stamped with today's date, it was surfaced at the top of the queue.
     * 5. Total Sales Stat Card:
     *    - Previously, it summed all orders via Order::whereDate('created_at', today())->sum('total')
     *      without filtering for status = 'Completed'. It included test order #ORD-PRIOR-1 (₱2,000.00).
     * 6. Seeded Test Data (Date vs Format):
     *    - #ORD-PRIOR-1 actually has today's created_at (2026-09-23 09:42:50 UTC) because created_at
     *      was omitted from Order::$fillable, causing Eloquent to default to Carbon::now() upon creation.
     *    - It also has a non-standard code format (#ORD-PRIOR-1) rather than the standard #ORD-XXXXX format.
     *    - Real order #ORD-00033 has created_at = 2026-09-21 18:13:03 UTC (2026-09-22 02:13:03 PHT),
     *      which falls outside today's date range.
     * 7. Preserved Donut Chart:
     *    - The left-side donut chart Order Breakdown widget ($orderStatus) query is preserved exactly as-is.
     */
    public function index(Request $request)
    {
        $period = $request->query('period', 'Daily');
        $fromTime = $request->query('from_time', $request->query('fromTime', $request->query('from_hour')));
        $toTime = $request->query('to_time', $request->query('toTime', $request->query('to_hour')));

        $manilaNow = Carbon::now('Asia/Manila');
        $todayStartUtc = $manilaNow->copy()->startOfDay()->setTimezone('UTC');
        $todayEndUtc = $manilaNow->copy()->endOfDay()->setTimezone('UTC');

        // Total sales strictly sums Completed orders created within today's Manila date range
        $totalSales = (float) Order::query()
            ->realOrderCodes()
            ->whereBetween('created_at', [$todayStartUtc, $todayEndUtc])
            ->where('status', 'Completed')
            ->sum('total');

        $todayOrders = Order::query()
            ->realOrderCodes()
            ->whereBetween('created_at', [$todayStartUtc, $todayEndUtc]);

        $totalOrders = (clone $todayOrders)->count();
        $activeOrders = (clone $todayOrders)->whereIn('status', [
            'Pending', 'Preparing', 'Ready', 'Out for Delivery',
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

        $completedSalesOrders = Order::query()
            ->realOrderCodes()
            ->whereBetween('created_at', [$salesStartUtc, $salesEndUtc])
            ->where('status', 'Completed')
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
        $statusCounts = Order::query()
            ->realOrderCodes()
            ->whereBetween('created_at', [$todayStartUtc, $todayEndUtc])
            ->select('status', DB::raw('COUNT(*) as value'))
            ->groupBy('status')
            ->pluck('value', 'status');

        $orderStatus = collect([
            'Preparing', 'Pending', 'Completed', 'Cancelled', 'Out for Delivery',
        ])->map(fn ($name) => [
            'name' => $name,
            'value' => (int) ($statusCounts[$name] ?? 0),
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
