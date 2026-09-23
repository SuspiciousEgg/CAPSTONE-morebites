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
        $activeDrivers = User::query()
            ->where('role', 'driver')
            ->whereNull('archived_at')
            ->where(function ($q) {
                $q->where('status', 'active')->orWhereNull('status');
            })
            ->count();
        $lowStocksCount = InventoryItem::query()
            ->whereIn('status', ['Low Stock', 'Out of Stock'])
            ->count();

        $defaultHours = ['8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM', '7 PM'];
        $isSqlite = DB::connection()->getDriverName() === 'sqlite';
        $timeExpression = $isSqlite
            ? "case cast(strftime('%H', created_at) as integer) when 8 then '8 AM' when 9 then '9 AM' when 10 then '10 AM' when 11 then '11 AM' when 12 then '12 PM' when 13 then '1 PM' when 14 then '2 PM' when 15 then '3 PM' when 16 then '4 PM' when 17 then '5 PM' when 18 then '6 PM' when 19 then '7 PM' else 'Other' end"
            : "DATE_FORMAT(created_at, '%l %p')";

        $salesRows = Order::query()
            ->realOrderCodes()
            ->select(DB::raw("{$timeExpression} as t"), DB::raw('SUM(total) as v'))
            ->whereBetween('created_at', [$todayStartUtc, $todayEndUtc])
            ->groupBy('t')
            ->orderBy('t')
            ->get()
            ->pluck('v', 't');

        $formattedSales = collect($defaultHours)->map(fn ($h) => [
            't' => $h,
            'v' => (float) ($salesRows[$h] ?? 0),
        ]);

        // Left-side donut chart Order Breakdown widget: preserved exactly as-is
        $statusCounts = Order::query()
            ->whereDate('created_at', today())
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

        $activity = ActivityLog::query()
            ->whereDate('created_at', today())
            ->latest()
            ->take(8)
            ->get()
            ->map(fn ($a) => [
                'time' => $a->created_at?->format('g:i A'),
                'user' => $a->actor ?: 'Admin',
                'action' => $a->action,
                'status' => 'Success',
            ]);

        $lowStocks = InventoryItem::query()
            ->whereIn('status', ['Low Stock', 'Out of Stock'])
            ->orderBy('stock')
            ->take(5)
            ->get()
            ->map(fn ($i) => [
                'name' => $i->name,
                'qty' => rtrim(rtrim(number_format($i->stock, 2), '0'), '.').' '.$i->unit,
                'level' => $i->reorder_level > 0
                    ? (int) min(100, max(0, ($i->stock / $i->reorder_level) * 50))
                    : 0,
            ]);

        // Ensure persistent notifications table has seed data if empty
        if (Notification::count() === 0) {
            $recentOrdersForNotifs = Order::query()->latest()->take(10)->get();
            foreach ($recentOrdersForNotifs as $ord) {
                Notification::createOrderNotification($ord);
            }
            $lowStockItems = InventoryItem::query()
                ->whereIn('status', ['Low Stock', 'Out of Stock'])
                ->orderBy('stock')
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
