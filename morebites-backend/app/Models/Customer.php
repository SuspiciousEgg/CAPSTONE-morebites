<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Customer extends Model
{
    protected $fillable = [
        'user_id', 'customer_code', 'full_name', 'phone', 'email', 'password',
        'delivery_address', 'status', 'registered_at',
    ];

    protected function casts(): array
    {
        return ['registered_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public static function generateCustomerCode(): string
    {
        $max = 0;
        foreach (static::query()->pluck('customer_code') as $code) {
            if (preg_match('/(\d+)$/', (string) $code, $m)) {
                $num = (int) $m[1];
                if ($num > $max) {
                    $max = $num;
                }
            }
        }
        $next = $max + 1;

        do {
            $candidate = sprintf('C-%04d', $next);
            $next++;
        } while (static::query()->where('customer_code', $candidate)->exists());

        return $candidate;
    }

    protected static function booted(): void
    {
        static::creating(function (Customer $customer) {
            if (empty($customer->customer_code)) {
                $customer->customer_code = static::generateCustomerCode();
            }
        });
    }
}
