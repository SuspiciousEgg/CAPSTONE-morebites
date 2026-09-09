<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class InventoryItem extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name',
        'batch_no',
        'category',
        'subcategory',
        'subcategory_detail',
        'stock',
        'unit',
        'reorder_level',
        'status',
        'date_placed',
        'expiry_date',
    ];

    protected function casts(): array
    {
        return [
            'stock' => 'float',
            'reorder_level' => 'float',
            'date_placed' => 'date',
            'expiry_date' => 'date',
        ];
    }

    public function logs(): HasMany
    {
        return $this->hasMany(InventoryLog::class);
    }

    public function menuIngredients(): HasMany
    {
        return $this->hasMany(MenuItemIngredient::class);
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

    public static function makeBatchNo(string $name, ?Carbon $date = null): string
    {
        $date ??= now();
        $letters = preg_replace('/[^A-Za-z]/', '', $name) ?: 'XX';
        $prefix = strtoupper(substr($letters, 0, 2));

        return $prefix.'-'.$date->format('md');
    }

    /**
     * Priority: Out of Stock > Expired > Expires Today > Expiring Soon > Low Stock > Sufficient
     */
    public static function deriveStatus(float $stock, float $reorder, $expiryDate = null): string
    {
        if ($stock <= 0) {
            return 'Out of Stock';
        }

        if ($expiryDate) {
            $expiry = $expiryDate instanceof Carbon
                ? $expiryDate->copy()->startOfDay()
                : Carbon::parse($expiryDate)->startOfDay();
            $daysUntilExpiry = (int) floor(
                ($expiry->getTimestamp() - now()->startOfDay()->getTimestamp()) / 86400
            );

            if ($daysUntilExpiry < 0) {
                return 'Expired';
            }
            if ($daysUntilExpiry === 0) {
                return 'Expires Today';
            }
            if ($daysUntilExpiry <= 7) {
                return 'Expiring Soon';
            }
        }

        if ($stock <= $reorder) {
            return 'Low Stock';
        }

        return 'Sufficient';
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

    /** Days until expiry from today — used for status alerts. */
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
}
