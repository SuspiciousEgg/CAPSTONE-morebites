<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\MenuItem;
use App\Models\Notification;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\PasswordResetOtp;
use App\Models\TrustedDevice;
use App\Models\User;
use App\Services\DeliveryRateService;
use App\Services\InventoryDeductionService;
use App\Services\SmsOtpService;
use App\Services\TopSellingService;
use App\Services\TrackingService;
use App\Support\Media;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class CustomerAppController extends Controller
{
    public function register(Request $request)
    {
        $data = $request->validate([
            'full_name' => ['required', 'string', 'max:120'],
            'phone' => ['required', 'string', 'regex:/^09\d{9}$/'],
            'password' => ['required', 'string', 'min:6', 'confirmed'],
            'email' => ['nullable', 'email'],
        ], [
            'phone.regex' => 'Enter a valid 11-digit Philippine mobile number starting with 09.',
        ]);

        $phone = $data['phone'];

        $exists = User::query()
            ->where('role', 'customer')
            ->where(function ($q) use ($phone, $data) {
                $q->where('phone', $data['phone'])
                    ->orWhere('phone', $phone)
                    ->orWhereRaw("REPLACE(REPLACE(phone, ' ', ''), '-', '') = ?", [$phone]);
            })
            ->exists();

        if ($exists) {
            throw ValidationException::withMessages([
                'phone' => ['Phone number already registered.'],
            ]);
        }

        $parts = preg_split('/\s+/', trim($data['full_name']), 2);
        $first = $parts[0] ?? $data['full_name'];
        $last = $parts[1] ?? '';
        $email = $data['email'] ?? ($phone.'@customer.morebites.local');

        $user = DB::transaction(function () use ($data, $phone, $first, $last, $email) {
            $user = User::query()->create([
                'name' => $data['full_name'],
                'first_name' => $first,
                'last_name' => $last,
                'email' => $email,
                'username' => strtolower($phone),
                'phone' => $phone,
                'password' => $data['password'],
                'role' => 'customer',
                'role_access' => [],
                'status' => 'Active',
            ]);

            Customer::query()->create([
                'user_id' => $user->id,
                'customer_code' => Customer::generateCustomerCode(),
                'full_name' => $data['full_name'],
                'phone' => $phone,
                'email' => $data['email'] ?? null,
                'status' => 'ACTIVE',
                'registered_at' => now(),
            ]);

            return $user;
        });

        $token = $user->createToken('customer-app')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $this->userPayload($user),
        ], 201);
    }

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'phone' => ['required', 'string', 'regex:/^09\d{9}$/'],
            'password' => ['required', 'string'],
            'device_id' => ['required', 'string'],
        ], [
            'phone.regex' => 'Enter a valid 11-digit Philippine mobile number starting with 09.',
        ]);

        $phone = $this->normalizePhone($credentials['phone']);

        $user = User::query()
            ->where('role', 'customer')
            ->whereNull('archived_at')
            ->where(function ($query) use ($phone, $credentials) {
                $query->where('phone', $credentials['phone'])
                    ->orWhere('phone', $phone)
                    ->orWhereRaw("REPLACE(REPLACE(phone, ' ', ''), '-', '') = ?", [$phone]);
            })
            ->first();

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            throw ValidationException::withMessages([
                'phone' => ['Incorrect phone number or password.'],
            ]);
        }

        if ($user->status !== 'Active') {
            throw ValidationException::withMessages([
                'phone' => ['Your account is inactive.'],
            ]);
        }

        $trustedDevice = TrustedDevice::query()
            ->where('user_id', $user->id)
            ->where('device_id', $credentials['device_id'])
            ->first();

        $newDevice = false;
        if (! $trustedDevice) {
            TrustedDevice::query()->firstOrCreate(
                [
                    'user_id' => $user->id,
                    'device_id' => $credentials['device_id'],
                ],
                [
                    'first_seen_at' => now(),
                ]
            );
            $newDevice = true;
        }

        $token = $user->createToken('customer-app')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $this->userPayload($user),
            'new_device' => $newDevice,
        ]);
    }

    /**
     * PROMPT 46 DIAGNOSTIC REPORT — Forgot-Password / OTP End-to-End Audit:
     *
     * 1. Mobile Flow Screens & API Calls (`morebites-customer/app/(auth)/`) — Classification: UI-only
     *    - `forgot-password.jsx`: Validated phone against `/^09\d{9}$/` on the client, then navigated
     *      directly to `/(auth)/verify-otp` with zero network call.
     *    - `verify-otp.jsx`: Checked `if (entered !== "123456")` against a hardcoded static string
     *      on the client, with a fake 20s local timer and zero network call.
     *    - `reset-password.jsx`: Checked `password === confirm` locally, ignored `phone`/tokens, and
     *      navigated directly to `/(auth)/reset-success` without updating any database record.
     *    - `reset-success.jsx`: Static confirmation screen navigating back to `/(auth)/login`.
     *    - `src/api/client.js`: Contained no forgot-password, verify-otp, or reset-password methods.
     *
     * 2. Laravel Backend Audit (`morebites-backend`) — Classification: UI-only (Missing)
     *    - Routes (`routes/api.php`), Controller Methods, & Form Requests: None existed (`UI-only`).
     *    - OTP / Password-Reset Table & Migration: Only the unused default `password_reset_tokens`
     *      (keyed by `email`) existed; no phone-based OTP table, expiry, attempt counter, cooldown,
     *      or single-use reset token existed (`UI-only`).
     *    - SMS Gateway Config (`.env` / `config/services.php`): `.env` has `MAIL_MAILER=log` and no
     *      SMS gateway credentials (`UI-only`).
     *
     * 3. Real Backend Implementation:
     *    - `requestPasswordResetOtp`: Validates `^09\d{9}$`, enforces a 60-second resend cooldown,
     *      generates a CSPRNG 6-digit code (`random_int(0, 999999)`), stores only `Hash::make($code)`
     *      with a 5-minute expiry in `password_reset_otps`, dispatches via `SmsOtpService::sendOtp()`
     *      (which logs to `storage/logs/laravel.log` in local/testing when no SMS provider is configured),
     *      and returns an identical generic response whether or not the phone is registered.
     *    - `verifyPasswordResetOtp`: Enforces the 5-minute expiry and a strict limit of 5 wrong
     *      attempts (invalidating the OTP on the 5th failed attempt), and issues a short-lived (10-min),
     *      single-use 64-char `reset_token` (stored hashed with SHA-256).
     *    - `resetPasswordWithToken`: Requires the valid, unconsumed `reset_token` + confirmed new
     *      password, updates the customer's hashed password, and immediately invalidates the token.
     */
    public function requestPasswordResetOtp(Request $request, SmsOtpService $smsService)
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'regex:/^09\d{9}$/'],
        ], [
            'phone.regex' => 'Enter a valid 11-digit Philippine mobile number starting with 09.',
        ]);

        $phone = $this->normalizePhone($data['phone']);
        $existing = PasswordResetOtp::query()->where('phone', $phone)->first();

        if ($existing && $existing->last_sent_at) {
            $elapsed = (int) $existing->last_sent_at->diffInSeconds(now());
            if ($elapsed < PasswordResetOtp::RESEND_COOLDOWN_SECONDS) {
                $remaining = max(1, PasswordResetOtp::RESEND_COOLDOWN_SECONDS - $elapsed);

                return response()->json([
                    'message' => "Please wait {$remaining} seconds before requesting another code.",
                    'retry_after' => $remaining,
                ], 429);
            }
        }

        $user = User::query()
            ->where('role', 'customer')
            ->whereNull('archived_at')
            ->where(function ($query) use ($phone, $data) {
                $query->where('phone', $data['phone'])
                    ->orWhere('phone', $phone)
                    ->orWhereRaw("REPLACE(REPLACE(phone, ' ', ''), '-', '') = ?", [$phone]);
            })
            ->first();

        if ($user && $user->status === 'Active') {
            $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

            PasswordResetOtp::query()->updateOrCreate(
                ['phone' => $phone],
                [
                    'user_id' => $user->id,
                    'otp_hash' => Hash::make($code),
                    'otp_expires_at' => now()->addMinutes(PasswordResetOtp::OTP_EXPIRY_MINUTES),
                    'attempts' => 0,
                    'last_sent_at' => now(),
                    'reset_token_hash' => null,
                    'reset_token_expires_at' => null,
                    'consumed_at' => null,
                ]
            );

            $smsService->sendOtp($phone, $code);
        } else {
            PasswordResetOtp::query()->updateOrCreate(
                ['phone' => $phone],
                [
                    'user_id' => null,
                    'otp_hash' => null,
                    'otp_expires_at' => now()->addMinutes(PasswordResetOtp::OTP_EXPIRY_MINUTES),
                    'attempts' => 0,
                    'last_sent_at' => now(),
                    'reset_token_hash' => null,
                    'reset_token_expires_at' => null,
                    'consumed_at' => null,
                ]
            );
        }

        return response()->json([
            'message' => 'If this phone number is registered, a 6-digit verification code has been sent.',
            'cooldown_seconds' => PasswordResetOtp::RESEND_COOLDOWN_SECONDS,
            'expires_in_seconds' => PasswordResetOtp::OTP_EXPIRY_MINUTES * 60,
        ]);
    }

    public function verifyPasswordResetOtp(Request $request)
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'regex:/^09\d{9}$/'],
            'code' => ['required', 'string', 'regex:/^\d{6}$/'],
        ], [
            'phone.regex' => 'Enter a valid 11-digit Philippine mobile number starting with 09.',
            'code.regex' => 'Please enter a valid 6-digit verification code.',
        ]);

        $phone = $this->normalizePhone($data['phone']);
        $record = PasswordResetOtp::query()->where('phone', $phone)->first();

        if (! $record || ! $record->otp_hash || $record->consumed_at !== null) {
            if ($record) {
                if ($record->attempts >= PasswordResetOtp::MAX_ATTEMPTS) {
                    throw ValidationException::withMessages([
                        'code' => ['Too many incorrect attempts. This code has been invalidated. Please request a new code.'],
                    ]);
                }

                $nextAttempts = $record->attempts + 1;
                $record->update(['attempts' => $nextAttempts]);

                if ($nextAttempts >= PasswordResetOtp::MAX_ATTEMPTS) {
                    throw ValidationException::withMessages([
                        'code' => ['Too many incorrect attempts. This code has been invalidated. Please request a new code.'],
                    ]);
                }
            }

            throw ValidationException::withMessages([
                'code' => ['Incorrect OTP. Please try again.'],
            ]);
        }

        if ($record->attempts >= PasswordResetOtp::MAX_ATTEMPTS) {
            $record->update(['otp_hash' => null]);

            throw ValidationException::withMessages([
                'code' => ['Too many incorrect attempts. This code has been invalidated. Please request a new code.'],
            ]);
        }

        if (! $record->otp_expires_at || $record->otp_expires_at->isPast()) {
            $record->update(['otp_hash' => null]);

            throw ValidationException::withMessages([
                'code' => ['This verification code has expired. Please request a new code.'],
            ]);
        }

        if (! Hash::check($data['code'], $record->otp_hash)) {
            $nextAttempts = $record->attempts + 1;

            if ($nextAttempts >= PasswordResetOtp::MAX_ATTEMPTS) {
                $record->update([
                    'attempts' => $nextAttempts,
                    'otp_hash' => null,
                ]);

                throw ValidationException::withMessages([
                    'code' => ['Too many incorrect attempts. This code has been invalidated. Please request a new code.'],
                ]);
            }

            $record->update(['attempts' => $nextAttempts]);

            throw ValidationException::withMessages([
                'code' => ['Incorrect OTP. Please try again.'],
            ]);
        }

        $plainResetToken = Str::random(64);

        $record->update([
            'otp_hash' => null,
            'otp_expires_at' => null,
            'attempts' => 0,
            'reset_token_hash' => hash('sha256', $plainResetToken),
            'reset_token_expires_at' => now()->addMinutes(PasswordResetOtp::RESET_TOKEN_EXPIRY_MINUTES),
            'consumed_at' => null,
        ]);

        return response()->json([
            'message' => 'OTP verified successfully.',
            'reset_token' => $plainResetToken,
            'expires_in_seconds' => PasswordResetOtp::RESET_TOKEN_EXPIRY_MINUTES * 60,
        ]);
    }

    public function resetPasswordWithToken(Request $request)
    {
        $data = $request->validate([
            'reset_token' => ['required', 'string', 'min:32'],
            'password' => ['required', 'string', 'min:6', 'confirmed'],
        ]);

        $tokenHash = hash('sha256', $data['reset_token']);
        $record = PasswordResetOtp::query()
            ->where('reset_token_hash', $tokenHash)
            ->whereNull('consumed_at')
            ->first();

        if (! $record || ! $record->reset_token_expires_at || $record->reset_token_expires_at->isPast()) {
            if ($record) {
                $record->update([
                    'reset_token_hash' => null,
                    'reset_token_expires_at' => null,
                ]);
            }

            throw ValidationException::withMessages([
                'reset_token' => ['Your password reset session is invalid or has expired. Please request a new OTP code.'],
            ]);
        }

        $user = $record->user_id
            ? User::query()
                ->where('id', $record->user_id)
                ->where('role', 'customer')
                ->whereNull('archived_at')
                ->first()
            : User::query()
                ->where('role', 'customer')
                ->whereNull('archived_at')
                ->where('phone', $record->phone)
                ->first();

        if (! $user || $user->status !== 'Active') {
            $record->update([
                'reset_token_hash' => null,
                'reset_token_expires_at' => null,
                'consumed_at' => now(),
            ]);

            throw ValidationException::withMessages([
                'reset_token' => ['Your password reset session is invalid or has expired. Please request a new OTP code.'],
            ]);
        }

        DB::transaction(function () use ($user, $record, $data) {
            $user->update([
                'password' => $data['password'],
            ]);

            $record->update([
                'otp_hash' => null,
                'otp_expires_at' => null,
                'reset_token_hash' => null,
                'reset_token_expires_at' => null,
                'consumed_at' => now(),
            ]);

            $user->tokens()->delete();
        });

        return response()->json([
            'message' => 'Your password has been reset successfully.',
        ]);
    }

    public function me(Request $request)
    {
        return response()->json(['user' => $this->userPayload($this->customerUser($request))]);
    }

    public function updateProfile(Request $request)
    {
        $user = $this->customerUser($request);

        $data = $request->validate([
            'full_name' => ['sometimes', 'string', 'max:120'],
            'email' => ['nullable', 'email'],
            'phone' => ['sometimes', 'string', 'regex:/^09\d{9}$/'],
            'delivery_address' => ['nullable', 'string'],
            'photo' => ['nullable'],
        ], [
            'phone.regex' => 'Enter a valid 11-digit Philippine mobile number starting with 09.',
        ]);

        if (isset($data['full_name'])) {
            $parts = preg_split('/\s+/', trim($data['full_name']), 2);
            $data['name'] = $data['full_name'];
            $data['first_name'] = $parts[0] ?? $data['full_name'];
            $data['last_name'] = $parts[1] ?? '';
            unset($data['full_name']);
        }

        if (isset($data['phone'])) {
            $data['phone'] = $this->normalizePhone($data['phone']);
        }

        if ($request->hasFile('photo')) {
            $path = $request->file('photo')->store('avatars', 'public');
            $data['photo'] = '/storage/'.$path;
        } elseif ($request->has('photo')) {
            $rawPhoto = $request->input('photo');
            if (is_string($rawPhoto) && preg_match('/^data:image\/(\w+);base64,/', $rawPhoto, $type)) {
                $raw = substr($rawPhoto, strpos($rawPhoto, ',') + 1);
                $decoded = base64_decode($raw);
                if ($decoded !== false) {
                    $ext = strtolower($type[1]);
                    if ($ext === 'jpeg') {
                        $ext = 'jpg';
                    }
                    $filename = 'avatars/avatar_'.$user->id.'_'.time().'.'.$ext;
                    Storage::disk('public')->put($filename, $decoded);
                    $data['photo'] = '/storage/'.$filename;
                } else {
                    $data['photo'] = $rawPhoto;
                }
            } elseif ($rawPhoto === null || $rawPhoto === '') {
                $data['photo'] = null;
            } elseif (is_string($rawPhoto)) {
                $data['photo'] = $rawPhoto;
            }
        }

        $deliveryAddress = $data['delivery_address'] ?? null;
        unset($data['delivery_address']);

        $user->update($data);

        $customer = $this->ensureCustomerRecord($user);
        $customer->update([
            'full_name' => $user->name,
            'phone' => $user->phone,
            'email' => $user->email && ! str_ends_with($user->email, '@customer.morebites.local') ? $user->email : $customer->email,
            'delivery_address' => $deliveryAddress ?? $customer->delivery_address,
        ]);

        return response()->json(['user' => $this->userPayload($user->fresh())]);
    }

    /**
     * Prompt 40 — Saved Addresses Persistence & Retrieval Scoped to customer_id:
     * Queries and persists rows in `customer_addresses` strictly scoped to the
     * currently authenticated customer's `customer_id`.
     */
    public function addresses(Request $request)
    {
        $user = $this->customerUser($request);
        $customer = $this->ensureCustomerRecord($user);

        return response()->json([
            'customer_id' => $customer->id,
            'data' => $this->customerAddressesPayload($customer),
        ]);
    }

    public function storeAddress(Request $request)
    {
        $user = $this->customerUser($request);
        $customer = $this->ensureCustomerRecord($user);

        $data = $request->validate([
            'label' => ['required', 'string', 'max:100'],
            'street' => ['required', 'string', 'max:255'],
            'barangay' => ['required', 'string', 'max:255'],
            'city' => ['required', 'string', 'max:255'],
            'landmark' => ['nullable', 'string', 'max:255'],
            'latitude' => ['nullable', 'numeric'],
            'longitude' => ['nullable', 'numeric'],
            'is_default' => ['nullable', 'boolean'],
            'isDefault' => ['nullable', 'boolean'],
        ]);

        $address = DB::transaction(function () use ($customer, $data, $request) {
            $hasExisting = CustomerAddress::query()
                ->where('customer_id', $customer->id)
                ->exists();

            $requestedDefault = $request->has('is_default')
                ? (bool) $request->boolean('is_default')
                : ($request->has('isDefault') ? (bool) $request->boolean('isDefault') : false);

            $isDefault = ! $hasExisting || $requestedDefault;

            if ($isDefault) {
                CustomerAddress::query()
                    ->where('customer_id', $customer->id)
                    ->update(['is_default' => false]);
            }

            $created = CustomerAddress::query()->create([
                'customer_id' => $customer->id,
                'label' => trim($data['label']),
                'street' => trim($data['street']),
                'barangay' => trim($data['barangay']),
                'city' => trim($data['city']),
                'landmark' => isset($data['landmark']) && trim((string) $data['landmark']) !== '' ? trim((string) $data['landmark']) : null,
                'latitude' => isset($data['latitude']) && $data['latitude'] !== null ? (float) $data['latitude'] : null,
                'longitude' => isset($data['longitude']) && $data['longitude'] !== null ? (float) $data['longitude'] : null,
                'is_default' => $isDefault,
            ]);

            $this->syncCustomerDefaultDeliveryAddress($customer);

            return $created;
        });

        return response()->json([
            'customer_id' => $customer->id,
            'data' => $this->addressPayload($address),
            'addresses' => $this->customerAddressesPayload($customer),
        ], 201);
    }

    public function updateAddress(Request $request, CustomerAddress $address)
    {
        $user = $this->customerUser($request);
        $customer = $this->ensureCustomerRecord($user);
        abort_unless((int) $address->customer_id === (int) $customer->id, 403);

        $data = $request->validate([
            'label' => ['required', 'string', 'max:100'],
            'street' => ['required', 'string', 'max:255'],
            'barangay' => ['required', 'string', 'max:255'],
            'city' => ['required', 'string', 'max:255'],
            'landmark' => ['nullable', 'string', 'max:255'],
            'latitude' => ['nullable', 'numeric'],
            'longitude' => ['nullable', 'numeric'],
            'is_default' => ['nullable', 'boolean'],
            'isDefault' => ['nullable', 'boolean'],
        ]);

        DB::transaction(function () use ($customer, $address, $data, $request) {
            $requestedDefault = $request->has('is_default')
                ? (bool) $request->boolean('is_default')
                : ($request->has('isDefault') ? (bool) $request->boolean('isDefault') : (bool) $address->is_default);

            if ($requestedDefault) {
                CustomerAddress::query()
                    ->where('customer_id', $customer->id)
                    ->where('id', '!=', $address->id)
                    ->update(['is_default' => false]);
            }

            $address->update([
                'label' => trim($data['label']),
                'street' => trim($data['street']),
                'barangay' => trim($data['barangay']),
                'city' => trim($data['city']),
                'landmark' => isset($data['landmark']) && trim((string) $data['landmark']) !== '' ? trim((string) $data['landmark']) : null,
                'latitude' => array_key_exists('latitude', $data) && $data['latitude'] !== null ? (float) $data['latitude'] : null,
                'longitude' => array_key_exists('longitude', $data) && $data['longitude'] !== null ? (float) $data['longitude'] : null,
                'is_default' => $requestedDefault,
            ]);

            $this->syncCustomerDefaultDeliveryAddress($customer);
        });

        return response()->json([
            'customer_id' => $customer->id,
            'data' => $this->addressPayload($address->fresh()),
            'addresses' => $this->customerAddressesPayload($customer),
        ]);
    }

    public function setDefaultAddress(Request $request, CustomerAddress $address)
    {
        $user = $this->customerUser($request);
        $customer = $this->ensureCustomerRecord($user);
        abort_unless((int) $address->customer_id === (int) $customer->id, 403);

        DB::transaction(function () use ($customer, $address) {
            CustomerAddress::query()
                ->where('customer_id', $customer->id)
                ->update(['is_default' => false]);

            $address->update(['is_default' => true]);
            $this->syncCustomerDefaultDeliveryAddress($customer);
        });

        return response()->json([
            'customer_id' => $customer->id,
            'data' => $this->addressPayload($address->fresh()),
            'addresses' => $this->customerAddressesPayload($customer),
        ]);
    }

    public function destroyAddress(Request $request, CustomerAddress $address)
    {
        $user = $this->customerUser($request);
        $customer = $this->ensureCustomerRecord($user);
        abort_unless((int) $address->customer_id === (int) $customer->id, 403);

        DB::transaction(function () use ($customer, $address) {
            $wasDefault = (bool) $address->is_default;
            $address->delete();

            if ($wasDefault) {
                $nextDefault = CustomerAddress::query()
                    ->where('customer_id', $customer->id)
                    ->orderBy('id')
                    ->first();

                if ($nextDefault) {
                    $nextDefault->update(['is_default' => true]);
                }
            }

            $this->syncCustomerDefaultDeliveryAddress($customer);
        });

        return response()->json([
            'customer_id' => $customer->id,
            'message' => 'Address removed.',
            'addresses' => $this->customerAddressesPayload($customer),
        ]);
    }

    public function menu()
    {
        $service = app(InventoryDeductionService::class);
        $service->syncMenuAvailability();

        // Prompt 23: Aggregate real food rating data per menu item from customer orders.
        // When customers rate their orders, food ratings are stored in orders.food_rating.
        // Each order links to menu items via order_items.menu_item_id.
        $ratingStats = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereNotNull('orders.food_rating')
            ->whereNotNull('order_items.menu_item_id')
            ->select(
                'order_items.menu_item_id',
                DB::raw('ROUND(AVG(orders.food_rating), 1) as avg_rating'),
                DB::raw('COUNT(DISTINCT orders.id) as review_count')
            )
            ->groupBy('order_items.menu_item_id')
            ->get()
            ->keyBy('menu_item_id');

        $items = MenuItem::query()
            ->with(['sizes', 'ingredients.inventoryItem'])
            ->where('archived', false)
            ->orderBy('category')
            ->orderBy('name')
            ->get()
            ->map(fn (MenuItem $m) => $this->menuPayload($m, $service, $ratingStats->get($m->id)))
            ->values();

        return response()->json(['data' => $items]);
    }

    public function topSelling(TopSellingService $service)
    {
        return response()->json(['data' => $service->getTopSelling()]);
    }

    public function orders(Request $request)
    {
        $user = $this->customerUser($request);
        $customer = $this->ensureCustomerRecord($user);

        $orders = Order::query()
            ->with(['items', 'driver'])
            ->where('customer_id', $customer->id)
            ->latest()
            ->get()
            ->map(fn (Order $o) => $this->orderPayload($o));

        return response()->json(['data' => $orders]);
    }

    public function showOrder(Request $request, Order $order)
    {
        $user = $this->customerUser($request);
        $customer = $this->ensureCustomerRecord($user);
        abort_unless((int) $order->customer_id === (int) $customer->id, 403);

        return response()->json([
            'data' => $this->orderPayload($order->load(['items', 'driver'])),
        ]);
    }

    public function rateOrder(Request $request, Order $order)
    {
        $user = $this->customerUser($request);
        $customer = $this->ensureCustomerRecord($user);
        abort_unless((int) $order->customer_id === (int) $customer->id, 403);
        abort_unless(in_array($order->status, ['Completed', 'Delivered'], true), 422, 'Order is not delivered yet.');
        abort_unless(! $order->rated_at, 422, 'Order was already rated.');

        $data = $request->validate([
            'food_rating' => ['nullable', 'integer', 'min:1', 'max:5'],
            'food_comment' => ['nullable', 'string', 'max:1000'],
            'rider_rating' => ['nullable', 'integer', 'min:1', 'max:5'],
            'rider_comment' => ['nullable', 'string', 'max:1000'],
        ]);

        if (empty($data['food_rating']) && empty($data['rider_rating'])) {
            throw ValidationException::withMessages([
                'food_rating' => 'Please rate the food or the rider.',
            ]);
        }

        $order->update([
            'food_rating' => $data['food_rating'] ?? null,
            'food_comment' => $data['food_comment'] ?? null,
            'rider_rating' => $data['rider_rating'] ?? null,
            'rider_comment' => $data['rider_comment'] ?? null,
            'rated_at' => now(),
        ]);

        if (! empty($data['rider_rating']) && $order->driver_id) {
            \App\Models\DriverReview::query()->create([
                'driver_id' => $order->driver_id,
                'text' => $data['rider_comment'] ?: 'Customer rating',
                'rating' => (int) $data['rider_rating'],
                'reviewed_at' => now(),
            ]);

            $avg = \App\Models\DriverReview::query()
                ->where('driver_id', $order->driver_id)
                ->avg('rating');

            $order->driver()?->update(['rating' => round((float) $avg, 1)]);
        }

        return response()->json([
            'message' => 'Thanks for your rating!',
            'data' => $this->orderPayload($order->fresh()->load(['items', 'driver'])),
        ]);
    }

    public function placeOrder(Request $request)
    {
        $user = $this->customerUser($request);
        $customer = $this->ensureCustomerRecord($user);

        $data = $request->validate([
            'full_name' => ['required', 'string'],
            'phone' => ['required', 'string', 'regex:/^09\d{9}$/'],
            'delivery_address' => ['required', 'string'],
            'payment_method' => ['nullable', 'string'],
            'latitude' => ['nullable', 'numeric'],
            'dest_lat' => ['nullable', 'numeric'],
            'lat' => ['nullable', 'numeric'],
            'longitude' => ['nullable', 'numeric'],
            'dest_lng' => ['nullable', 'numeric'],
            'lng' => ['nullable', 'numeric'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.menu_item_id' => ['nullable', 'integer'],
            'items.*.name' => ['required', 'string'],
            'items.*.size' => ['nullable', 'string'],
            'items.*.qty' => ['required', 'integer', 'min:1'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
        ], [
            'phone.regex' => 'Enter a valid 11-digit Philippine mobile number starting with 09.',
        ]);

        $customer->update([
            'full_name' => $data['full_name'],
            'phone' => $this->normalizePhone($data['phone']),
            'delivery_address' => $data['delivery_address'],
        ]);

        $service = app(InventoryDeductionService::class);
        foreach ($data['items'] as $line) {
            if (! empty($line['menu_item_id'])) {
                $menu = MenuItem::query()->find($line['menu_item_id']);
                if ($menu) {
                    $reason = $service->unserviceableReason($menu, (int) $line['qty']);
                    if ($reason === 'expired') {
                        throw ValidationException::withMessages([
                            'items' => ["The item '{$menu->name}' cannot be ordered because one or more ingredients are expired."],
                        ]);
                    }
                    if ($reason === 'insufficient' || ! $menu->available) {
                        throw ValidationException::withMessages([
                            'items' => ["The item '{$menu->name}' is currently unavailable."],
                        ]);
                    }
                }
            }
        }

        $order = DB::transaction(function () use ($data, $customer) {
            $subtotal = collect($data['items'])->sum(fn ($i) => $i['qty'] * $i['unit_price']);
            $tracking = app(TrackingService::class);
            $rates = app(DeliveryRateService::class);

            $lat = $data['latitude'] ?? $data['dest_lat'] ?? $data['lat'] ?? null;
            $lng = $data['longitude'] ?? $data['dest_lng'] ?? $data['lng'] ?? null;

            if ($lat !== null && $lng !== null) {
                $dest = [
                    'latitude' => (float) $lat,
                    'longitude' => (float) $lng,
                ];
            } else {
                $dest = $tracking->geocode($data['delivery_address']);
            }

            $distanceKm = $tracking->distanceKm($tracking->storePoint(), $dest);
            if ($distanceKm !== null && $distanceKm > DeliveryRateService::MAX_DELIVERY_KM) {
                throw ValidationException::withMessages([
                    'delivery_address' => ['Delivery not available beyond 10km.'],
                ]);
            }
            $deliveryFee = $rates->feeForKm($distanceKm);
            $serviceFee = $rates->serviceFee();
            $total = $subtotal + $deliveryFee + $serviceFee;
            $orderCode = $this->nextOrderCode();

            $order = Order::query()->create([
                'order_code' => $orderCode,
                'customer_id' => $customer->id,
                'customer_name' => $data['full_name'],
                'order_type' => 'Online Order',
                'total' => $total,
                'delivery_fee' => $deliveryFee,
                'service_fee' => $serviceFee,
                'status' => 'Pending',
                'payment_method' => $data['payment_method'] ?? 'COD',
                'payment_status' => 'Unpaid',
                'delivery_address' => $data['delivery_address'],
                'dest_lat' => $dest['latitude'],
                'dest_lng' => $dest['longitude'],
                'delivery_distance_km' => $distanceKm,
                'delivery_minutes' => max(15, (int) round($distanceKm * 4)),
            ]);

            foreach ($data['items'] as $item) {
                OrderItem::query()->create([
                    'order_id' => $order->id,
                    'menu_item_id' => $item['menu_item_id'] ?? null,
                    'name' => $item['name'].(! empty($item['size']) ? ' ('.$item['size'].')' : ''),
                    'size' => $item['size'] ?? null,
                    'qty' => $item['qty'],
                    'unit_price' => $item['unit_price'],
                    'line_total' => $item['qty'] * $item['unit_price'],
                ]);
            }

            ActivityLog::query()->create([
                'actor' => $data['full_name'],
                'action' => 'Customer placed order '.$order->order_code,
            ]);

            app(InventoryDeductionService::class)->deductForOrder($order);

            Notification::createOrderNotification($order);

            return $order->load(['items', 'driver']);
        });

        return response()->json(['data' => $this->orderPayload($order)], 201);
    }

    private function customerUser(Request $request): User
    {
        $user = $request->user();
        abort_unless($user && $user->role === 'customer', 403);

        return $user;
    }

    private function ensureCustomerRecord(User $user): Customer
    {
        $customer = Customer::query()->where('user_id', $user->id)->first();
        if ($customer) {
            return $customer;
        }

        return Customer::query()->create([
            'user_id' => $user->id,
            'customer_code' => Customer::generateCustomerCode(),
            'full_name' => $user->name,
            'phone' => $user->phone,
            'email' => $user->email && ! str_ends_with($user->email, '@customer.morebites.local') ? $user->email : null,
            'status' => 'ACTIVE',
            'registered_at' => now(),
        ]);
    }

    private function normalizePhone(string $phone): string
    {
        return preg_replace('/\D+/', '', $phone) ?? $phone;
    }

    private function nextOrderCode(): string
    {
        return Order::generateOrderCode();
    }

    private function userPayload(User $user): array
    {
        $customer = $this->ensureCustomerRecord($user);

        return [
            'id' => $user->id,
            'customer_id' => $customer->id,
            'fullName' => $user->name,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'email' => $user->email && ! str_ends_with($user->email, '@customer.morebites.local') ? $user->email : '',
            'phone' => $user->phone,
            'photo' => $user->photo ? Media::url($user->photo) : null,
            'role' => $user->role,
            'status' => $user->status,
            'delivery_address' => $customer->delivery_address,
            'customer_code' => $customer->customer_code,
        ];
    }

    private function customerAddressesPayload(Customer $customer): array
    {
        return CustomerAddress::query()
            ->where('customer_id', $customer->id)
            ->orderByDesc('is_default')
            ->orderBy('id')
            ->get()
            ->map(fn (CustomerAddress $addr) => $this->addressPayload($addr))
            ->values()
            ->all();
    }

    private function addressPayload(CustomerAddress $addr): array
    {
        return [
            'id' => $addr->id,
            'customer_id' => $addr->customer_id,
            'label' => $addr->label,
            'street' => $addr->street,
            'barangay' => $addr->barangay,
            'city' => $addr->city,
            'landmark' => $addr->landmark ?? '',
            'latitude' => $addr->latitude !== null ? (float) $addr->latitude : null,
            'longitude' => $addr->longitude !== null ? (float) $addr->longitude : null,
            'isDefault' => (bool) $addr->is_default,
            'is_default' => (bool) $addr->is_default,
        ];
    }

    private function syncCustomerDefaultDeliveryAddress(Customer $customer): void
    {
        $defaultAddr = CustomerAddress::query()
            ->where('customer_id', $customer->id)
            ->orderByDesc('is_default')
            ->orderBy('id')
            ->first();

        if ($defaultAddr) {
            $formatted = collect([
                $defaultAddr->street,
                $defaultAddr->barangay,
                $defaultAddr->city,
                $defaultAddr->landmark,
            ])->filter(fn ($v) => $v !== null && trim((string) $v) !== '')->implode(', ');

            $customer->update(['delivery_address' => $formatted]);
        }
    }

    private function menuPayload(MenuItem $m, ?InventoryDeductionService $service = null, $ratingStat = null): array
    {
        $service ??= app(InventoryDeductionService::class);
        $stockOk = $service->canServe($m);
        $stockReason = $service->unserviceableReason($m);
        $isAvailable = (bool) ($m->available && $stockOk);

        $sizes = $m->sizes->map(fn ($s) => [
            'sizeName' => $s->name,
            'price' => (float) $s->price,
        ])->values();

        $min = $sizes->min('price');
        $max = $sizes->max('price');
        $priceLabel = $m->has_sizes && $sizes->count()
            ? '₱'.number_format((float) $min, 0).' - ₱'.number_format((float) $max, 0)
            : '₱'.number_format((float) $m->price, 0);

        $rating = $ratingStat ? (float) $ratingStat->avg_rating : null;
        $reviewCount = $ratingStat ? (int) $ratingStat->review_count : 0;

        return [
            'id' => (string) $m->id,
            'db_id' => $m->id,
            'name' => $m->name,
            'category' => $m->category,
            'description' => $m->description,
            'price' => (float) ($m->has_sizes && $min ? $min : $m->price),
            'priceLabel' => $priceLabel,
            'hasSizes' => (bool) $m->has_sizes,
            'sizes' => $sizes,
            'image' => Media::url($m->image),
            'available' => $isAvailable,
            'availability' => $isAvailable,
            'stockOk' => $stockOk,
            'stockReason' => $stockReason,
            'rating' => $rating,
            'reviewCount' => $reviewCount,
            'reviews' => $reviewCount,
            'promoActive' => (bool) $m->promo_active,
            'promoDiscountPercent' => $m->promo_active ? (float) ($m->promo_discount_percent ?? 0) : null,
            'promoLabel' => $m->promo_active ? ($m->promo_label ?: 'Limited deal') : null,
        ];
    }

    private function orderPayload(Order $o): array
    {
        $displayStatus = match ($o->status) {
            'Completed' => 'Delivered',
            'Picked Up' => 'Out for Delivery',
            default => $o->status,
        };
        $isCompleted = in_array($o->status, ['Completed', 'Delivered'], true) || $displayStatus === 'Delivered';
        $date = $o->created_at;
        $deliveredAt = $o->delivered_at ?? ($isCompleted ? $o->updated_at : null);
        $firstItem = $o->items->first();

        return [
            'id' => $o->order_code,
            'db_id' => $o->id,
            'receipt_number' => $o->receiptNumber(),
            'status' => $displayStatus,
            'raw_status' => $o->status,
            'date' => $date?->toIso8601String(),
            'dateLabel' => $date?->format('M j, Y · g:i A'),
            'ordered_at' => $date?->toIso8601String(),
            'ordered_at_label' => $date?->format('M j, Y · g:i A'),
            'total' => (float) $o->total,
            'delivery_fee' => (float) ($o->delivery_fee ?? app(DeliveryRateService::class)->defaultFee()),
            'service_fee' => (float) ($o->service_fee ?? app(DeliveryRateService::class)->serviceFee()),
            'itemsLabel' => $o->items->map(fn ($i) => $i->qty.'x '.$i->name)->implode(', '),
            'items' => $o->items->map(fn ($i) => [
                'id' => (string) $i->id,
                'name' => $i->name,
                'size' => $i->size,
                'quantity' => (int) $i->qty,
                'price' => (float) $i->unit_price,
            ])->values(),
            'food_name' => $firstItem?->name ?: 'Your order',
            'food_price' => (float) ($firstItem?->unit_price ?? $o->total),
            'address' => $o->delivery_address,
            'payment_method' => $o->payment_method ?: 'COD',
            'payment_status' => $isCompleted ? 'Paid' : ($o->payment_status ?: 'Unpaid'),
            'customer' => $o->customer_name,
            'driver' => $o->driver?->name,
            'driver_phone' => $o->driver?->phone,
            'eta_mins' => (int) ($o->delivery_minutes ?: 25),
            'distance' => number_format((float) ($o->delivery_distance_km ?: 2.5), 1).'km',
            'dest_lat' => $o->dest_lat ? (float) $o->dest_lat : null,
            'dest_lng' => $o->dest_lng ? (float) $o->dest_lng : null,
            'rider_lat' => $o->driver?->current_lat ? (float) $o->driver->current_lat : null,
            'rider_lng' => $o->driver?->current_lng ? (float) $o->driver->current_lng : null,
            'rated' => (bool) $o->rated_at,
            'can_rate' => $displayStatus === 'Delivered' && ! $o->rated_at,
            'food_rating' => $o->food_rating ? (int) $o->food_rating : null,
            'rider_rating' => $o->rider_rating ? (int) $o->rider_rating : null,
            'proof_of_delivery' => Media::url($o->proof_of_delivery),
            'delivered_at' => $deliveredAt?->toIso8601String(),
            'delivered_at_label' => $deliveredAt?->format('M j, Y · g:i A'),
            'payment_confirmed_at' => $deliveredAt?->toIso8601String(),
            'payment_confirmed_at_label' => $deliveredAt?->format('M j, Y · g:i A'),
            'points_earned' => $o->loyaltyPointsEarned(),
        ];
    }
}
