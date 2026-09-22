<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\TrackingService;
use Illuminate\Http\Request;

class TrackingController extends Controller
{
    public function show(Request $request, Order $order, TrackingService $tracking)
    {
        $user = $request->user();
        abort_unless($user, 401);

        $order->loadMissing('customer');

        $allowed = in_array($user->role, ['super_admin', 'admin', 'cashier'], true)
            || ((int) $order->driver_id === (int) $user->id)
            || ($user->role === 'customer' && (int) ($order->customer?->user_id) === (int) $user->id);

        abort_unless($allowed, 403);

        return response()->json([
            'data' => $tracking->trackingPayload($order),
        ]);
    }

    public function fleet(Request $request, TrackingService $tracking)
    {
        $user = $request->user();
        abort_unless($user && in_array($user->role, ['super_admin', 'admin', 'cashier'], true), 403);

        return response()->json([
            'data' => $tracking->fleetPayload(),
        ]);
    }

    public function updateDeliveryLocation(Request $request, Order $order, TrackingService $tracking)
    {
        $user = $request->user();
        abort_unless($user, 401);
        abort_unless((int) $order->driver_id === (int) $user->id, 403);

        $data = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
        ]);

        $lat = (float) $data['latitude'];
        $lng = (float) $data['longitude'];

        $user->update([
            'current_lat' => $lat,
            'current_lng' => $lng,
            'location_updated_at' => now(),
        ]);

        if (in_array($order->status, ['Assigned', 'Picked Up', 'Out for Delivery'], true)) {
            $tracking->updateLivePosition($order, $lat, $lng);
        } else {
            $order->update([
                'current_lat' => $lat,
                'current_lng' => $lng,
            ]);
        }

        return response()->json([
            'message' => 'Delivery location updated',
            'data' => [
                'delivery_id' => $order->id,
                'order_id' => $order->order_code,
                'latitude' => $lat,
                'longitude' => $lng,
                'updated_at' => now()->toIso8601String(),
            ],
        ]);
    }

    public function deliveryLocation(Request $request, Order $order, TrackingService $tracking)
    {
        $user = $request->user();
        abort_unless($user, 401);

        $order->loadMissing('customer', 'driver');

        $allowed = in_array($user->role, ['super_admin', 'admin', 'cashier'], true)
            || ((int) $order->driver_id === (int) $user->id)
            || ($user->role === 'customer' && (int) ($order->customer?->user_id) === (int) $user->id);

        abort_unless($allowed, 403);

        $point = $tracking->riderPoint($order) ?? $tracking->storePoint();

        return response()->json([
            'data' => [
                'delivery_id' => $order->id,
                'order_id' => $order->order_code,
                'status' => $order->status === 'Completed' ? 'Delivered' : $order->status,
                'latitude' => (float) $point['latitude'],
                'longitude' => (float) $point['longitude'],
                'updated_at' => $point['updated_at'] ?? $order->updated_at?->toIso8601String(),
                'eta_mins' => $order->delivery_minutes,
                'distance_km' => $order->delivery_distance_km ? (float) $order->delivery_distance_km : null,
            ],
        ]);
    }
}
