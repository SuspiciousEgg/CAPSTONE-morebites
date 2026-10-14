<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LoyaltySetting extends Model
{
    protected $table = 'loyalty_settings';

    protected $fillable = [
        'spend_per_point',
        'peso_value_per_point',
        'minimum_points_to_redeem',
        'points_expiry_days',
        'enabled',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'spend_per_point' => 'float',
            'peso_value_per_point' => 'float',
            'minimum_points_to_redeem' => 'integer',
            'points_expiry_days' => 'integer',
            'enabled' => 'boolean',
        ];
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public static function current(): self
    {
        $setting = static::query()->first();
        if (! $setting) {
            $setting = static::query()->create([
                'spend_per_point' => 2.00,
                'peso_value_per_point' => 0.10,
                'minimum_points_to_redeem' => 100,
                'points_expiry_days' => 30,
                'enabled' => true,
            ]);
        }

        return $setting;
    }

    public function percentBack(): float
    {
        if ($this->spend_per_point <= 0) {
            return 0.0;
        }

        return round(($this->peso_value_per_point / $this->spend_per_point) * 100, 2);
    }
}

