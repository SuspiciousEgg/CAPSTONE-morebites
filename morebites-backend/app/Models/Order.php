<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Order extends Model
{
    public const MAX_LATE_DISCOUNT_PERCENT = 50;

    protected $fillable = [
        'order_code', 'idempotency_key', 'customer_id', 'loyalty_customer_id', 'customer_name', 'order_type',
        'total', 'points_used', 'points_discount', 'late_discount', 'delivery_fee', 'service_fee', 'status', 'cancellation_reason', 'inventory_deducted', 'order_date', 'payment_method', 'payment_status',
        'delivery_address', 'dest_lat', 'dest_lng', 'current_lat', 'current_lng', 'driver_id', 'assigned_at', 'delivered_at',
        'proof_of_delivery', 'delivery_minutes', 'estimated_delivery_minutes', 'late_minutes', 'late_discount_percent', 'delivery_distance_km', 'route_coordinates',
        'food_rating', 'food_comment', 'rider_rating', 'rider_comment', 'rated_at',
        'customer_rating',
    ];

    protected function casts(): array
    {
        return [
            'total' => 'float',
            'points_used' => 'integer',
            'points_discount' => 'float',
            'late_discount' => 'float',
            'loyalty_customer_id' => 'integer',
            'delivery_fee' => 'float',
            'service_fee' => 'float',
            'inventory_deducted' => 'boolean',
            'order_date' => 'date',
            'assigned_at' => 'datetime',
            'delivered_at' => 'datetime',
            'rated_at' => 'datetime',
            'customer_rating' => 'integer',
            'delivery_minutes' => 'integer',
            'estimated_delivery_minutes' => 'integer',
            'late_minutes' => 'integer',
            'late_discount_percent' => 'integer',
            'delivery_distance_km' => 'float',
            'dest_lat' => 'float',
            'dest_lng' => 'float',
            'current_lat' => 'float',
            'current_lng' => 'float',
            'route_coordinates' => 'array',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function loyaltyCustomer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'loyalty_customer_id');
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'driver_id');
    }

    /**
     * Generate next order code using genuine auto-increment integer column from order_sequences.
     * Formatted with consistent 5-digit zero padding: #ORD-00028
     */
    public static function generateOrderCode(): string
    {
        $seq = \Illuminate\Support\Facades\DB::table('order_sequences')->insertGetId([]);

        return '#ORD-'.str_pad((string) $seq, 5, '0', STR_PAD_LEFT);
    }

    /**
     * Scope to filter only real generated system orders (#ORD-XXXXX format with digits),
     * excluding non-standard test codes like #ORD-PRIOR-1, #ORD-CUR-1, etc.
     */
    public function scopeRealOrderCodes($query)
    {
        $driver = \Illuminate\Support\Facades\DB::connection()->getDriverName();
        if ($driver === 'sqlite') {
            return $query->whereRaw("order_code GLOB '#ORD-[0-9]*' AND order_code NOT GLOB '#ORD-*[A-Za-z]*'");
        }

        return $query->whereRaw("order_code REGEXP '^#ORD-[0-9]+$'");
    }

    public function resolveRouteBinding($value, $field = null)
    {
        if ($field) {
            return parent::resolveRouteBinding($value, $field);
        }

        $code = str_starts_with((string) $value, '#') ? (string) $value : '#'.(string) $value;

        return $this->where('id', $value)
            ->orWhere('order_code', $value)
            ->orWhere('order_code', $code)
            ->first();
    }

    /**
     * Format a distinct Digital Receipt number derived from the order code (e.g. #ORD-00030 -> RCPT-00030).
     */
    public function receiptNumber(): string
    {
        $digits = preg_replace('/\D+/', '', (string) $this->order_code);
        if ($digits === '' || $digits === null) {
            $digits = (string) $this->id;
        }

        return 'RCPT-'.str_pad($digits, 5, '0', STR_PAD_LEFT);
    }

    public function loyaltyEntries(): HasMany
    {
        return $this->hasMany(LoyaltyLedger::class);
    }

    /**
     * Get loyalty points credited for this completed order from the loyalty ledger.
     */
    public function loyaltyPointsEarned(): int
    {
        if (! in_array($this->status, ['Completed', 'Delivered'], true)) {
            return 0;
        }

        $entry = $this->relationLoaded('loyaltyEntries')
            ? $this->loyaltyEntries->firstWhere('type', 'earn')
            : $this->hasMany(LoyaltyLedger::class)->where('type', 'earn')->first();

        return $entry ? (int) $entry->points : 0;
    }

    /**
     * Calculate late delivery metrics and discount when an online delivery order is marked Delivered.
     *
     * Rules (Prompt 122):
     * - Compares actual elapsed delivery time (from assigned_at or created_at to delivered_at)
     *   against estimated_delivery_minutes (or delivery_minutes prior to completion).
     * - For every full 10-minute block late, applies a 10% discount to the food subtotal
     *   (excluding delivery_fee and service_fee), capped at 50% maximum.
     * - Independent of and additive with loyalty points_discount on the food subtotal.
     */
    public function calculateLateDeliveryPayload(?\Illuminate\Support\Carbon $deliveredAt = null): array
    {
        $deliveredAt ??= $this->delivered_at ?? now();
        $startTime = $this->assigned_at ?? $this->created_at;

        $estimatedMins = (int) (
            $this->estimated_delivery_minutes
            ?: $this->delivery_minutes
            ?: max(8, (int) round(((float) ($this->delivery_distance_km ?: 2.5)) * 4))
        );

        $actualMins = $startTime
            ? max(1, (int) floor($startTime->diffInMinutes($deliveredAt)))
            : $estimatedMins;

        $lateMins = max(0, $actualMins - $estimatedMins);
        $tenMinBlocks = intdiv($lateMins, 10);
        $latePercent = min(self::MAX_LATE_DISCOUNT_PERCENT, $tenMinBlocks * 10);

        $items = $this->relationLoaded('items') ? $this->items : $this->items()->get();
        $itemsSubtotal = (float) $items->sum(fn ($i) => ((int) $i->qty) * ((float) $i->unit_price));
        $deliveryFee = (float) ($this->delivery_fee ?? 0);
        $serviceFee = (float) ($this->service_fee ?? 0);
        $pointsDiscount = (float) ($this->points_discount ?? 0);

        $foodSubtotal = $itemsSubtotal > 0
            ? $itemsSubtotal
            : max(0.0, (float) $this->total + $pointsDiscount + (float) ($this->late_discount ?? 0) - $deliveryFee - $serviceFee);

        $lateDiscount = $latePercent > 0
            ? round($foodSubtotal * ($latePercent / 100), 2)
            : 0.0;

        $discountedFood = max(0.0, $foodSubtotal - $pointsDiscount - $lateDiscount);
        $newTotal = round($discountedFood + $deliveryFee + $serviceFee, 2);

        return [
            'estimated_delivery_minutes' => $estimatedMins,
            'delivery_minutes' => $actualMins,
            'late_minutes' => $lateMins,
            'late_discount_percent' => $latePercent,
            'late_discount' => $lateDiscount,
            'total' => $newTotal,
        ];
    }

    /**
     * Get staff-visible issue reports logged by the rider for this delivery order.
     */
    public function reportedIssues(): array
    {
        return Notification::query()
            ->where('type', 'rider_issue')
            ->where(function ($q) {
                $q->where('data->order_id', $this->id)
                    ->orWhere('data->order_id', (string) $this->id)
                    ->orWhere('data->order_code', $this->order_code);
            })
            ->latest('id')
            ->get()
            ->map(fn ($n) => [
                'id' => $n->id,
                'issue' => $n->data['issue'] ?? 'Delivery Issue',
                'notes' => $n->data['notes'] ?? null,
                'driver_name' => $n->data['driver_name'] ?? ($this->driver?->name ?? 'Rider'),
                'created_at' => $n->created_at?->toIso8601String(),
                'time_label' => $n->created_at?->format('M j, Y · g:i A'),
            ])
            ->values()
            ->all();
    }
}

