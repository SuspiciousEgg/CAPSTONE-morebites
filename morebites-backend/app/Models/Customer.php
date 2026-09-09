<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
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

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }
}
