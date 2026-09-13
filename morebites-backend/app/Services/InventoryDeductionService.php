<?php

namespace App\Services;

use App\Models\InventoryItem;
use App\Models\InventoryLog;
use App\Models\MenuItem;
use App\Models\MenuItemIngredient;
use App\Models\Order;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class InventoryDeductionService
{
    public function canServe(MenuItem $item, int $qty = 1): bool
    {
        return $this->unserviceableReason($item, $qty) === null;
    }

    public function unserviceableReason(MenuItem $item, int $qty = 1): ?string
    {
        $item->loadMissing(['ingredients' => fn ($q) => $q->with(['inventoryItem' => fn ($q) => $q->withTrashed()])]);

        // No recipe linked — availability is manual (admin toggle).
        if ($item->ingredients->isEmpty()) {
            return null;
        }

        foreach ($item->ingredients as $ingredient) {
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
            $needed = (float) $ingredient->qty_per_serving * $qty;
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

    private function usageForOrder(Order $order): array
    {
        $usage = [];

        foreach ($order->items as $line) {
            if (! $line->menu_item_id) {
                continue;
            }

            $menu = MenuItem::query()->with('ingredients')->find($line->menu_item_id);
            if (! $menu) {
                continue;
            }

            foreach ($menu->ingredients as $ingredient) {
                $id = $ingredient->inventory_item_id;
                $qty = (float) $ingredient->qty_per_serving * (int) $line->qty;
                $usage[$id] = [
                    'inventory_item_id' => $id,
                    'qty' => ($usage[$id]['qty'] ?? 0) + $qty,
                ];
            }
        }

        return array_values($usage);
    }
}
