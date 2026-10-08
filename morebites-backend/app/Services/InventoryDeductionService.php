<?php

namespace App\Services;

use App\Models\InventoryItem;
use App\Models\InventoryLog;
use App\Models\MenuItem;
use App\Models\MenuItemIngredient;
use App\Models\Order;
use App\Support\UnitConverter;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class InventoryDeductionService
{
    public function convertQuantity(float $qty, ?string $fromUnit, ?string $toUnit): float
    {
        return UnitConverter::convert($qty, $fromUnit, $toUnit);
    }

    public function areUnitsCompatible(?string $fromUnit, ?string $toUnit): bool
    {
        return UnitConverter::isCompatible($fromUnit, $toUnit);
    }

    public function formatQuantity(float $qty, ?string $unit = null): string
    {
        $formatted = rtrim(rtrim(number_format($qty, 4, '.', ''), '0'), '.');
        if ($formatted === '' || $formatted === '-0') {
            $formatted = '0';
        }

        return $unit ? "{$formatted} {$unit}" : $formatted;
    }

    public function aggregateDemandsForLines(iterable $lines): array
    {
        $demands = [];

        foreach ($lines as $line) {
            $menuId = is_array($line) ? ($line['menu_item_id'] ?? null) : $line->menu_item_id;
            if (! $menuId) {
                continue;
            }

            $lineQty = (int) (is_array($line) ? ($line['qty'] ?? 1) : $line->qty);
            $lineSize = is_array($line) ? ($line['size'] ?? null) : $line->size;

            $menu = MenuItem::query()->with(['sizes', 'ingredients.inventoryItem'])->find($menuId);
            if (! $menu) {
                continue;
            }

            $lineIngredients = collect();

            if (! empty($lineSize) && $menu->has_sizes) {
                $targetSize = trim($lineSize);
                $sizeObj = $menu->sizes->first(
                    fn ($s) => strcasecmp(trim($s->name), $targetSize) === 0 || (string) $s->id === $targetSize
                ) ?? $menu->sizes->first(
                    fn ($s) => str_contains(strtolower($targetSize), strtolower(trim($s->name)))
                        || str_contains(strtolower(trim($s->name)), strtolower($targetSize))
                );

                if ($sizeObj) {
                    $lineIngredients = $menu->ingredients->where('menu_item_size_id', $sizeObj->id);
                }

                // If no size-specific ingredients found for this size, fall back to base item-level ingredients
                if ($lineIngredients->isEmpty()) {
                    $lineIngredients = $menu->ingredients->whereNull('menu_item_size_id');
                }
            } else {
                $lineIngredients = $menu->ingredients->whereNull('menu_item_size_id');
                if ($lineIngredients->isEmpty()) {
                    $lineIngredients = $menu->ingredients;
                }
            }

            foreach ($lineIngredients as $ingredient) {
                $invId = $ingredient->inventory_item_id;
                $inventory = $ingredient->inventoryItem ?? InventoryItem::query()->find($invId);
                if (! $inventory) {
                    continue;
                }

                $recipeUnit = $ingredient->unit ?: $inventory->unit;
                $stockUnit = $inventory->unit;
                $qtyPerServingInStockUnit = UnitConverter::convert(
                    (float) $ingredient->qty_per_serving,
                    $recipeUnit,
                    $stockUnit
                );
                $qty = $qtyPerServingInStockUnit * $lineQty;

                if (! isset($demands[$invId])) {
                    $demands[$invId] = [
                        'inventory_item_id' => $invId,
                        'inventory' => $inventory,
                        'qty' => 0.0,
                    ];
                }
                $demands[$invId]['qty'] += $qty;
            }
        }

        return $demands;
    }

    public function validateCartAvailability(iterable $lines): void
    {
        // 1. Menu item availability check
        foreach ($lines as $line) {
            $menuId = is_array($line) ? ($line['menu_item_id'] ?? null) : $line->menu_item_id;
            if ($menuId) {
                $menu = MenuItem::query()->find($menuId);
                if ($menu) {
                    if (! $menu->available) {
                        throw ValidationException::withMessages([
                            'items' => ["The item '{$menu->name}' is currently unavailable."],
                        ]);
                    }
                    $lineQty = (int) (is_array($line) ? ($line['qty'] ?? 1) : $line->qty);
                    $lineSize = is_array($line) ? ($line['size'] ?? null) : $line->size;
                    $reason = $this->unserviceableReason($menu, $lineQty, $lineSize);
                    if ($reason === 'expired') {
                        throw ValidationException::withMessages([
                            'items' => ["The item '{$menu->name}' cannot be ordered because one or more ingredients are expired."],
                        ]);
                    }
                }
            }
        }

        // 2. Whole-cart ingredient aggregation & validation against available stock across all open batches
        $demands = $this->aggregateDemandsForLines($lines);
        $shortfalls = [];

        foreach ($demands as $invId => $demand) {
            /** @var InventoryItem $inventory */
            $inventory = $demand['inventory'];
            $needed = (float) $demand['qty'];

            if ($inventory->trashed() || $inventory->status === 'Archived') {
                throw ValidationException::withMessages([
                    'items' => ["The item containing ingredient '{$inventory->name}' is currently unavailable."],
                ]);
            }

            // Sum available unexpired stock across open batches
            if ($inventory->batches()->exists()) {
                $available = (float) $inventory->batches()
                    ->where('stock', '>', 0)
                    ->where(function ($q) {
                        $q->whereNull('expiry_date')
                            ->orWhere('expiry_date', '>=', now()->toDateString());
                    })
                    ->sum('stock');
            } else {
                $available = $inventory->isExpired() ? 0.0 : (float) $inventory->stock;
            }

            if ($available < $needed) {
                $shortfall = $needed - $available;
                $stockUnit = $inventory->unit;
                $neededStr = $this->formatQuantity($needed, $stockUnit);
                $availStr = $this->formatQuantity($available, $stockUnit);
                $shortStr = $this->formatQuantity($shortfall, $stockUnit);

                $shortfalls[] = "Insufficient stock for {$inventory->name}: needed {$neededStr}, but only {$availStr} available (short by {$shortStr}).";
            }
        }

        if (! empty($shortfalls)) {
            throw ValidationException::withMessages([
                'items' => [implode(' ', $shortfalls)],
            ]);
        }
    }

    public function canServe(MenuItem $item, int $qty = 1, ?string $size = null): bool
    {
        return $this->unserviceableReason($item, $qty, $size) === null;
    }

    public function outOfStockReason(MenuItem $item, int $qty = 1, ?string $size = null): string
    {
        return (string) ($this->unserviceableReason($item, $qty, $size) ?? '');
    }

    public function unserviceableReason(MenuItem $item, int $qty = 1, ?string $size = null): ?string
    {
        $item->loadMissing([
            'sizes',
            'ingredients' => fn ($q) => $q->with(['inventoryItem' => fn ($q) => $q->withTrashed()]),
        ]);

        // No recipe linked — availability is manual (admin toggle).
        if ($item->ingredients->isEmpty()) {
            return null;
        }

        // If a specific size is passed and item has sizes:
        if ($size !== null && $size !== '' && $item->has_sizes) {
            $targetSize = trim($size);
            $sizeObj = $item->sizes->first(
                fn ($s) => strcasecmp(trim($s->name), $targetSize) === 0 || (string) $s->id === $targetSize
            ) ?? $item->sizes->first(
                fn ($s) => str_contains(strtolower($targetSize), strtolower(trim($s->name)))
                    || str_contains(strtolower(trim($s->name)), strtolower($targetSize))
            );

            $ingredients = $sizeObj
                ? $item->ingredients->where('menu_item_size_id', $sizeObj->id)
                : collect();

            if ($ingredients->isEmpty()) {
                $ingredients = $item->ingredients->whereNull('menu_item_size_id');
            }

            if ($ingredients->isEmpty()) {
                return null;
            }

            return $this->evaluateIngredientsReason($ingredients, $qty);
        }

        return $this->evaluateIngredientsReason($item->ingredients, $qty);
    }

    private function evaluateIngredientsReason(iterable $ingredients, int $qty = 1): ?string
    {
        foreach ($ingredients as $ingredient) {
            $inventory = $ingredient->inventoryItem;
            // Soft-deleted, archived, or missing inventory counts as unavailable.
            if (! $inventory || $inventory->trashed() || $inventory->status === 'Archived') {
                return 'missing';
            }

            $recipeUnit = $ingredient->unit ?: $inventory->unit;
            $stockUnit = $inventory->unit;
            $qtyInStockUnit = UnitConverter::convert((float) $ingredient->qty_per_serving, $recipeUnit, $stockUnit);
            $needed = $qtyInStockUnit * $qty;

            // If batches exist: check usable (unexpired) stock
            if ($inventory->batches()->exists()) {
                $usableBatches = $inventory->batches()
                    ->where('stock', '>', 0)
                    ->where(function ($q) {
                        $q->whereNull('expiry_date')
                            ->orWhere('expiry_date', '>=', now()->toDateString());
                    })
                    ->get();
                $usableStock = (float) $usableBatches->sum('stock');
                $totalStock = (float) $inventory->batches()->where('stock', '>', 0)->sum('stock');

                if ($usableStock < $needed) {
                    if ($totalStock >= $needed) {
                        return 'expired';
                    }

                    return ($totalStock <= 0 && $inventory->batches()->where('expiry_date', '<', now()->toDateString())->exists())
                        ? 'expired'
                        : 'insufficient';
                }
            } else {
                // Expired inventory item disables the menu item.
                if ($inventory->isExpired()) {
                    return 'expired';
                }

                $stock = (float) $inventory->stock;
                if ($stock < $needed) {
                    return 'insufficient';
                }
            }
        }

        return null;
    }

    public function syncMenuAvailability(?Collection $items = null): void
    {
        $items ??= MenuItem::query()
            ->with(['ingredients' => fn ($q) => $q->with(['inventoryItem' => fn ($q) => $q->withTrashed()])])
            ->where('archived', false)
            ->get();

        foreach ($items as $item) {
            if ($item->ingredients->isEmpty()) {
                continue;
            }

            if (! $this->canServe($item)) {
                $item->update(['available' => false]);
            }
        }
    }

    public function syncMenusUsingInventory(int $inventoryItemId): void
    {
        $menuIds = MenuItemIngredient::query()
            ->where('inventory_item_id', $inventoryItemId)
            ->pluck('menu_item_id');

        if ($menuIds->isEmpty()) {
            $this->syncMenuAvailability();

            return;
        }

        $items = MenuItem::query()
            ->with(['ingredients' => fn ($q) => $q->with(['inventoryItem' => fn ($q) => $q->withTrashed()])])
            ->whereIn('id', $menuIds)
            ->where('archived', false)
            ->get();

        foreach ($items as $item) {
            $item->update(['available' => $this->canServe($item)]);
        }
    }

    public function disableMenuItems(iterable $menuItemIds): void
    {
        $ids = collect($menuItemIds)->filter()->unique()->values();
        if ($ids->isEmpty()) {
            return;
        }

        MenuItem::query()
            ->whereIn('id', $ids)
            ->update(['available' => false]);
    }

    public function deductForOrder(Order $order): void
    {
        $order->loadMissing('items');

        DB::transaction(function () use ($order) {
            /** @var Order|null $lockedOrder */
            $lockedOrder = Order::query()->lockForUpdate()->find($order->id) ?? $order;
            if ($lockedOrder->inventory_deducted) {
                return;
            }

            $usage = $this->usageForOrder($order);
            $orderCodeLabel = $order->order_code ? (str_starts_with($order->order_code, '#') ? $order->order_code : '#'.$order->order_code) : '#'.$order->id;

            // Sort by inventory_item_id to prevent database deadlocks on concurrent orders
            $sortedUsage = collect($usage)->sortBy('inventory_item_id')->values()->all();

            $shortfalls = [];
            $lockedItems = [];
            $lockedBatches = [];

            // 1. Post-lock validation pass across all required ingredients
            foreach ($sortedUsage as $row) {
                $invId = $row['inventory_item_id'];
                /** @var InventoryItem|null $inventory */
                $inventory = InventoryItem::query()->lockForUpdate()->find($invId);
                if (! $inventory) {
                    continue;
                }
                $lockedItems[$invId] = $inventory;

                // If no batches exist but item has stock, seed an initial batch for backward compatibility
                if (! $inventory->batches()->exists() && (float) $inventory->stock > 0) {
                    $inventory->batches()->create([
                        'batch_no' => $inventory->batch_no ?: InventoryItem::makeBatchNo($inventory->name, $inventory->date_placed),
                        'stock' => (float) $inventory->stock,
                        'initial_stock' => (float) $inventory->stock,
                        'date_placed' => $inventory->date_placed ?? now(),
                        'expiry_date' => $inventory->expiry_date,
                        'status' => \App\Models\InventoryBatch::deriveBatchStatus((float) $inventory->stock, $inventory->expiry_date),
                    ]);
                }

                $batches = $inventory->batches()
                    ->where('stock', '>', 0)
                    ->orderByRaw('CASE WHEN expiry_date IS NOT NULL THEN 0 ELSE 1 END ASC')
                    ->orderBy('expiry_date', 'asc')
                    ->orderBy('date_placed', 'asc')
                    ->orderBy('id', 'asc')
                    ->lockForUpdate()
                    ->get();
                $lockedBatches[$invId] = $batches;

                if ($batches->isNotEmpty()) {
                    $available = (float) $batches->filter(fn ($b) => ! $b->isExpired())->sum('stock');
                } else {
                    $available = $inventory->isExpired() ? 0.0 : (float) $inventory->stock;
                }

                $needed = (float) $row['qty'];
                if ($available < $needed) {
                    $shortfall = $needed - $available;
                    $stockUnit = $inventory->unit;
                    $neededStr = $this->formatQuantity($needed, $stockUnit);
                    $availStr = $this->formatQuantity($available, $stockUnit);
                    $shortStr = $this->formatQuantity($shortfall, $stockUnit);

                    $shortfalls[] = "Insufficient stock for {$inventory->name}: needed {$neededStr}, but only {$availStr} available (short by {$shortStr}).";
                }
            }

            if (! empty($shortfalls)) {
                throw ValidationException::withMessages([
                    'items' => [implode(' ', $shortfalls)],
                ]);
            }

            // 2. Deduction pass
            foreach ($sortedUsage as $row) {
                $invId = $row['inventory_item_id'];
                /** @var InventoryItem|null $inventory */
                $inventory = $lockedItems[$invId] ?? null;
                if (! $inventory) {
                    continue;
                }

                $needed = (float) $row['qty'];
                $batches = $lockedBatches[$invId] ?? collect();

                if ($batches->isNotEmpty()) {
                    foreach ($batches as $batch) {
                        if ($needed <= 0) {
                            break;
                        }
                        if ($batch->isExpired()) {
                            continue;
                        }

                        $batchStock = (float) $batch->stock;
                        $deductQty = min($batchStock, $needed);
                        $newBatchStock = max(0.0, $batchStock - $deductQty);

                        $batch->update([
                            'stock' => $newBatchStock,
                            'status' => \App\Models\InventoryBatch::deriveBatchStatus($newBatchStock, $batch->expiry_date),
                        ]);

                        \App\Models\OrderInventoryDeduction::query()->create([
                            'order_id' => $order->id,
                            'inventory_item_id' => $inventory->id,
                            'inventory_batch_id' => $batch->id,
                            'quantity' => $deductQty,
                        ]);

                        InventoryLog::query()->create([
                            'inventory_item_id' => $inventory->id,
                            'inventory_batch_id' => $batch->id,
                            'item_name' => $inventory->name,
                            'category' => $inventory->category,
                            'stock_level' => $newBatchStock.' '.$inventory->unit,
                            'quantity' => -$deductQty,
                            'previous_stock' => $batchStock,
                            'unit' => $inventory->unit,
                            'reason' => 'Order '.$orderCodeLabel.' (Batch '.$batch->batch_no.')',
                            'action_label' => 'Customer Order',
                            'notes' => 'Stock deducted for fulfilled customer order from batch '.$batch->batch_no.'.',
                            'batch_no' => $batch->batch_no,
                            'date_placed' => $batch->date_placed ?? $inventory->date_placed,
                            'expiry_date' => $batch->expiry_date,
                            'log_type' => 'Removed',
                            'status' => $batch->status,
                        ]);

                        $needed -= $deductQty;
                    }

                    $inventory->recalculateStockFromBatches();
                } else {
                    // Fallback if item has no batch rows
                    $prevStock = (float) $inventory->stock;
                    $newStock = max(0, $prevStock - $needed);
                    $inventory->update([
                        'stock' => $newStock,
                        'status' => InventoryItem::deriveStatus(
                            $newStock,
                            (float) $inventory->reorder_level,
                            $inventory->expiry_date
                        ),
                    ]);

                    InventoryLog::query()->create([
                        'inventory_item_id' => $inventory->id,
                        'item_name' => $inventory->name,
                        'category' => $inventory->category,
                        'stock_level' => $inventory->stock.' '.$inventory->unit,
                        'quantity' => -($prevStock - $newStock),
                        'previous_stock' => $prevStock,
                        'unit' => $inventory->unit,
                        'reason' => 'Order '.$orderCodeLabel,
                        'action_label' => 'Customer Order',
                        'notes' => 'Stock deducted for fulfilled customer order.',
                        'batch_no' => InventoryLog::makeBatchNo($inventory->id, $inventory->batch_no),
                        'date_placed' => $inventory->date_placed,
                        'expiry_date' => $inventory->expiry_date,
                        'log_type' => 'Removed',
                        'status' => $inventory->status,
                    ]);
                }

                // Low-stock alert check based on total stock across batches
                if ((float) $inventory->stock <= (float) $inventory->reorder_level && (float) $inventory->stock > 0) {
                    $hasRecent = \App\Models\Notification::query()
                        ->where('type', 'low_stock')
                        ->where('data->inventory_item_id', $inventory->id)
                        ->where('created_at', '>=', now()->subHours(12))
                        ->exists();

                    if (! $hasRecent) {
                        \App\Models\Notification::createLowStockNotification($inventory);
                    }
                }
            }

            $lockedOrder->update(['inventory_deducted' => true]);
            $order->inventory_deducted = true;

            $this->syncMenuAvailability();
        });
    }

    public function restockForOrder(Order $order): void
    {
        $order->loadMissing('items');

        DB::transaction(function () use ($order) {
            /** @var Order|null $lockedOrder */
            $lockedOrder = Order::query()->lockForUpdate()->find($order->id) ?? $order;
            if (! $lockedOrder->inventory_deducted) {
                return;
            }

            // Immediately mark as not deducted within the same transaction to guarantee idempotency
            $lockedOrder->update(['inventory_deducted' => false]);
            $order->inventory_deducted = false;

            $deductions = \App\Models\OrderInventoryDeduction::query()
                ->where('order_id', $order->id)
                ->get();
            $orderCodeLabel = $order->order_code ? (str_starts_with($order->order_code, '#') ? $order->order_code : '#'.$order->order_code) : '#'.$order->id;

            if ($deductions->isNotEmpty()) {
                $itemIdsToRecalculate = [];

                foreach ($deductions as $deduction) {
                    $batch = \App\Models\InventoryBatch::query()->lockForUpdate()->find($deduction->inventory_batch_id);
                    $inventory = InventoryItem::query()->lockForUpdate()->find($deduction->inventory_item_id);
                    if (! $batch && ! $inventory) {
                        continue;
                    }

                    $qty = (float) $deduction->quantity;

                    if ($batch) {
                        $prevStock = (float) $batch->stock;
                        $newStock = $prevStock + $qty;
                        $batch->update([
                            'stock' => $newStock,
                            'status' => \App\Models\InventoryBatch::deriveBatchStatus($newStock, $batch->expiry_date),
                        ]);

                        InventoryLog::query()->create([
                            'inventory_item_id' => $inventory ? $inventory->id : $batch->inventory_item_id,
                            'inventory_batch_id' => $batch->id,
                            'item_name' => $inventory?->name ?? 'Inventory Item',
                            'category' => $inventory?->category ?? 'General',
                            'stock_level' => $newStock.' '.($inventory?->unit ?? ''),
                            'quantity' => $qty,
                            'previous_stock' => $prevStock,
                            'unit' => $inventory?->unit ?? '',
                            'reason' => 'Order '.$orderCodeLabel.' reversal (Batch '.$batch->batch_no.')',
                            'action_label' => 'Order Restock',
                            'notes' => 'Stock restored after order cancellation / reversal to batch '.$batch->batch_no.'.',
                            'batch_no' => $batch->batch_no,
                            'date_placed' => $batch->date_placed,
                            'expiry_date' => $batch->expiry_date,
                            'log_type' => 'Added',
                            'status' => $batch->status,
                        ]);

                        $itemIdsToRecalculate[$batch->inventory_item_id] = true;
                    } elseif ($inventory) {
                        $prevStock = (float) $inventory->stock;
                        $newStock = $prevStock + $qty;
                        $inventory->update([
                            'stock' => $newStock,
                            'status' => InventoryItem::deriveStatus(
                                $newStock,
                                (float) $inventory->reorder_level,
                                $inventory->expiry_date
                            ),
                        ]);

                        InventoryLog::query()->create([
                            'inventory_item_id' => $inventory->id,
                            'item_name' => $inventory->name,
                            'category' => $inventory->category,
                            'stock_level' => $inventory->stock.' '.$inventory->unit,
                            'quantity' => $qty,
                            'previous_stock' => $prevStock,
                            'unit' => $inventory->unit,
                            'reason' => 'Order '.$orderCodeLabel.' reversal',
                            'action_label' => 'Order Restock',
                            'notes' => 'Stock restored after order cancellation / refund.',
                            'batch_no' => InventoryLog::makeBatchNo($inventory->id, $inventory->batch_no),
                            'date_placed' => $inventory->date_placed,
                            'expiry_date' => $inventory->expiry_date,
                            'log_type' => 'Added',
                            'status' => $inventory->status,
                        ]);
                    }
                }

                foreach (array_keys($itemIdsToRecalculate) as $itemId) {
                    $item = InventoryItem::find($itemId);
                    $item?->recalculateStockFromBatches();
                }

                \App\Models\OrderInventoryDeduction::query()->where('order_id', $order->id)->delete();
            }

            $this->syncMenuAvailability();
        });
    }

    public function usageForOrder(Order $order): array
    {
        $order->loadMissing('items');

        return array_values($this->aggregateDemandsForLines($order->items));
    }
}
