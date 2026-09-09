<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Order;
use App\Models\User;
use App\Services\TrackingService;
use Illuminate\Http\Request;

class DispatchController extends Controller
{
    public function index()
    {
        $pending = Order::query()
            ->whereIn('status', ['Pending', 'Ready', 'Preparing'])
            ->whereNull('driver_id')
            ->whereNotIn('order_type', ['Dine-in', 'Takeout'])
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
            ]);

        $monitoring = Order::query()
            ->with(['driver', 'items', 'customer'])
            ->whereNotNull('driver_id')
            ->whereNotIn('order_type', ['Dine-in', 'Takeout'])
            ->whereIn('status', ['Assigned', 'Picked Up', 'Out for Delivery', 'Completed', 'Delivered', 'Cancelled'])
            ->latest()
            ->take(10)
            ->get()
            ->map(fn (Order $o) => [
                'id' => $o->order_code,
                'db_id' => $o->id,
                'name' => $o->driver?->name ?? 'Unknown',
                'phone' => $o->driver?->phone ?? '',
                'customer' => $o->customer_name,
                'customer_phone' => $o->customer?->phone ?: '',
                'address' => $o->delivery_address ?: 'N/A',
                'total' => (float) $o->total,
                'payment_method' => $o->payment_method ?: 'COD',
                'items' => $o->items->map(fn ($i) => $i->qty.'x '.$i->name)->implode(', '),
                'status' => match ($o->status) {
                    'Completed', 'Delivered' => 'Delivered',
                    'Cancelled' => 'Cancelled',
                    'Picked Up' => 'Picked Up',
                    'Assigned' => 'Assigned',
                    default => 'Out for Delivery',
                },
                'raw_status' => $o->status,
                'updated' => $o->updated_at?->format('g:i A'),
                'assigned_at' => $o->assigned_at?->format('M d, Y g:i A'),
                'dest_lat' => $o->dest_lat ? (float) $o->dest_lat : null,
                'dest_lng' => $o->dest_lng ? (float) $o->dest_lng : null,
                'rider_lat' => $o->driver?->current_lat ? (float) $o->driver->current_lat : null,
                'rider_lng' => $o->driver?->current_lng ? (float) $o->driver->current_lng : null,
                'eta_mins' => (int) ($o->delivery_minutes ?: 20),
                'distance_km' => (float) ($o->delivery_distance_km ?: 2.5),
            ]);

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
                'monitoring' => $monitoring,
                'riders' => $riders,
                'map' => [
                    'distance_km' => 6.8,
                    'eta_mins' => 12,
                ],
            ],
        ]);
    }

    public function assign(Request $request, Order $order)
    {
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

        $tracking = app(TrackingService::class);
        $tracking->ensureRoute($order->fresh()->load('driver'));

        ActivityLog::query()->create([
            'actor' => 'Admin',
            'action' => 'Assigned '.$driver->name.' to '.$order->order_code,
        ]);

        return response()->json(['message' => 'Assigned', 'data' => ['driver' => $driver->name]]);
    }
}
