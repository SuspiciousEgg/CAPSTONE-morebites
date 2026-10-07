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

            // Expired inventory item disables the menu item.
            if ($inventory->isExpired()) {
                return 'expired';
            }

            $stock = (float) $inventory->stock;
            $recipeUnit = $ingredient->unit ?: $inventory->unit;
            $stockUnit = $inventory->unit;
            $qtyInStockUnit = UnitConverter::convert((float) $ingredient->qty_per_serving, $recipeUnit, $stockUnit);
            $needed = $qtyInStockUnit * $qty;
            if ($stock < $needed) {
                return 'insufficient';
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
            $usage = $this->usageForOrder($order);

            foreach ($usage as $row) {
                /** @var InventoryItem $inventory */
                $inventory = InventoryItem::query()->lockForUpdate()->find($row['inventory_item_id']);
                if (! $inventory) {
                    continue;
                }

                $prevStock = (float) $inventory->stock;
                $qty = (float) $row['qty'];
                $newStock = max(0, $prevStock - $qty);
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
                    'reason' => 'Order '.($order->order_code ? (str_starts_with($order->order_code, '#') ? $order->order_code : '#'.$order->order_code) : '#'.$order->id),
                    'action_label' => 'Customer Order',
                    'notes' => 'Stock deducted for fulfilled customer order.',
                    'batch_no' => InventoryLog::makeBatchNo($inventory->id, $inventory->batch_no),
                    'date_placed' => $inventory->date_placed,
                    'expiry_date' => $inventory->expiry_date,
                    'log_type' => 'Removed',
                    'status' => $inventory->status,
                ]);
            }

            $this->syncMenuAvailability();
        });
    }

    public function restockForOrder(Order $order): void
    {
        $order->loadMissing('items');

        DB::transaction(function () use ($order) {
            $usage = $this->usageForOrder($order);

            foreach ($usage as $row) {
                /** @var InventoryItem $inventory */
                $inventory = InventoryItem::query()->lockForUpdate()->find($row['inventory_item_id']);
                if (! $inventory) {
                    continue;
                }

                $prevStock = (float) $inventory->stock;
                $qty = (float) $row['qty'];
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
                    'reason' => 'Order '.($order->order_code ? (str_starts_with($order->order_code, '#') ? $order->order_code : '#'.$order->order_code) : '#'.$order->id).' reversal',
                    'action_label' => 'Order Restock',
                    'notes' => 'Stock restored after order cancellation / refund.',
                    'batch_no' => InventoryLog::makeBatchNo($inventory->id, $inventory->batch_no),
                    'date_placed' => $inventory->date_placed,
                    'expiry_date' => $inventory->expiry_date,
                    'log_type' => 'Added',
                    'status' => $inventory->status,
                ]);
            }

            $this->syncMenuAvailability();
        });
    }

    public function usageForOrder(Order $order): array
    {
        $order->loadMissing('items');
        $usage = [];

        foreach ($order->items as $line) {
            if (! $line->menu_item_id) {
                continue;
            }

            $menu = MenuItem::query()->with(['sizes', 'ingredients.inventoryItem'])->find($line->menu_item_id);
            if (! $menu) {
                continue;
            }

            $lineIngredients = collect();

            if (! empty($line->size) && $menu->has_sizes) {
                $targetSize = trim($line->size);
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
                $id = $ingredient->inventory_item_id;
                $inventory = $ingredient->inventoryItem ?? InventoryItem::query()->find($id);
                $recipeUnit = $ingredient->unit ?: $inventory?->unit;
                $stockUnit = $inventory?->unit;
                $qtyPerServingInStockUnit = UnitConverter::convert(
                    (float) $ingredient->qty_per_serving,
                    $recipeUnit,
                    $stockUnit
                );
                $qty = $qtyPerServingInStockUnit * (int) $line->qty;
                $usage[$id] = [
                    'inventory_item_id' => $id,
                    'qty' => ($usage[$id]['qty'] ?? 0) + $qty,
                ];
            }
        }

        return array_values($usage);
    }
}
