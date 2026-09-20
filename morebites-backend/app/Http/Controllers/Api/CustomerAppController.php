<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Customer;
use App\Models\MenuItem;
use App\Models\Notification;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\TrustedDevice;
use App\Models\User;
use App\Services\DeliveryRateService;
use App\Services\InventoryDeductionService;
use App\Services\TopSellingService;
use App\Services\TrackingService;
use App\Support\Media;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
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
        $customer = Customer::query()->where('user_id', $user->id)->first();

        return [
            'id' => $user->id,
            'fullName' => $user->name,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'email' => $user->email && ! str_ends_with($user->email, '@customer.morebites.local') ? $user->email : '',
            'phone' => $user->phone,
            'photo' => $user->photo ? Media::url($user->photo) : null,
            'role' => $user->role,
            'status' => $user->status,
            'delivery_address' => $customer?->delivery_address,
            'customer_code' => $customer?->customer_code,
        ];
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
        $displayStatus = $o->status === 'Completed' ? 'Delivered' : $o->status;
        $date = $o->created_at;
        $firstItem = $o->items->first();

        return [
            'id' => $o->order_code,
            'db_id' => $o->id,
            'status' => $displayStatus,
            'date' => $date?->toIso8601String(),
            'dateLabel' => $date?->format('M j, Y · g:i A'),
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
            'delivered_at' => $o->delivered_at?->toIso8601String(),
            'delivered_at_label' => $o->delivered_at?->format('M j, Y · g:i A'),
        ];
    }
}
