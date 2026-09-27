<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Notification;
use App\Models\Order;
use App\Models\User;
use App\Services\TrackingService;
use Illuminate\Http\Request;

class DispatchController extends Controller
{
    /**
     * PROMPT 43 DIAGNOSTIC REPORT — Live Delivery Map vs. Delivery Status Monitoring Mismatch:
     *
     * 1. Endpoints Polled Previously (Two Separate Backend Calls Every 10s):
     *    - Live Delivery Map polled `GET /api/dispatch/fleet` -> `TrackingController::fleet()` -> `TrackingService::fleetPayload()`
     *    - Delivery Status Monitoring table polled `GET /api/dispatch` -> `DispatchController::index()`
     *
     * 2. Side-by-Side Query Comparison (Before Fix):
     *    - Query A (Live Delivery Map — `TrackingService::fleetPayload()`):
     *        Order::query()
     *            ->with('driver')
     *            ->whereNotNull('driver_id')
     *            ->where('order_type', 'Online Order')
     *            ->where('status', 'Out for Delivery')
     *            ->latest()
     *            ->take(20)
     *            ->get()
     *    - Query B (Delivery Status Monitoring — `DispatchController::index()`):
     *        Order::query()
     *            ->with(['driver', 'items', 'customer'])
     *            ->whereNotNull('driver_id')
     *            ->where('order_type', 'Online Order')
     *            ->whereIn('status', ['Assigned', 'Picked Up', 'Out for Delivery', 'Completed', 'Delivered', 'Cancelled'])
     *            ->latest()
     *            ->take(10)
     *            ->get()
     *
     * 3. Exact Root Causes Confirmed:
     *    - Cause #1 (Frontend Filter Discarding 100% of Backend Monitoring Rows):
     *      In `DispatchController::index()`, `$pending` mapped `'order_type' => $o->order_type`,
     *      but `$monitoring` OMITTED both `'order_type'` and `'type'` from its `.map()` array!
     *      Then in `DispatchManagement.jsx` (`loadDispatch()`), `setMonitoring((d.monitoring || []).filter(isDeliveryOrder))`
     *      checked `(o.order_type === 'Online Order' || o.type === 'Online Order')`. Because both fields were
     *      `undefined` on every item in `d.monitoring`, `isDeliveryOrder` returned `false` for 100% of rows
     *      (including `#ORD-00034`), discarding every row on the frontend and leaving `monitoring = []`
     *      ("No active deliveries"), while `loadFleet()` passed `d.deliveries` directly to `<FleetMap />` without
     *      that filter.
     *    - Cause #2 (Divergent WHERE Status Clauses & Dual-Query Drift):
     *      `fleetPayload()` only matched `status = 'Out for Delivery'` (excluding `'Assigned'`, `'Picked Up'`,
     *      and case variant `'Out For Delivery'`), whereas `DispatchController::index()` included terminal
     *      statuses (`'Completed'`, `'Delivered'`, `'Cancelled'`) in `$monitoring`, which prevented completed
     *      deliveries from clearing when marked Delivered on the Driver app.
     *
     * 4. Fix Implemented:
     *    - Both endpoints now delegate to `TrackingService::activeDeliveriesPayload()`, querying the exact
     *      same active statuses (`['Assigned', 'Picked Up', 'Out for Delivery', 'Out For Delivery']`),
     *      including `'order_type'` and `'type'` on every mapped row, and returning both map and table fields
     *      in a single unified response so both panels derive their displayed state from the same polled data.
     */
    public function index(TrackingService $tracking)
    {
        $pending = Order::query()
            ->whereIn('status', ['Pending', 'Ready', 'Preparing'])
            ->whereNull('driver_id')
            ->where('order_type', 'Online Order')
            ->latest()
            ->get()
            ->map(fn (Order $o) => [
                'id' => $o->order_code,
                'db_id' => $o->id,
                'customer' => $o->customer_name,
                'address' => $o->delivery_address ?: 'N/A',
                'total' => (float) $o->total,
                'status' => 'Waiting for rider',
                'order_type' => $o->order_type,
                'type' => $o->order_type,
            ]);

        $activeDeliveries = $tracking->activeDeliveriesPayload();

        $riders = User::query()
            ->where('role', 'driver')
            ->whereNull('archived_at')
            ->where(function ($q) {
                $q->where('status', 'Active')->orWhereNull('status');
            })
            ->orderBy('name')
            ->get()
            ->map(fn (User $u, $i) => [
                'id' => $u->id,
                'name' => $u->name,
                'label' => 'Rider - '.($i + 1).' '.$u->name,
                'phone' => $u->phone ?: '+63 912 345 6789',
                'vehicle' => ($u->vehicle_type ?: 'Motorcycle').($u->plate_no ? ' • '.$u->plate_no : ''),
                'rating' => $u->rating ? (float) $u->rating : 5.0,
                'status' => $u->status ?: 'Active',
            ])
            ->values();

        return response()->json([
            'data' => [
                'pending' => $pending,
                'monitoring' => $activeDeliveries,
                'deliveries' => $activeDeliveries,
                'riders' => $riders,
            ],
        ]);
    }

    public function assign(Request $request, Order $order)
    {
        if ($order->order_type !== 'Online Order') {
            return response()->json(['message' => 'Only online delivery orders can be assigned to a rider.'], 422);
        }

        $data = $request->validate([
            'rider_name' => ['required', 'string'],
        ]);

        // Extract name after "Rider - N "
        $name = preg_replace('/^Rider\s*-\s*\d+\s+/', '', $data['rider_name']);

        $driver = User::query()
            ->where('role', 'driver')
            ->whereNull('archived_at')
            ->where(function ($q) use ($name, $data) {
                $q->where('name', $name)->orWhere('name', $data['rider_name']);
            })
            ->first();

        if (! $driver) {
            $driver = User::query()
                ->where('role', 'driver')
                ->whereNull('archived_at')
                ->where('status', 'Active')
                ->first();
        }

        if (! $driver) {
            return response()->json(['message' => 'No available rider'], 422);
        }

        $order->update([
            'driver_id' => $driver->id,
            'status' => 'Assigned',
            'assigned_at' => now(),
            'delivery_distance_km' => $order->delivery_distance_km ?: 2.5,
        ]);

        $freshOrder = $order->fresh()->load('driver');
        $tracking = app(TrackingService::class);
        $tracking->ensureRoute($freshOrder);

        Notification::createOrderNotification($freshOrder);

        ActivityLog::query()->create([
            'actor' => 'Admin',
            'action' => 'Assigned '.$driver->name.' to '.$order->order_code,
        ]);

        return response()->json(['message' => 'Assigned', 'data' => ['driver' => $driver->name]]);
    }
}
