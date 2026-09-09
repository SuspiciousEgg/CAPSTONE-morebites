<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\DriverBlacklist;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AccountController extends Controller
{
    public function index()
    {
        $admins = $this->usersWithAccess('admin')
            ->orderBy('id')
            ->get()
            ->map(fn (User $u) => $this->adminPayload($u));

        $drivers = $this->usersWithAccess('driver')
            ->orderBy('id')
            ->get()
            ->map(fn (User $u) => $this->driverPayload($u));

        $cashiers = $this->usersWithAccess('cashier')
            ->orderBy('id')
            ->get()
            ->map(fn (User $u) => $this->cashierPayload($u));

        return response()->json([
            'data' => [
                'admins' => $admins,
                'drivers' => $drivers,
                'cashiers' => $cashiers,
                'stats' => [
                    'active_admins' => $admins->count(),
                    'active_drivers' => $drivers->where('status', 'Active')->count(),
                    'active_cashiers' => $cashiers->where('status', 'Active')->count(),
                ],
            ],
        ]);
    }

    public function storeAdmin(Request $request)
    {
        $this->ensureSuperAdmin($request);

        $data = $request->validate([
            'first_name' => ['required', 'string'],
            'last_name' => ['required', 'string'],
            'email' => ['required', 'email', 'unique:users,email'],
            'username' => ['nullable', 'string'],
            'phone' => ['nullable', 'string'],
            'password' => ['required', 'string', 'min:6'],
            'role_access' => ['nullable', 'array'],
            'role_access.*' => [Rule::in(User::ASSIGNABLE_ROLES)],
        ]);

        $user = User::query()->create([
            'name' => trim($data['first_name'].' '.$data['last_name']),
            'first_name' => $data['first_name'],
            'last_name' => $data['last_name'],
            'email' => $data['email'],
            'username' => $data['username'] ?? strtolower($data['first_name']),
            'phone' => $data['phone'] ?? null,
            'password' => $data['password'],
            'role' => 'admin',
            'status' => 'Active',
        ]);

        $access = $data['role_access'] ?? ['admin'];
        if (! in_array('admin', $access, true)) {
            $access[] = 'admin';
        }
        $user->syncRoleAccess($access);
        $user->save();

        ActivityLog::query()->create([
            'actor' => 'Owner',
            'action' => 'Created admin '.$user->name,
        ]);

        return response()->json(['data' => $this->adminPayload($user->fresh())], 201);
    }

    public function storeDriver(Request $request)
    {
        $this->ensureSuperAdmin($request);

        $data = $request->validate([
            'first_name' => ['required', 'string'],
            'last_name' => ['required', 'string'],
            'email' => ['required', 'email', 'unique:users,email'],
            'username' => ['nullable', 'string'],
            'phone' => ['nullable', 'string'],
            'password' => ['required', 'string', 'min:6'],
            'license_number' => ['nullable', 'string'],
            'license_expiry' => ['nullable', 'date'],
            'vehicle_type' => ['nullable', 'string'],
            'plate_no' => ['nullable', 'string'],
            'role_access' => ['nullable', 'array'],
            'role_access.*' => [Rule::in(User::ASSIGNABLE_ROLES)],
        ]);

        $user = User::query()->create([
            'name' => trim($data['first_name'].' '.$data['last_name']),
            'first_name' => $data['first_name'],
            'last_name' => $data['last_name'],
            'email' => $data['email'],
            'username' => $data['username'] ?? strtolower($data['first_name']),
            'phone' => $data['phone'] ?? null,
            'password' => $data['password'],
            'role' => 'driver',
            'status' => 'Active',
            'license_number' => $data['license_number'] ?? null,
            'license_expiry' => $data['license_expiry'] ?? null,
            'vehicle_type' => $data['vehicle_type'] ?? 'Motorcycle',
            'plate_no' => $data['plate_no'] ?? null,
        ]);

        $access = $data['role_access'] ?? ['driver'];
        if (! in_array('driver', $access, true)) {
            $access[] = 'driver';
        }
        $user->syncRoleAccess($access);
        $user->save();

        ActivityLog::query()->create([
            'actor' => 'Owner',
            'action' => 'Created driver '.$user->name,
        ]);

        return response()->json(['data' => $this->driverPayload($user->fresh())], 201);
    }

    public function storeCashier(Request $request)
    {
        $this->ensureSuperAdmin($request);

        $data = $request->validate([
            'first_name' => ['required', 'string'],
            'last_name' => ['required', 'string'],
            'email' => ['required', 'email', 'unique:users,email'],
            'username' => ['nullable', 'string'],
            'phone' => ['nullable', 'string'],
            'password' => ['required', 'string', 'min:6'],
            'role_access' => ['nullable', 'array'],
            'role_access.*' => [Rule::in(User::ASSIGNABLE_ROLES)],
        ]);

        $user = User::query()->create([
            'name' => trim($data['first_name'].' '.$data['last_name']),
            'first_name' => $data['first_name'],
            'last_name' => $data['last_name'],
            'email' => $data['email'],
            'username' => $data['username'] ?? strtolower($data['first_name']),
            'phone' => $data['phone'] ?? null,
            'password' => $data['password'],
            'role' => 'cashier',
            'status' => 'Active',
        ]);

        $access = $data['role_access'] ?? ['cashier'];
        if (! in_array('cashier', $access, true)) {
            $access[] = 'cashier';
        }
        $user->syncRoleAccess($access);
        $user->save();

        ActivityLog::query()->create([
            'actor' => 'Owner',
            'action' => 'Created cashier '.$user->name,
        ]);

        return response()->json(['data' => $this->cashierPayload($user->fresh())], 201);
    }

    public function update(Request $request, User $user)
    {
        $this->ensureSuperAdmin($request);

        $data = $request->validate([
            'first_name' => ['sometimes', 'string'],
            'last_name' => ['sometimes', 'string'],
            'email' => ['sometimes', 'email', Rule::unique('users', 'email')->ignore($user->id)],
            'username' => ['nullable', 'string'],
            'phone' => ['nullable', 'string'],
            'gender' => ['nullable', 'string'],
            'birthday' => ['nullable', 'date'],
            'license_number' => ['nullable', 'string'],
            'license_expiry' => ['nullable', 'date'],
        ]);

        if (isset($data['first_name']) || isset($data['last_name'])) {
            $first = $data['first_name'] ?? $user->first_name;
            $last = $data['last_name'] ?? $user->last_name;
            $data['name'] = trim($first.' '.$last);
        }

        $user->update($data);

        return response()->json([
            'data' => $this->payloadForUser($user->fresh()),
        ]);
    }

    public function updateRoleAccess(Request $request, User $user)
    {
        $this->ensureSuperAdmin($request);

        if ($user->role === 'super_admin') {
            return response()->json(['message' => 'Super admin access cannot be modified.'], 422);
        }

        $data = $request->validate([
            'role_access' => ['required', 'array', 'min:1'],
            'role_access.*' => [Rule::in(User::ASSIGNABLE_ROLES)],
        ]);

        $user->syncRoleAccess($data['role_access']);
        $user->save();

        ActivityLog::query()->create([
            'actor' => 'Owner',
            'action' => 'Updated role access for '.$user->name,
        ]);

        return response()->json([
            'data' => $this->payloadForUser($user->fresh()),
        ]);
    }

    public function block(Request $request, User $user)
    {
        $this->ensureSuperAdmin($request);

        if ($user->role === 'super_admin') {
            return response()->json(['message' => 'Super admin cannot be blocklisted.'], 422);
        }

        $data = $request->validate([
            'reason' => ['required', 'string'],
        ]);

        if ($user->hasRoleAccess('driver')) {
            DriverBlacklist::query()->create([
                'driver_id' => $user->id,
                'driver_code' => $user->driverDisplayId(),
                'name' => $user->name,
                'license_number' => $user->license_number,
                'phone' => $user->phone,
                'reason' => $data['reason'],
                'notes' => $data['reason'],
                'attachment_name' => null,
                'attachment_meta' => null,
                'blacklisted_at' => now(),
            ]);
        }

        $user->update([
            'status' => 'Inactive',
            'archived_at' => now(),
        ]);

        ActivityLog::query()->create([
            'actor' => 'Owner',
            'action' => 'Blocklisted '.$user->name,
        ]);

        return response()->json(['message' => 'Blocklisted']);
    }

    private function usersWithAccess(string $role)
    {
        return User::query()
            ->whereNull('archived_at')
            ->where(function ($query) use ($role) {
                $query->whereJsonContains('role_access', $role);

                if ($role === 'admin') {
                    $query->orWhereIn('role', ['super_admin', 'admin']);
                } elseif ($role === 'driver') {
                    $query->orWhere('role', 'driver');
                } elseif ($role === 'cashier') {
                    $query->orWhere('role', 'cashier');
                }
            });
    }

    private function ensureSuperAdmin(Request $request): void
    {
        if ($request->user()?->role !== 'super_admin') {
            abort(403, 'Only super admin can manage accounts.');
        }
    }

    private function payloadForUser(User $user): array
    {
        return match ($user->role) {
            'driver' => $this->driverPayload($user),
            'cashier' => $this->cashierPayload($user),
            default => $this->adminPayload($user),
        };
    }

    private function roleAccessMeta(User $u): array
    {
        return [
            'roleAccess' => $u->resolvedRoleAccess(),
            'canEditAccess' => $u->role !== 'super_admin',
            'primaryRole' => $u->role,
        ];
    }

    private function adminPayload(User $u): array
    {
        return [
            'id' => $u->adminDisplayId(),
            'db_id' => $u->id,
            'firstName' => $u->first_name ?? $u->name,
            'lastName' => $u->last_name ?? '',
            'email' => $u->email,
            'username' => $u->username,
            'phone' => $u->phone,
            'birthday' => $u->birthday?->format('Y-m-d'),
            'gender' => $u->gender,
            'joinDate' => $u->created_at?->format('M d, Y'),
            'status' => $u->status,
            ...$this->roleAccessMeta($u),
        ];
    }

    private function driverPayload(User $u): array
    {
        return [
            'id' => $u->driverDisplayId(),
            'db_id' => $u->id,
            'firstName' => $u->first_name ?? $u->name,
            'lastName' => $u->last_name ?? '',
            'email' => $u->email,
            'username' => $u->username,
            'phone' => $u->phone,
            'birthday' => $u->birthday?->format('Y-m-d'),
            'gender' => $u->gender,
            'joinDate' => $u->created_at?->format('M d, Y'),
            'license' => $u->license_number,
            'expiry' => $u->license_expiry?->format('Y-m-d'),
            'status' => $u->status,
            ...$this->roleAccessMeta($u),
        ];
    }

    private function cashierPayload(User $u): array
    {
        return [
            'id' => $u->cashierDisplayId(),
            'db_id' => $u->id,
            'firstName' => $u->first_name ?? $u->name,
            'lastName' => $u->last_name ?? '',
            'email' => $u->email,
            'username' => $u->username,
            'phone' => $u->phone,
            'birthday' => $u->birthday?->format('Y-m-d'),
            'gender' => $u->gender,
            'joinDate' => $u->created_at?->format('M d, Y'),
            'status' => $u->status,
            ...$this->roleAccessMeta($u),
        ];
    }
}
