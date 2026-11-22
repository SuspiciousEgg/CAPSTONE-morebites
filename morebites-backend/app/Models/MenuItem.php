<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MenuItem extends Model
{
    protected $fillable = [
        'name', 'description', 'category', 'subcategory', 'image',
        'has_sizes', 'price', 'available', 'archived', 'is_featured',
        'promo_active', 'promo_discount_percent', 'promo_label',
    ];

    protected function casts(): array
    {
        return [
            'has_sizes' => 'boolean',
            'available' => 'boolean',
            'archived' => 'boolean',
            'is_featured' => 'boolean',
            'promo_active' => 'boolean',
            'promo_discount_percent' => 'float',
            'price' => 'float',
        ];
    }

    public function sizes(): HasMany
    {
        return $this->hasMany(MenuItemSize::class);
    }

    public function ingredients(): HasMany
    {
        return $this->hasMany(MenuItemIngredient::class);
    }

    public function baseIngredients(): HasMany
    {
        return $this->hasMany(MenuItemIngredient::class)->whereNull('menu_item_size_id');
    }

    public function applyPromoPrice(float $basePrice): float
    {
        if (! $this->promo_active || ! $this->promo_discount_percent || $this->promo_discount_percent <= 0) {
            return round($basePrice, 2);
        }

        $discount = min(90.0, max(0.0, (float) $this->promo_discount_percent));

        return round(max(0.0, $basePrice * (1.0 - ($discount / 100.0))), 2);
    }
}
