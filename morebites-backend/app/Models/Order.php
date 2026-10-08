<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Order extends Model
{
    protected $fillable = [
        'order_code', 'customer_id', 'customer_name', 'order_type',
        'total', 'delivery_fee', 'service_fee', 'status', 'cancellation_reason', 'inventory_deducted', 'order_date', 'payment_method', 'payment_status',
        'delivery_address', 'dest_lat', 'dest_lng', 'current_lat', 'current_lng', 'driver_id', 'assigned_at', 'delivered_at',
        'proof_of_delivery', 'delivery_minutes', 'delivery_distance_km', 'route_coordinates',
        'food_rating', 'food_comment', 'rider_rating', 'rider_comment', 'rated_at',
    ];

    protected function casts(): array
    {
        return [
            'total' => 'float',
            'delivery_fee' => 'float',
            'service_fee' => 'float',
            'inventory_deducted' => 'boolean',
            'order_date' => 'date',
            'assigned_at' => 'datetime',
            'delivered_at' => 'datetime',
            'rated_at' => 'datetime',
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

    /**
     * Calculate loyalty points earned on order completion using the established
     * system-wide formula from ReportController (round(total / 2) pts).
     */
    public function loyaltyPointsEarned(): int
    {
        if (! in_array($this->status, ['Completed', 'Delivered'], true)) {
            return 0;
        }

        return (int) round(((float) $this->total) / 2);
    }
}

