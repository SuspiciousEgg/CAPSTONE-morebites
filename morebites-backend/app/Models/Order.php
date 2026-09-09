<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Order extends Model
{
    protected $fillable = [
        'order_code', 'customer_id', 'customer_name', 'order_type',
        'total', 'delivery_fee', 'service_fee', 'status', 'payment_method', 'payment_status',
        'delivery_address', 'dest_lat', 'dest_lng', 'driver_id', 'assigned_at', 'delivered_at',
        'proof_of_delivery', 'delivery_minutes', 'delivery_distance_km', 'route_coordinates',
        'food_rating', 'food_comment', 'rider_rating', 'rider_comment', 'rated_at',
    ];

    protected function casts(): array
    {
        return [
            'total' => 'float',
            'delivery_fee' => 'float',
            'service_fee' => 'float',
            'assigned_at' => 'datetime',
            'delivered_at' => 'datetime',
            'rated_at' => 'datetime',
            'delivery_distance_km' => 'float',
            'dest_lat' => 'float',
            'dest_lng' => 'float',
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
}
