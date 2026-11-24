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
    public static function convertToInventoryUnit(float $qty, ?string $fromUnit, ?string $toUnit): ?float
    {
        if (! UnitConverter::isCompatible($fromUnit, $toUnit)) {
            return null;
        }

        return UnitConverter::convert($qty, $fromUnit, $toUnit);
    }

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

    /**
     * Resolves and snapshots the removed ingredients for an order line at order placement time,
     * locking in the computed proportional deduction price (inventory unit price × qty_per_serving)
     * so historical receipts and reports never change if inventory prices are updated later.
     */
    public function snapshotRemovedIngredientsForLine(array $line): ?array
    {
        $removed = $line['removed_ingredients'] ?? null;
        if (empty($removed) || ! is_array($removed)) {
            return null;
        }

        $menuId = $line['menu_item_id'] ?? null;
        $lineSize = $line['size'] ?? null;
        $lineIngredients = collect();

        $menu = null;
        if ($menuId) {
            $menu = MenuItem::query()->with(['sizes', 'ingredients.inventoryItem'])->find($menuId);
            if ($menu) {
                // Beverages never permit ingredient removal
                if (strcasecmp(trim((string) $menu->category), 'Beverages') === 0) {
                    return null;
                }
                if (! empty($lineSize) && ($menu->has_sizes || $menu->sizes->isNotEmpty())) {
                    $targetSize = trim((string) $lineSize);
                    $sizeObj = $menu->sizes->first(
                        fn ($s) => strcasecmp(trim($s->name), $targetSize) === 0 || (string) $s->id === $targetSize
                    ) ?? $menu->sizes->first(
                        fn ($s) => str_contains(strtolower($targetSize), strtolower(trim($s->name)))
                            || str_contains(strtolower(trim($s->name)), strtolower($targetSize))
                    );

                    if ($sizeObj) {
                        $lineIngredients = $menu->ingredients->where('menu_item_size_id', $sizeObj->id);
                    }
                    if ($lineIngredients->isEmpty()) {
                        $lineIngredients = $menu->ingredients->whereNull('menu_item_size_id');
                    }
                } else {
                    $lineIngredients = $menu->ingredients->whereNull('menu_item_size_id');
                    if ($lineIngredients->isEmpty()) {
                        $lineIngredients = $menu->ingredients;
                    }
                }
            }
        }

        $snapshots = [];
        foreach ($removed as $r) {
            $matchIng = null;
            if (is_numeric($r) || (is_string($r) && is_numeric(trim($r)))) {
                $targetId = (int) $r;
                $matchIng = $lineIngredients->first(
                    fn ($ing) => (int) $ing->inventory_item_id === $targetId || (int) $ing->id === $targetId
                );
                if (! $matchIng) {
                    $inv = InventoryItem::withTrashed()->find($targetId);
                    $snapshots[] = [
                        'inventory_item_id' => $targetId,
                        'name' => $inv?->name ?? 'Ingredient',
                        'unit_price' => (float) ($inv?->price ?? 0.0),
                        'price' => (float) ($inv?->price ?? 0.0),
                    ];
                    continue;
                }
            } elseif (is_string($r)) {
                $targetName = strtolower(trim($r));
                $matchIng = $lineIngredients->first(
                    fn ($ing) => strtolower(trim((string) ($ing->inventoryItem?->name ?? ''))) === $targetName
                );
                if (! $matchIng) {
                    $snapshots[] = [
                        'name' => trim($r),
                        'price' => 0.0,
                    ];
                    continue;
                }
            } elseif (is_array($r)) {
                $invId = ! empty($r['inventory_item_id']) ? (int) $r['inventory_item_id'] : null;
                $ingId = ! empty($r['id']) ? (int) $r['id'] : null;
                $rName = ! empty($r['name']) ? strtolower(trim((string) $r['name'])) : '';

                $matchIng = $lineIngredients->first(function ($ing) use ($invId, $ingId, $rName) {
                    if ($invId && (int) $ing->inventory_item_id === $invId) {
                        return true;
                    }
                    if ($ingId && (int) $ing->id === $ingId) {
                        return true;
                    }
                    if ($rName !== '' && strtolower(trim((string) ($ing->inventoryItem?->name ?? ''))) === $rName) {
                        return true;
                    }
                    return false;
                });

                if (! $matchIng) {
                    $snapshots[] = [
                        'id' => $ingId,
                        'inventory_item_id' => $invId,
                        'name' => $r['name'] ?? 'Ingredient',
                        'price' => isset($r['price']) ? round((float) $r['price'], 2) : 0.0,
                    ];
                    continue;
                }
            }

            if ($matchIng) {
                // Core / main ingredients cannot be removed by customer or POS
                if ($matchIng->is_removable === false) {
                    continue;
                }
                $inv = $matchIng->inventoryItem;
                $computed = $matchIng->computedPrice();
                $snapshots[] = [
                    'id' => $matchIng->id,
                    'inventory_item_id' => (int) $matchIng->inventory_item_id,
                    'name' => $inv?->name ?? (is_array($r) ? ($r['name'] ?? 'Ingredient') : 'Ingredient'),
                    'qty_per_serving' => (float) $matchIng->qty_per_serving,
                    'unit' => $matchIng->unit ?: $inv?->unit,
                    'unit_price' => (float) ($inv?->price ?? 0.0),
                    'price' => $computed > 0 ? $computed : (is_array($r) && isset($r['price']) ? round((float) $r['price'], 2) : 0.0),
                ];
            }
        }

        return empty($snapshots) ? null : $snapshots;
    }

    /**
     * Resolves the authoritative unit price for an order line. When removed_ingredients
     * are present on a menu-backed line item, deducts the snapshotted proportional
     * ingredient prices from the menu/size base price so unit_price and removed_ingredients
     * are always consistent.
     */
    public function resolveEffectiveUnitPriceForLine(array $line, ?array $snapshottedRemoved = null): float
    {
        $fallbackPrice = round((float) ($line['unit_price'] ?? 0.0), 2);
        $removed = $snapshottedRemoved ?? $this->snapshotRemovedIngredientsForLine($line);
        $hadRawRemoved = ! empty($line['removed_ingredients']) && is_array($line['removed_ingredients']);

        if ((empty($removed) && ! $hadRawRemoved) || empty($line['menu_item_id'])) {
            return $fallbackPrice;
        }

        $menu = MenuItem::query()->with('sizes')->find($line['menu_item_id']);
        if (! $menu) {
            return $fallbackPrice;
        }

        $basePrice = (float) $menu->price;
        $lineSize = $line['size'] ?? null;

        if (! empty($lineSize) && ($menu->has_sizes || $menu->sizes->isNotEmpty())) {
            $targetSize = trim((string) $lineSize);
            $sizeObj = $menu->sizes->first(
                fn ($s) => strcasecmp(trim($s->name), $targetSize) === 0 || (string) $s->id === $targetSize
            ) ?? $menu->sizes->first(
                fn ($s) => str_contains(strtolower($targetSize), strtolower(trim($s->name)))
                    || str_contains(strtolower(trim($s->name)), strtolower($targetSize))
            );

            if ($sizeObj && (float) $sizeObj->price > 0) {
                $basePrice = (float) $sizeObj->price;
            }
        }

        if ($basePrice <= 0) {
            return $fallbackPrice;
        }

        $effectiveBase = $menu->applyPromoPrice($basePrice);
        $deduction = collect($removed)->sum(fn ($r) => (float) ($r['price'] ?? 0.0));

        return max(0.0, round($effectiveBase - $deduction, 2));
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

            $removed = is_array($line)
                ? ($line['removed_ingredients'] ?? [])
                : ($line->removed_ingredients ?? []);

            $removedIds = [];
            $removedNames = [];
            foreach ((array) $removed as $r) {
                if (is_numeric($r)) {
                    $removedIds[] = (int) $r;
                } elseif (is_string($r)) {
                    $trimmed = trim($r);
                    if (is_numeric($trimmed)) {
                        $removedIds[] = (int) $trimmed;
                    } else {
                        $removedNames[] = strtolower($trimmed);
                    }
                } elseif (is_array($r)) {
                    if (! empty($r['inventory_item_id'])) {
                        $removedIds[] = (int) $r['inventory_item_id'];
                    }
                    if (! empty($r['id'])) {
                        $removedIds[] = (int) $r['id'];
                    }
                    if (! empty($r['name'])) {
                        $removedNames[] = strtolower(trim((string) $r['name']));
                    }
                }
            }

            $isBeverageMenu = strcasecmp(trim((string) $menu->category), 'Beverages') === 0;

            foreach ($lineIngredients as $ingredient) {
                $invId = (int) $ingredient->inventory_item_id;
                $ingId = (int) $ingredient->id;
                $ingName = strtolower(trim((string) ($ingredient->inventoryItem?->name ?? '')));
                $canRemove = ! $isBeverageMenu && ($ingredient->is_removable !== false);

                if ($canRemove && (in_array($invId, $removedIds, true) || in_array($ingId, $removedIds, true) || ($ingName !== '' && in_array($ingName, $removedNames, true)))) {
                    continue; // Skip deduction for customer-removed removable ingredients (Prompt 124)
                }

                $inventory = $ingredient->inventoryItem ?? InventoryItem::query()->find($invId);
                if (! $inventory) {
                    continue;
                }

                $recipeUnit = $ingredient->unit ?: $inventory->unit;
                $stockUnit = $inventory->unit;
                $qtyPerServingInStockUnit = UnitConverter::toStockUnit(
                    (float) $ingredient->qty_per_serving,
                    $recipeUnit,
                    $stockUnit,
                    $inventory->portion_unit,
                    $inventory->portions_per_unit !== null ? (float) $inventory->portions_per_unit : null
                );
                $qty = $qtyPerServingInStockUnit * $lineQty;

                if (! isset($demands[$invId])) {
                    $demands[$invId] = [
                        'inventory_item_id' => $invId,
                        'inventory' => $inventory,
                        'qty' => 0.0,
                        'item_names' => [],
                    ];
                }
                $demands[$invId]['qty'] += $qty;
                $label = ! empty($lineSize) && $menu->has_sizes
                    ? "{$menu->name} ({$lineSize})"
                    : $menu->name;
                if (! in_array($label, $demands[$invId]['item_names'], true)) {
                    $demands[$invId]['item_names'][] = $label;
                }
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
                    $lineQty = (int) (is_array($line) ? ($line['qty'] ?? 1) : $line->qty);
                    $lineSize = is_array($line) ? ($line['size'] ?? null) : $line->size;
                    $itemLabel = ! empty($lineSize) && $menu->has_sizes
                        ? "{$menu->name} ({$lineSize})"
                        : $menu->name;

                    if (! $menu->available || $menu->archived) {
                        throw ValidationException::withMessages([
                            'items' => ["The item '{$itemLabel}' is currently unavailable."],
                        ]);
                    }

                    $lineRemoved = is_array($line['removed_ingredients'] ?? null) ? $line['removed_ingredients'] : [];
                    $reason = $this->unserviceableReason($menu, $lineQty, $lineSize, $lineRemoved);
                    if ($reason === 'expired') {
                        throw ValidationException::withMessages([
                            'items' => ["The item '{$itemLabel}' cannot be ordered because one or more ingredients are expired."],
                        ]);
                    }
                    if ($reason === 'missing') {
                        throw ValidationException::withMessages([
                            'items' => ["The item '{$itemLabel}' is currently unavailable."],
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
            $itemNames = ! empty($demand['item_names']) ? implode(', ', $demand['item_names']) : 'selected item';

            if ($inventory->trashed() || $inventory->status === 'Archived') {
                throw ValidationException::withMessages([
                    'items' => ["The item '{$itemNames}' (ingredient '{$inventory->name}') is currently unavailable."],
                ]);
            }

            // Sum available unexpired stock across open batches
            if ($inventory->batches()->exists()) {
                $available = (float) $inventory->batches()
                    ->where('stock', '>', 0)
                    ->where(function ($q) {
                        $q->whereNull('expiry_date')
                            ->orWhere('expiry_date', '>=', \App\Support\ManilaTime::todayString());
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

                $shortfalls[] = "The item '{$itemNames}' is unavailable — Insufficient stock for {$inventory->name}: needed {$neededStr}, but only {$availStr} available (short by {$shortStr}).";
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

    public function unserviceableReason(MenuItem $item, int $qty = 1, ?string $size = null, array $removedIngredients = []): ?string
    {
        $item->loadMissing(['sizes']);
        if (! $item->relationLoaded('ingredients')) {
            $item->load([
                'ingredients' => fn ($q) => $q->with([
                    'inventoryItem' => fn ($q) => $q->withTrashed()->with('batches'),
                ]),
            ]);
        } else {
            $item->ingredients->loadMissing([
                'inventoryItem' => fn ($q) => $q->withTrashed()->with('batches'),
            ]);
            $inventories = $item->ingredients->pluck('inventoryItem')->filter();
            if ($inventories->isNotEmpty()) {
                \Illuminate\Database\Eloquent\Collection::make($inventories)->loadMissing('batches');
            }
        }

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

            return $this->evaluateIngredientsReason($ingredients, $qty, $removedIngredients);
        }

        // When no specific size is requested on a sized item with size-specific recipes,
        // the item as a whole is serviceable as long as at least one size can be made.
        if ($item->has_sizes && $item->sizes->isNotEmpty() && $item->ingredients->whereNotNull('menu_item_size_id')->isNotEmpty()) {
            $reasons = [];
            foreach ($item->sizes as $sizeModel) {
                $reason = $this->unserviceableReason($item, $qty, $sizeModel->name, $removedIngredients);
                if ($reason === null) {
                    return null;
                }
                $reasons[] = $reason;
            }

            if (in_array('expired', $reasons, true)) {
                return 'expired';
            }

            return $reasons[0] ?? 'insufficient';
        }

        return $this->evaluateIngredientsReason($item->ingredients, $qty, $removedIngredients);
    }

    private function isIngredientRemoved($ingredient, array $removedIngredients): bool
    {
        $invId = (int) ($ingredient->inventory_item_id ?? 0);
        $ingId = (int) ($ingredient->id ?? 0);
        $ingName = strtolower(trim((string) ($ingredient->inventoryItem?->name ?? '')));

        foreach ($removedIngredients as $r) {
            if (is_numeric($r)) {
                $id = (int) $r;
                if ($id > 0 && ($id === $invId || $id === $ingId)) {
                    return true;
                }
            } elseif (is_string($r)) {
                $trimmed = trim($r);
                if (is_numeric($trimmed)) {
                    $id = (int) $trimmed;
                    if ($id > 0 && ($id === $invId || $id === $ingId)) {
                        return true;
                    }
                } elseif ($ingName !== '' && strtolower($trimmed) === $ingName) {
                    return true;
                }
            } elseif (is_array($r)) {
                if (! empty($r['inventory_item_id']) && (int) $r['inventory_item_id'] === $invId) {
                    return true;
                }
                if (! empty($r['id']) && ((int) $r['id'] === $ingId || (int) $r['id'] === $invId)) {
                    return true;
                }
                if (! empty($r['name']) && $ingName !== '' && strtolower(trim((string) $r['name'])) === $ingName) {
                    return true;
                }
            }
        }

        return false;
    }

    private function evaluateIngredientsReason(iterable $ingredients, int $qty = 1, array $removedIngredients = []): ?string
    {
        foreach ($ingredients as $ingredient) {
            if (! empty($removedIngredients) && ($ingredient->is_removable !== false) && $this->isIngredientRemoved($ingredient, $removedIngredients)) {
                continue;
            }
            $inventory = $ingredient->inventoryItem;
            // Soft-deleted, archived, or missing inventory counts as unavailable.
            if (! $inventory || $inventory->trashed() || $inventory->status === 'Archived') {
                return 'missing';
            }

            $recipeUnit = $ingredient->unit ?: $inventory->unit;
            $stockUnit = $inventory->unit;
            $qtyInStockUnit = UnitConverter::toStockUnit(
                (float) $ingredient->qty_per_serving,
                $recipeUnit,
                $stockUnit,
                $inventory->portion_unit,
                $inventory->portions_per_unit !== null ? (float) $inventory->portions_per_unit : null
            );
            $needed = $qtyInStockUnit * $qty;

            // If batches exist: check usable (unexpired) stock using eager-loaded batches
            if (! $inventory->relationLoaded('batches')) {
                $inventory->load('batches');
            }

            $batches = $inventory->batches;
            if ($batches->isNotEmpty()) {
                $today = \App\Support\ManilaTime::todayString();
                $usableStock = 0.0;
                $totalStock = 0.0;
                $hasExpiredBatch = false;

                foreach ($batches as $batch) {
                    $bStock = (float) $batch->stock;
                    $expiryStr = $batch->expiry_date instanceof \DateTimeInterface
                        ? $batch->expiry_date->format('Y-m-d')
                        : ($batch->expiry_date !== null ? substr((string) $batch->expiry_date, 0, 10) : null);

                    if ($expiryStr !== null && $expiryStr < $today) {
                        $hasExpiredBatch = true;
                    }

                    if ($bStock > 0) {
                        $totalStock += $bStock;
                        if ($expiryStr === null || $expiryStr >= $today) {
                            $usableStock += $bStock;
                        }
                    }
                }

                if ($usableStock < $needed) {
                    if ($totalStock >= $needed) {
                        return 'expired';
                    }

                    return ($totalStock <= 0 && $hasExpiredBatch)
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
            ->with([
                'sizes',
                'ingredients' => fn ($q) => $q->with([
                    'inventoryItem' => fn ($q) => $q->withTrashed()->with('batches'),
                ]),
            ])
            ->where('archived', false)
            ->get();

        foreach ($items as $item) {
            if ($item->ingredients->isEmpty()) {
                continue;
            }

            if (! $this->canServe($item)) {
                $wasAvailable = (bool) $item->available;
                $item->update(['available' => false]);

                if ($wasAvailable) {
                    $this->notifyMenuAutoUnavailable($item);
                }
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
            ->with([
                'sizes',
                'ingredients' => fn ($q) => $q->with([
                    'inventoryItem' => fn ($q) => $q->withTrashed()->with('batches'),
                ]),
            ])
            ->whereIn('id', $menuIds)
            ->where('archived', false)
            ->get();

        foreach ($items as $item) {
            $wasAvailable = (bool) $item->available;
            $canServe = $this->canServe($item);
            $item->update(['available' => $canServe]);

            if ($wasAvailable && ! $canServe) {
                $this->notifyMenuAutoUnavailable($item, $inventoryItemId);
            }
        }
    }

    public function disableMenuItems(iterable $menuItemIds, ?int $triggerInventoryId = null): void
    {
        $ids = collect($menuItemIds)->filter()->unique()->values();
        if ($ids->isEmpty()) {
            return;
        }

        $items = MenuItem::query()
            ->with([
                'sizes',
                'ingredients' => fn ($q) => $q->with([
                    'inventoryItem' => fn ($q) => $q->withTrashed()->with('batches'),
                ]),
            ])
            ->whereIn('id', $ids)
            ->where('archived', false)
            ->get();

        foreach ($items as $item) {
            $wasAvailable = (bool) $item->available;
            $item->update(['available' => false]);

            if ($wasAvailable) {
                $this->notifyMenuAutoUnavailable($item, $triggerInventoryId);
            }
        }
    }

    private function notifyMenuAutoUnavailable(MenuItem $item, ?int $triggerInventoryId = null): void
    {
        $item->loadMissing(['ingredients' => fn ($q) => $q->with(['inventoryItem' => fn ($q) => $q->withTrashed()])]);
        $reason = $this->unserviceableReason($item) ?: 'insufficient';
        $ingredientName = $this->resolveLimitingIngredientName($item, $triggerInventoryId);

        \App\Models\Notification::createMenuUnavailableNotification($item, $ingredientName, $reason);
    }

    private function resolveLimitingIngredientName(MenuItem $item, ?int $triggerInventoryId = null): string
    {
        if ($triggerInventoryId) {
            $matched = $item->ingredients->firstWhere('inventory_item_id', $triggerInventoryId);
            if ($matched?->inventoryItem?->name) {
                return $matched->inventoryItem->name;
            }
            $inv = InventoryItem::withTrashed()->find($triggerInventoryId);
            if ($inv?->name) {
                return $inv->name;
            }
        }

        foreach ($item->ingredients as $ingredient) {
            $singleReason = $this->evaluateIngredientsReason([$ingredient], 1);
            if ($singleReason !== null && $ingredient->inventoryItem?->name) {
                return $ingredient->inventoryItem->name;
            }
        }

        return $item->ingredients->first()?->inventoryItem?->name ?? 'linked ingredient';
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
                        'date_placed' => $inventory->date_placed ?? \App\Support\ManilaTime::todayString(),
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

                        // Auto-end expiring-stock promo the moment this batch is depleted via orders
                        if ($newBatchStock <= 0.00001) {
                            $this->handleDepletedBatchPromo($batch, $inventory);
                        }
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

    /**
     * When a promoted expiring batch is completely sold through (stock reaches 0),
     * automatically resolve its promo disposition and deactivate customer-facing promos
     * on linked menu items unless another non-expired batch still has an active promo.
     */
    protected function handleDepletedBatchPromo(\App\Models\InventoryBatch $batch, InventoryItem $inventory): void
    {
        $activePromo = \App\Models\InventoryDisposition::query()
            ->where('inventory_batch_id', $batch->id)
            ->where('disposition', \App\Models\InventoryDisposition::PROMO)
            ->whereNull('resolved_at')
            ->latest('id')
            ->first();

        if (! $activePromo) {
            return;
        }

        $existingNote = trim((string) ($activePromo->notes ?? ''));
        $suffix = 'Auto-resolved: batch cleared via orders.';
        $activePromo->update([
            'disposition' => \App\Models\InventoryDisposition::RESOLVED,
            'resolved_at' => now(),
            'notes' => $existingNote !== '' ? "{$existingNote} | {$suffix}" : $suffix,
        ]);

        $this->clearLinkedPromosIfNoOtherActivePromoBatch($inventory->id, $batch->id);

        \App\Models\ActivityLog::query()->create([
            'actor' => 'System',
            'action' => "Auto-ended promo for {$inventory->name} (Batch {$batch->batch_no} cleared)",
        ]);
    }

    /**
     * Safeguard: deactivate customer-facing menu promos tied to batches that have
     * already passed their expiry date or hit zero stock, without resolving overdue
     * batches (overdue batches still require explicit Waste disposal).
     */
    public function clearExpiredBatchPromos(): void
    {
        if (! MenuItem::query()->where('promo_active', true)->exists()) {
            return;
        }

        $today = \App\Support\ManilaTime::todayString();

        $stalePromos = \App\Models\InventoryDisposition::query()
            ->with('batch')
            ->where('disposition', \App\Models\InventoryDisposition::PROMO)
            ->whereNull('resolved_at')
            ->get()
            ->filter(function ($disp) use ($today) {
                $batch = $disp->batch;
                if (! $batch) {
                    return true;
                }
                if ((float) $batch->stock <= 0.00001) {
                    return true;
                }

                return $batch->expiry_date !== null && $batch->expiry_date->toDateString() < $today;
            });

        foreach ($stalePromos as $disp) {
            $batch = $disp->batch;
            $invId = $disp->inventory_item_id;

            // If depleted (not overdue), auto-resolve disposition
            if ($batch && (float) $batch->stock <= 0.00001 && ! $batch->isExpired()) {
                $disp->update([
                    'disposition' => \App\Models\InventoryDisposition::RESOLVED,
                    'resolved_at' => now(),
                ]);
            }

            if ($invId) {
                $this->clearLinkedPromosIfNoOtherActivePromoBatch($invId, $batch?->id);
            }
        }
    }

    protected function clearLinkedPromosIfNoOtherActivePromoBatch(int $inventoryItemId, ?int $excludeBatchId = null): void
    {
        $today = \App\Support\ManilaTime::todayString();

        $hasOtherActive = \App\Models\InventoryDisposition::query()
            ->where('inventory_item_id', $inventoryItemId)
            ->where('disposition', \App\Models\InventoryDisposition::PROMO)
            ->whereNull('resolved_at')
            ->when($excludeBatchId, fn ($q) => $q->where('inventory_batch_id', '!=', $excludeBatchId))
            ->whereHas('batch', function ($q) use ($today) {
                $q->where('stock', '>', 0)
                    ->where(function ($sub) use ($today) {
                        $sub->whereNull('expiry_date')
                            ->orWhere('expiry_date', '>=', $today);
                    });
            })
            ->exists();

        if ($hasOtherActive) {
            return;
        }

        $menuIds = MenuItemIngredient::query()
            ->where('inventory_item_id', $inventoryItemId)
            ->pluck('menu_item_id')
            ->unique();

        if ($menuIds->isNotEmpty()) {
            MenuItem::query()
                ->whereIn('id', $menuIds)
                ->update([
                    'promo_active' => false,
                    'promo_discount_percent' => null,
                    'promo_label' => null,
                ]);
        }
    }
}
