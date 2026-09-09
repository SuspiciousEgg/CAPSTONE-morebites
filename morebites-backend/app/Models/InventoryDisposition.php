<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryDisposition extends Model
{
    public const PENDING = 'pending';

    public const PROMO = 'promo';

    public const KITCHEN_PRIORITY = 'kitchen_priority';

    public const WASTE = 'waste';

    public const RESOLVED = 'resolved';

    protected $fillable = [
        'inventory_item_id',
        'disposition',
        'promo_menu_item_id',
        'promo_discount_percent',
        'notes',
        'resolved_at',
        'user_id',
    ];

    protected function casts(): array
    {
        return [
            'promo_discount_percent' => 'float',
            'resolved_at' => 'datetime',
        ];
    }

    public function inventoryItem(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class);
    }

    public function promoMenuItem(): BelongsTo
    {
        return $this->belongsTo(MenuItem::class, 'promo_menu_item_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isActive(): bool
    {
        return $this->resolved_at === null;
    }
}
