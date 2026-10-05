<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MenuItemSize extends Model
{
    protected $fillable = ['menu_item_id', 'name', 'price'];

    protected function casts(): array
    {
        return ['price' => 'float'];
    }

    public function menuItem(): BelongsTo
    {
        return $this->belongsTo(MenuItem::class);
    }

    public function ingredients(): HasMany
    {
        return $this->hasMany(MenuItemIngredient::class, 'menu_item_size_id');
    }
}
