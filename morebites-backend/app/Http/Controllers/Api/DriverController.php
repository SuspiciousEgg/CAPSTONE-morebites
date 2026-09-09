<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;

class DriverController extends Controller
{
    public function index(Request $request)
    {
        $query = User::query()
            ->with('reviews')
            ->where('role', 'driver')
            ->whereNull('archived_at');

        if ($status = $request->query('status')) {
            if ($status !== 'All Status') {
                $query->where('status', $status);
            }
        }
        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $sort = $request->query('sort', 'rating');
        if ($sort === 'latest') {
            $query->latest();
        } else {
            $query->orderByDesc('rating');
        }

        $drivers = $query->get()->map(fn (User $u) => $this->transform($u));

        return response()->json(['data' => $drivers]);
    }

    public function show(User $user)
    {
        abort_unless($user->role === 'driver', 404);
        $user->load('reviews');

        return response()->json(['data' => $this->transform($user)]);
    }

    public function suspend(User $user)
    {
        abort_unless($user->role === 'driver', 404);
        $user->update(['status' => 'Inactive']);

        return response()->json(['data' => $this->transform($user->fresh()->load('reviews'))]);
    }

    private function transform(User $u): array
    {
        return [
            'id' => $u->driverDisplayId(),
            'db_id' => $u->id,
            'name' => $u->name,
            'license' => $u->license_number ?: 'N/A',
            'vehicle' => $u->vehicle_type ?: 'Motorcycle',
            'plate' => $u->plate_no ?: 'N/A',
            'expiry' => $u->license_expiry?->format('Y-m-d') ?: '-',
            'rating' => (float) $u->rating,
            'status' => $u->status,
            'phone' => $u->phone,
            'email' => $u->email,
            'joined' => $u->created_at?->format('M d, Y'),
            'success' => ($u->success_rate ?: 0).'%',
            'completed' => (int) $u->completed_orders,
            'years' => (int) $u->years_experience,
            'reviews' => $u->reviews->map(fn ($r) => [
                'text' => $r->text,
                'rating' => (int) $r->rating,
                'date' => $r->reviewed_at?->format('M d, Y') ?? $r->created_at?->format('M d, Y'),
            ])->values(),
        ];
    }
}
