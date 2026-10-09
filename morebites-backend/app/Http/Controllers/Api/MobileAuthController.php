<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\DriverBlacklist;
use App\Models\TrustedDevice;
use App\Models\User;
use App\Support\Media;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class MobileAuthController extends Controller
{
    public function login(Request $request)
    {
        $credentials = $request->validate([
            'phone' => ['required', 'string', 'regex:/^09\d{9}$/'],
            'password' => ['required', 'string'],
            'device_id' => ['nullable', 'string'],
        ], [
            'phone.regex' => 'Enter a valid 11-digit Philippine mobile number starting with 09.',
        ]);

        $phone = $this->normalizePhone($credentials['phone']);

        $candidates = User::query()
            ->whereNull('archived_at')
            ->where(function ($query) use ($phone, $credentials) {
                $query->where('phone', $credentials['phone'])
                    ->orWhere('phone', $phone)
                    ->orWhereRaw("REPLACE(REPLACE(phone, ' ', ''), '-', '') = ?", [$phone]);
            })
            ->get();

        if ($candidates->isEmpty()) {
            throw ValidationException::withMessages([
                'phone' => ['Incorrect phone number or password.'],
            ]);
        }

        // Try driver role first, then customer
        $matchingUser = null;
        $matchedRole = null;

        foreach ($candidates as $user) {
            if (Hash::check($credentials['password'], $user->password)) {
                if ($user->hasRoleAccess('driver') || $user->role === 'driver') {
                    $matchingUser = $user;
                    $matchedRole = 'driver';
                    break;
                } elseif ($user->role === 'customer') {
                    $matchingUser = $user;
                    $matchedRole = 'customer';
                    // keep looking in case there is a driver account with the same phone/pass
                }
            }
        }

        if (! $matchingUser) {
            throw ValidationException::withMessages([
                'phone' => ['Incorrect phone number or password.'],
            ]);
        }

        if ($matchedRole === 'driver') {
            $isBlacklisted = $matchingUser->archived_at !== null
                || in_array($matchingUser->status, ['Blacklisted', 'Blocklisted'], true)
                || DriverBlacklist::query()->where('driver_id', $matchingUser->id)->exists();

            if ($isBlacklisted) {
                throw ValidationException::withMessages([
                    'phone' => ['Your account has been blocklisted. Contact the administrator.'],
                ]);
            }

            if ($matchingUser->status !== 'Active') {
                throw ValidationException::withMessages([
                    'phone' => ['Your account is inactive. Contact the admin.'],
                ]);
            }

            $token = $matchingUser->createToken('driver-app')->plainTextToken;

            return response()->json([
                'role' => 'driver',
                'token' => $token,
                'user' => $this->driverPayload($matchingUser),
            ]);
        }

        // Customer
        if ($matchingUser->status !== 'Active') {
            throw ValidationException::withMessages([
                'phone' => ['Your account is inactive.'],
            ]);
        }

        $newDevice = false;
        if (! empty($credentials['device_id'])) {
            $trusted = TrustedDevice::query()
                ->where('user_id', $matchingUser->id)
                ->where('device_id', $credentials['device_id'])
                ->first();

            if (! $trusted) {
                TrustedDevice::query()->firstOrCreate(
                    [
                        'user_id' => $matchingUser->id,
                        'device_id' => $credentials['device_id'],
                    ],
                    [
                        'first_seen_at' => now(),
                    ]
                );
                $newDevice = true;
            }
        }

        $token = $matchingUser->createToken('customer-app')->plainTextToken;

        return response()->json([
            'role' => 'customer',
            'token' => $token,
            'new_device' => $newDevice,
            'user' => $this->customerPayload($matchingUser),
        ]);
    }

    public function me(Request $request)
    {
        $user = $request->user();

        if ($user->hasRoleAccess('driver') || $user->role === 'driver') {
            return response()->json([
                'role' => 'driver',
                'user' => $this->driverPayload($user),
            ]);
        }

        if ($user->role === 'customer') {
            return response()->json([
                'role' => 'customer',
                'user' => $this->customerPayload($user),
            ]);
        }

        return response()->json([
            'role' => $user->role,
            'user' => [
                'id' => $user->id,
                'fullName' => $user->name,
                'phone' => $user->phone,
                'role' => $user->role,
                'status' => $user->status,
            ],
        ]);
    }

    private function normalizePhone(string $phone): string
    {
        return preg_replace('/\D+/', '', $phone) ?? $phone;
    }

    private function driverPayload(User $user): array
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
            'photo' => $user->photo ? Media::url($user->photo) : null,
            'role' => 'driver',
            'status' => $user->status,
            'rating' => (float) $user->rating,
            'completed_orders' => (int) $user->completed_orders,
            'vehicle_type' => $user->vehicle_type,
            'plate_no' => $user->plate_no,
        ];
    }

    private function customerPayload(User $user): array
    {
        $customer = Customer::query()->firstOrCreate(
            ['user_id' => $user->id],
            [
                'customer_code' => Customer::generateCustomerCode(),
                'full_name' => $user->name,
                'phone' => $user->phone,
                'email' => $user->email && ! str_ends_with($user->email, '@customer.morebites.local') ? $user->email : null,
                'status' => 'ACTIVE',
                'registered_at' => now(),
            ]
        );

        return [
            'id' => $user->id,
            'customer_id' => $customer->id,
            'fullName' => $user->name,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'email' => $user->email && ! str_ends_with($user->email, '@customer.morebites.local') ? $user->email : '',
            'phone' => $user->phone,
            'photo' => $user->photo ? Media::url($user->photo) : null,
            'role' => 'customer',
            'status' => $user->status,
            'delivery_address' => $customer->delivery_address,
            'customer_code' => $customer->customer_code,
        ];
    }
}

