<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryLog extends Model
{
    protected $fillable = [
        'inventory_item_id',
        'item_name',
        'category',
        'stock_level',
        'quantity',
        'previous_stock',
        'unit',
        'reason',
        'action_label',
        'notes',
        'batch_no',
        'date_placed',
        'expiry_date',
        'log_type',
        'status',
        'user_id',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'float',
            'previous_stock' => 'float',
            'date_placed' => 'date',
            'expiry_date' => 'date',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class, 'inventory_item_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public static function makeBatchNo(?int $itemId = null, ?string $itemBatch = null): string
    {
        if ($itemBatch) {
            return $itemBatch;
        }

        $prefix = $itemId ? str_pad((string) $itemId, 2, '0', STR_PAD_LEFT) : 'XX';

        return 'SN-'.now()->format('md').'-'.$prefix;
    }

    /**
     * @return array{action: string, key: string, label: string}
     */
    public function actionMeta(): array
    {
        return match ($this->log_type) {
            'Added' => [
                'action' => 'New Stock',
                'key' => 'new',
                'label' => $this->action_label ?: 'Initial Stock',
            ],
            'Restocked' => [
                'action' => 'Restocked',
                'key' => 'restock',
                'label' => $this->action_label ?: 'Supplier Delivery',
            ],
            'Updated' => [
                'action' => 'Manual Adjustment',
                'key' => 'adjust',
                'label' => $this->action_label ?: 'Inventory Count',
            ],
            'Expired' => [
                'action' => 'Expired',
                'key' => 'expired',
                'label' => $this->action_label ?: 'Auto Expired',
            ],
            default => [
                'action' => 'Stock Deducted',
                'key' => 'deduct',
                'label' => $this->action_label ?: 'Customer Order',
            ],
        };
    }

    public function transformForApi(): array
    {
        $meta = $this->actionMeta();
        $unit = $this->unit ?: (preg_match('/\s+(\S+)$/', (string) $this->stock_level, $m) ? $m[1] : 'pcs');
        $newStock = $this->parseStockLevel();
        $qty = $this->quantity;
        $prev = $this->previous_stock;

        if ($qty === null && $prev !== null && $newStock !== null) {
            $qty = $newStock - $prev;
        }

        $qtyLabel = null;
        if ($qty !== null) {
            $sign = $qty > 0 ? '+' : '';
            $qtyLabel = $sign.rtrim(rtrim(number_format($qty, 2, '.', ''), '0'), '.').' '.$unit;
        }

        $user = $this->user;
        $performedBy = 'System';
        if ($user) {
            $role = match ($user->role) {
                'super_admin' => 'Admin',
                'admin' => 'Admin',
                'cashier' => 'Cashier',
                'driver' => 'Driver',
                default => ucfirst((string) $user->role),
            };
            $performedBy = trim(($user->name ?: trim(($user->first_name.' '.$user->last_name)))).' ('.$role.')';
        }

        $expiry = $this->expiry_date;
        $expiryLabel = $expiry?->format('M d, Y');
        $expiryTone = null;
        if ($expiry) {
            $days = (int) floor(($expiry->copy()->startOfDay()->getTimestamp() - now()->startOfDay()->getTimestamp()) / 86400);
            $expiryTone = $days < 0 ? 'expired' : ($days <= 7 ? 'warn' : 'ok');
        }

        return [
            'id' => $this->id,
            'datetime' => $this->created_at?->format('M d, Y h:i A'),
            'item' => $this->item_name,
            'batch_no' => $this->batch_no,
            'category' => $this->category,
            'unit' => $unit,
            'level' => $this->stock_level,
            'type' => $this->log_type,
            'action' => $meta['action'],
            'action_key' => $meta['key'],
            'action_label' => $meta['label'],
            'quantity' => $qty,
            'quantity_label' => $qtyLabel,
            'previous_stock' => $prev,
            'new_stock' => $newStock,
            'reason' => $this->reason,
            'notes' => $this->notes,
            'performed_by' => $performedBy,
            'status' => $this->status,
            'date_placed' => $this->date_placed?->format('M d, Y') ?: $this->created_at?->format('M d, Y'),
            'expiry_date' => $expiryLabel,
            'expiry_tone' => $expiryTone,
        ];
    }

    private function parseStockLevel(): ?float
    {
        if (preg_match('/^([-+]?\d+(?:\.\d+)?)/', (string) $this->stock_level, $m)) {
            return (float) $m[1];
        }

        return null;
    }
}
