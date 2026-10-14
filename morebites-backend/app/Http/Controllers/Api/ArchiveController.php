<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DriverBlacklist;
use App\Models\User;
use Illuminate\Http\Request;

class ArchiveController extends Controller
{
    public function index(Request $request)
    {
        $this->ensureSuperAdmin($request);

        $admins = User::query()
            ->whereIn('role', ['super_admin', 'admin'])
            ->whereNotNull('archived_at')
            ->orderByDesc('archived_at')
            ->get()
            ->map(fn (User $u) => [
                'id' => $u->adminDisplayId(),
                'db_id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'status' => 'Inactive',
            ]);

        $drivers = User::query()
            ->where('role', 'driver')
            ->whereNotNull('archived_at')
            ->orderByDesc('archived_at')
            ->get()
            ->map(fn (User $u) => [
                'id' => $u->driverDisplayId(),
                'db_id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'status' => 'Inactive',
            ]);

        return response()->json([
            'data' => [
                'admins' => $admins,
                'drivers' => $drivers,
                'stats' => [
                    'active_admins' => User::query()->whereIn('role', ['super_admin', 'admin'])->whereNull('archived_at')->count(),
                    'active_drivers' => User::query()->where('role', 'driver')->whereNull('archived_at')->where('status', 'Active')->count(),
                ],
            ],
        ]);
    }

    public function restore(Request $request, User $user)
    {
        $this->ensureSuperAdmin($request);

        if ($user->role === 'driver') {
            DriverBlacklist::query()->where('driver_id', $user->id)->delete();
        }

        $user->update([
            'archived_at' => null,
            'status' => 'Active',
        ]);

        return response()->json(['message' => 'Restored']);
    }

    public function destroy(Request $request, User $user)
    {
        return response()->json([
            'message' => 'Permanent deletion is disabled. Accounts can only be archived or restored.',
        ], 403);
    }

    private function ensureSuperAdmin(Request $request): void
    {
        if ($request->user()?->role !== 'super_admin') {
            abort(403, 'Only the Owner can archive or blocklist accounts.');
        }
    }
}
