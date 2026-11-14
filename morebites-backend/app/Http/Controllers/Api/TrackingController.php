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

        if ((int) $order->driver_id === (int) $user->id) {
            if ($user->archived_at !== null || in_array($user->status, ['Blacklisted', 'Blocklisted'], true)) {
                abort(403, 'Your account has been blocklisted. Please contact the shop.');
            }
            if ($user->status !== 'Active') {
                abort(403, 'Your account is suspended. Please contact the shop.');
            }
        }

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

        if ($user->archived_at !== null || in_array($user->status, ['Blacklisted', 'Blocklisted'], true)) {
            abort(403, 'Your account has been blocklisted. Please contact the shop.');
        }
        if ($user->status !== 'Active') {
            abort(403, 'Your account is suspended. Please contact the shop.');
        }

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

        if ($tracking->isRiderAccepted($order)) {
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

        if ((int) $order->driver_id === (int) $user->id) {
            if ($user->archived_at !== null || in_array($user->status, ['Blacklisted', 'Blocklisted'], true)) {
                abort(403, 'Your account has been blocklisted. Please contact the shop.');
            }
            if ($user->status !== 'Active') {
                abort(403, 'Your account is suspended. Please contact the shop.');
            }
        }

        $riderAccepted = $tracking->isRiderAccepted($order);
        $point = $riderAccepted ? ($tracking->riderPoint($order) ?? $tracking->storePoint()) : null;

        return response()->json([
            'data' => [
                'delivery_id' => $order->id,
                'order_id' => $order->order_code,
                'status' => $order->status === 'Completed' ? 'Delivered' : $order->status,
                'raw_status' => $order->status,
                'rider_accepted' => $riderAccepted,
                'latitude' => $point ? (float) $point['latitude'] : null,
                'longitude' => $point ? (float) $point['longitude'] : null,
                'updated_at' => $point['updated_at'] ?? $order->updated_at?->toIso8601String(),
                'eta_mins' => $riderAccepted ? $order->delivery_minutes : null,
                'distance_km' => ($riderAccepted && $order->delivery_distance_km) ? (float) $order->delivery_distance_km : null,
            ],
        ]);
    }
}
