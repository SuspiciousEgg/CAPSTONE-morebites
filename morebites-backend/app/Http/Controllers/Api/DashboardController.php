<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\InventoryItem;
use App\Models\Order;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function index(Request $request)
    {
        $period = $request->query('period', 'Daily');

        $todayOrders = Order::query()->whereDate('created_at', today());
        $totalSales = (clone $todayOrders)->sum('total');
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
        $salesRows = Order::query()
            ->select(DB::raw("DATE_FORMAT(created_at, '%l %p') as t"), DB::raw('SUM(total) as v'))
            ->whereDate('created_at', today())
            ->groupBy('t')
            ->orderBy('t')
            ->get()
            ->pluck('v', 't');

        $formattedSales = collect($defaultHours)->map(fn ($h) => [
            't' => $h,
            'v' => (float) ($salesRows[$h] ?? 0),
        ]);

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

        $recentOrders = Order::query()
            ->latest()
            ->take(5)
            ->get()
            ->map(fn (Order $o) => [
                'id' => $o->order_code,
                'customer' => $o->customer_name,
                'status' => $o->status,
                'amount' => '₱'.number_format($o->total, 0),
            ]);

        $activity = ActivityLog::query()
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

        $notifications = collect();

        // 1. Recent Orders
        $recentOrdersForNotifs = Order::query()->latest()->take(10)->get();
        foreach ($recentOrdersForNotifs as $ord) {
            $isCompleted = $ord->status === 'Completed';
            $isDispatch = in_array($ord->status, ['Out for Delivery', 'Ready']);
            $tab = $isDispatch ? 'Dispatch' : 'Orders';
            $type = $isCompleted ? 'order_completed' : ($isDispatch ? 'dispatch' : 'order_new');
            $title = $isCompleted
                ? "Order #{$ord->order_code} completed"
                : ($isDispatch ? "Order #{$ord->order_code} out for delivery" : "New order #{$ord->order_code} received");
            $body = $isCompleted
                ? "The order for {$ord->customer_name} has been completed."
                : ($isDispatch ? "Delivery is in progress." : "A new order has been placed by {$ord->customer_name}.");

            $notifications->push([
                'id' => 'ord_'.$ord->id,
                'tab' => $tab,
                'type' => $type,
                'title' => $title,
                'body' => $body,
                'time' => $ord->updated_at?->diffForHumans() ?: 'Just now',
                'timestamp' => $ord->updated_at?->timestamp ?? 0,
                'unread' => true,
                'nav' => $tab,
            ]);
        }

        // 2. Low Stock Alerts
        $lowStockItems = InventoryItem::query()
            ->whereIn('status', ['Low Stock', 'Out of Stock'])
            ->orderBy('stock')
            ->take(5)
            ->get();
        foreach ($lowStockItems as $item) {
            $notifications->push([
                'id' => 'inv_'.$item->id,
                'tab' => 'Inventory',
                'type' => 'low_stock',
                'title' => "Low stock alert: {$item->name}",
                'body' => "Only {$item->stock} {$item->unit} remaining in stock.",
                'time' => $item->updated_at?->diffForHumans() ?: 'Recently',
                'timestamp' => $item->updated_at?->timestamp ?? 0,
                'unread' => true,
                'nav' => 'Inventory',
            ]);
        }

        // 3. Activity / System logs
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

            $notifications->push([
                'id' => 'act_'.$act->id,
                'tab' => $tab,
                'type' => $type,
                'title' => $act->action,
                'body' => "By {$act->actor}",
                'time' => $act->created_at?->diffForHumans() ?: 'Just now',
                'timestamp' => $act->created_at?->timestamp ?? 0,
                'unread' => false,
                'nav' => $tab === 'System' ? 'Account' : $tab,
            ]);
        }

        $allNotifications = $notifications->sortByDesc('timestamp')->values();

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
