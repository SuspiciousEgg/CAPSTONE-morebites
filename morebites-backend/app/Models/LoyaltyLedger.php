<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LoyaltyLedger extends Model
{
    protected $table = 'loyalty_ledger';

    public $timestamps = false;

    protected $fillable = [
        'customer_id',
        'order_id',
        'type',
        'points',
        'balance_after',
        'note',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'points' => 'integer',
            'balance_after' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}

