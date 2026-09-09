<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Order;
use App\Models\User;
use App\Support\Media;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class DriverAppController extends Controller
{
    public const DRIVER_STATUSES = [
        'Assigned',
        'Picked Up',
        'Out for Delivery',
        'Completed',
        'Delivered',
        'Cancelled',
    ];

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'phone' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $phone = $this->normalizePhone($credentials['phone']);

        $user = User::query()
            ->whereNull('archived_at')
            ->where(function ($query) use ($phone, $credentials) {
                $query->where('phone', $credentials['phone'])
                    ->orWhere('phone', $phone)
                    ->orWhereRaw("REPLACE(REPLACE(phone, ' ', ''), '-', '') = ?", [$phone]);
            })
            ->get()
            ->first(fn (User $u) => $u->hasRoleAccess('driver') || $u->role === 'driver');

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            throw ValidationException::withMessages([
                'phone' => ['Incorrect phone number or password.'],
            ]);
        }

        if ($user->status !== 'Active') {
            throw ValidationException::withMessages([
                'phone' => ['Your account is inactive. Contact the admin.'],
            ]);
        }

        $token = $user->createToken('driver-app')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $this->userPayload($user),
        ]);
    }

    public function me(Request $request)
    {
        $user = $this->driverUser($request);

        return response()->json(['user' => $this->userPayload($user)]);
    }

    public function orders(Request $request)
    {
        $user = $this->driverUser($request);

        $query = Order::query()
            ->with(['items', 'customer'])
            ->where('driver_id', $user->id)
            ->latest();

        if ($status = $request->query('status')) {
            if ($status !== 'All') {
                if ($status === 'Delivered') {
                    $query->whereIn('status', ['Completed', 'Delivered']);
                } else {
                    $query->where('status', $status);
                }
            }
        }

        $orders = $query->get()->map(fn (Order $o) => $this->orderPayload($o));

        return response()->json(['data' => $orders]);
    }

    public function showOrder(Request $request, Order $order)
    {
        $user = $this->driverUser($request);
        abort_unless((int) $order->driver_id === (int) $user->id, 403);

        return response()->json([
            'data' => $this->orderPayload($order->load(['items', 'customer'])),
        ]);
    }

    public function updateOrderStatus(Request $request, Order $order)
    {
        $user = $this->driverUser($request);
        abort_unless((int) $order->driver_id === (int) $user->id, 403);

        $data = $request->validate([
            'status' => ['required', 'string', Rule::in(self::DRIVER_STATUSES)],
            'proof_of_delivery' => ['nullable', 'image', 'max:8192'],
        ]);

        $status = $data['status'] === 'Delivered' ? 'Completed' : $data['status'];

        $payload = ['status' => $status];
        if ($status === 'Completed') {
            $payload['delivered_at'] = now();
            if ($order->assigned_at) {
                $payload['delivery_minutes'] = max(1, $order->assigned_at->diffInMinutes(now()));
            }
            if ($request->hasFile('proof_of_delivery')) {
                $path = $request->file('proof_of_delivery')->store('proofs', 'public');
                $payload['proof_of_delivery'] = '/storage/'.$path;
            }
        }

        $order->update($payload);

        ActivityLog::query()->create([
            'actor' => $user->name,
            'action' => 'Driver marked '.$order->order_code.' as '.$status,
        ]);

        if ($status === 'Completed') {
            $user->increment('completed_orders');
        }

        return response()->json([
            'data' => $this->orderPayload($order->fresh()->load(['items', 'customer'])),
        ]);
    }

    public function updateProfile(Request $request)
    {
        $user = $this->driverUser($request);

        $data = $request->validate([
            'first_name' => ['sometimes', 'string'],
            'last_name' => ['sometimes', 'string'],
            'email' => ['sometimes', 'email'],
            'phone' => ['sometimes', 'string'],
        ]);

        if (isset($data['first_name']) || isset($data['last_name'])) {
            $first = $data['first_name'] ?? $user->first_name;
            $last = $data['last_name'] ?? $user->last_name;
            $data['name'] = trim($first.' '.$last);
        }

        $user->update($data);

        return response()->json(['user' => $this->userPayload($user->fresh())]);
    }

    public function changePassword(Request $request)
    {
        $user = $this->driverUser($request);

        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:6', 'confirmed'],
        ]);

        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['Current password is incorrect.'],
            ]);
        }

        $user->update(['password' => $data['password']]);

        return response()->json(['message' => 'Password updated']);
    }

    public function updateLocation(Request $request)
    {
        $user = $this->driverUser($request);

        $data = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
        ]);

        $user->update([
            'current_lat' => $data['latitude'],
            'current_lng' => $data['longitude'],
            'location_updated_at' => now(),
        ]);

        $active = Order::query()
            ->where('driver_id', $user->id)
            ->whereIn('status', ['Assigned', 'Picked Up', 'Out for Delivery'])
            ->latest()
            ->first();

        if ($active) {
            app(\App\Services\TrackingService::class)->ensureRoute($active, [
                'latitude' => (float) $data['latitude'],
                'longitude' => (float) $data['longitude'],
            ]);
        }

        return response()->json([
            'message' => 'Location updated',
            'data' => [
                'latitude' => (float) $user->current_lat,
                'longitude' => (float) $user->current_lng,
                'updated_at' => $user->location_updated_at?->toIso8601String(),
            ],
        ]);
    }

    public function reportIssue(Request $request, Order $order)
    {
        $user = $this->driverUser($request);
        abort_unless((int) $order->driver_id === (int) $user->id, 403);

        $data = $request->validate([
            'issue' => ['required', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        ActivityLog::query()->create([
            'actor' => $user->name,
            'action' => 'Driver reported '.$data['issue'].' on '.$order->order_code.($data['notes'] ? ': '.$data['notes'] : ''),
        ]);

        return response()->json(['message' => 'Issue reported']);
    }

    private function driverUser(Request $request): User
    {
        $user = $request->user();
        abort_unless($user && ($user->hasRoleAccess('driver') || $user->role === 'driver'), 403);

        return $user;
    }

    private function normalizePhone(string $phone): string
    {
        return preg_replace('/\D+/', '', $phone) ?? $phone;
    }

    private function userPayload(User $user): array
    {
        return [
            'id' => $user->id,
            'db_id' => $user->id,
            'driver_code' => $user->driverDisplayId(),
            'fullName' => $user->name,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'email' => $user->email,
            'phone' => $user->phone,
            'role' => $user->role,
            'status' => $user->status,
            'rating' => (float) $user->rating,
            'completed_orders' => (int) $user->completed_orders,
            'vehicle_type' => $user->vehicle_type,
            'plate_no' => $user->plate_no,
        ];
    }

    private function orderPayload(Order $o): array
    {
        $displayStatus = $o->status === 'Completed' ? 'Delivered' : $o->status;
        $code = ltrim((string) $o->order_code, '#');
        $shortId = preg_replace('/\D+/', '', $code) ?: (string) $o->id;

        $distanceKm = $o->delivery_distance_km ?: 2.5;
        $etaMins = $o->delivery_minutes ?: 20;

        return [
            'id' => $shortId,
            'db_id' => $o->id,
            'order_code' => $o->order_code,
            'customer' => $o->customer_name,
            'location' => $o->delivery_address ?: 'N/A',
            'address' => $o->delivery_address ?: 'N/A',
            'contact' => $o->customer?->phone ?: '',
            'status' => $displayStatus,
            'distance' => number_format((float) $distanceKm, 1).'km',
            'distance_km' => (float) $distanceKm,
            'eta_mins' => (int) $etaMins,
            'amount' => (float) $o->total,
            'payment_method' => $o->payment_method ?: 'COD',
            'payment_status' => $o->payment_status,
            'items' => $o->items->map(fn ($i) => [
                'name' => $i->name,
                'qty' => (int) $i->qty,
                'unit_price' => (float) $i->unit_price,
                'line_total' => (float) $i->line_total,
                'label' => $i->name.' x'.$i->qty,
            ])->values(),
            'items_label' => $o->items->map(fn ($i) => $i->name.' x'.$i->qty)->implode(' + '),
            'created_at' => $o->created_at?->toIso8601String(),
            'assigned_at' => $o->assigned_at?->toIso8601String(),
            'delivered_at' => $o->delivered_at?->toIso8601String(),
            'proof_of_delivery' => Media::url($o->proof_of_delivery),
            'dest_lat' => $o->dest_lat ? (float) $o->dest_lat : null,
            'dest_lng' => $o->dest_lng ? (float) $o->dest_lng : null,
            'route' => is_array($o->route_coordinates) ? $o->route_coordinates : [],
        ];
    }
}
