<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $user = User::query()
            ->where(function ($query) use ($credentials) {
                $query->where('email', $credentials['email'])
                      ->orWhere('username', $credentials['email']);
            })
            ->whereIn('role', ['super_admin', 'admin', 'cashier'])
            ->whereNull('archived_at')
            ->first();

        if (! $user) {
            throw ValidationException::withMessages([
                'email' => ['Account not found.'],
            ]);
        }

        if ($user->status === 'inactive') {
            throw ValidationException::withMessages([
                'email' => ['This account is inactive.'],
            ]);
        }

        if (! Hash::check($credentials['password'], $user->password)) {
            throw ValidationException::withMessages([
                'password' => ['Incorrect password.'],
            ]);
        }

        $token = $user->createToken('superadmin')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $this->userPayload($user),
        ]);
    }

    public function me(Request $request)
    {
        return response()->json([
            'user' => $this->userPayload($request->user()),
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out']);
    }

    private function userPayload(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'email' => $user->email,
            'username' => $user->username,
            'phone' => $user->phone,
            'role' => $user->role,
            'role_access' => $user->resolvedRoleAccess(),
            'status' => $user->status,
        ];
    }
}
