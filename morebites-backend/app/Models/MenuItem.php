<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MenuItem extends Model
{
    protected $fillable = [
        'name', 'description', 'category', 'image',
        'has_sizes', 'price', 'available', 'archived',
        'promo_active', 'promo_discount_percent', 'promo_label',
    ];

    protected function casts(): array
    {
        return [
            'has_sizes' => 'boolean',
            'available' => 'boolean',
            'archived' => 'boolean',
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
}
