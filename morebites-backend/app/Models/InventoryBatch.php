<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InventoryBatch extends Model
{
    protected $fillable = [
        'inventory_item_id',
        'batch_no',
        'stock',
        'initial_stock',
        'date_placed',
        'expiry_date',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'stock' => 'float',
            'initial_stock' => 'float',
            'date_placed' => 'date',
            'expiry_date' => 'date',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class, 'inventory_item_id');
    }

    public function dispositions(): HasMany
    {
        return $this->hasMany(InventoryDisposition::class);
    }

    public function activeDisposition(): ?InventoryDisposition
    {
        return $this->dispositions()
            ->whereNull('resolved_at')
            ->latest('id')
            ->first();
    }

    public function daysLeft(): ?int
    {
        if (! $this->expiry_date || ! $this->date_placed) {
            return null;
        }

        return (int) floor(
            ($this->expiry_date->copy()->startOfDay()->getTimestamp()
                - $this->date_placed->copy()->startOfDay()->getTimestamp()) / 86400
        );
    }

    public function daysUntilExpiry(): ?int
    {
        if (! $this->expiry_date) {
            return null;
        }

        return (int) floor(
            ($this->expiry_date->copy()->startOfDay()->getTimestamp()
                - now()->startOfDay()->getTimestamp()) / 86400
        );
    }

    public function isExpired(): bool
    {
        if ($this->status === 'Expired') {
            return true;
        }

        if ($this->expiry_date) {
            return $this->expiry_date->copy()->startOfDay()->lessThan(now()->startOfDay());
        }

        return false;
    }

    public static function deriveBatchStatus(float $stock, $expiryDate = null): string
    {
        if ($stock <= 0) {
            return 'Out of Stock';
        }

        if ($expiryDate) {
            $expiry = $expiryDate instanceof Carbon
                ? $expiryDate->copy()->startOfDay()
                : Carbon::parse($expiryDate)->startOfDay();
            $days = (int) floor(
                ($expiry->getTimestamp() - now()->startOfDay()->getTimestamp()) / 86400
            );

            if ($days < 0) {
                return 'Expired';
            }
            if ($days === 0) {
                return 'Expires Today';
            }
            if ($days <= 7) {
                return 'Expiring Soon';
            }
        }

        return 'Sufficient';
    }

    public function syncComputedStatus(): void
    {
        $next = self::deriveBatchStatus((float) $this->stock, $this->expiry_date);
        if ($this->status !== $next) {
            $this->update(['status' => $next]);
        }
    }
}

