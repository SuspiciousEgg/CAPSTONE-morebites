<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MenuItemIngredient extends Model
{
    protected $fillable = [
        'menu_item_id',
        'menu_item_size_id',
        'inventory_item_id',
        'qty_per_serving',
        'unit',
        'price',
        'is_removable',
    ];

    protected function casts(): array
    {
        return [
            'qty_per_serving' => 'float',
            'price' => 'float',
            'is_removable' => 'boolean',
        ];
    }

    public function menuItem(): BelongsTo
    {
        return $this->belongsTo(MenuItem::class);
    }

    public function menuItemSize(): BelongsTo
    {
        return $this->belongsTo(MenuItemSize::class, 'menu_item_size_id');
    }

    public function inventoryItem(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class);
    }

    /**
     * Computes the proportional ingredient price for this recipe row:
     * inventory unit price × qty_per_serving (converted to the inventory item's stock unit).
     */
    public function computedPrice(): float
    {
        $inv = $this->relationLoaded('inventoryItem')
            ? $this->inventoryItem
            : $this->inventoryItem()->withTrashed()->first();

        $qty = (float) ($this->qty_per_serving > 0 ? $this->qty_per_serving : 1.0);
        $invUnitPrice = (float) ($inv?->price ?? 0.0);

        if ($inv && $invUnitPrice > 0) {
            $recipeUnit = $this->unit ?: $inv->unit;
            $stockUnit = $inv->unit;
            $qtyInStockUnit = \App\Support\UnitConverter::isCompatibleWithInventory(
                $recipeUnit,
                $stockUnit,
                $inv->portion_unit,
                $inv->portions_per_unit !== null ? (float) $inv->portions_per_unit : null
            )
                ? \App\Support\UnitConverter::toStockUnit(
                    $qty,
                    $recipeUnit,
                    $stockUnit,
                    $inv->portion_unit,
                    $inv->portions_per_unit !== null ? (float) $inv->portions_per_unit : null
                )
                : $qty;

            return round($invUnitPrice * $qtyInStockUnit, 2);
        }

        return round((float) ($this->price ?? 0.0), 2);
    }
}
