<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DeliveryRate extends Model
{
    protected $fillable = [
        'min_km',
        'max_km',
        'fee',
        'active',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'min_km' => 'float',
            'max_km' => 'float',
            'fee' => 'float',
            'active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function label(): string
    {
        $min = number_format((float) $this->min_km, $this->min_km == (int) $this->min_km ? 0 : 1);
        if ($this->max_km === null) {
            return "{$min}+ km";
        }
        $max = number_format((float) $this->max_km, $this->max_km == (int) $this->max_km ? 0 : 1);

        return "{$min} – {$max} km";
    }

    public static function syncFixedTiers(): void
    {
        $tiers = config('delivery_rates.tiers', []);
        $ids = [];

        foreach ($tiers as $tier) {
            $rate = static::query()->firstOrNew(['sort_order' => $tier['sort_order']]);
            $rate->min_km = $tier['min_km'];
            $rate->max_km = $tier['max_km'];
            if (! $rate->exists) {
                $rate->fee = $tier['fee'];
                $rate->active = true;
            }
            $rate->save();
            $ids[] = $rate->id;
        }

        static::query()->whereNotIn('id', $ids)->delete();
    }
}
