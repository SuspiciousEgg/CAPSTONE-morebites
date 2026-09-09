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
}
