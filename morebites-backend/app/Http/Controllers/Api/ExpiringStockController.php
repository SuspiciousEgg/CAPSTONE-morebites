<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\InventoryBatch;
use App\Models\InventoryDisposition;
use App\Models\InventoryItem;
use App\Models\InventoryLog;
use App\Models\MenuItem;
use App\Models\MenuItemIngredient;
use App\Services\InventoryDeductionService;
use App\Support\UnitConverter;
use Illuminate\Http\Request;

class ExpiringStockController extends Controller
{
    public function index(Request $request)
    {
        app(InventoryDeductionService::class)->clearExpiredBatchPromos();

        $batches = InventoryBatch::query()
            ->whereHas('item', fn ($q) => $q->where('status', '!=', 'Archived')->whereNull('deleted_at'))
            ->whereNotNull('expiry_date')
            ->where(function ($q) {
                $q->whereIn('status', ['Expiring Soon', 'Expires Today', 'Expired'])
                    ->orWhereHas('dispositions', fn ($d) => $d->whereNull('resolved_at'));
            })
            ->with([
                'item',
                'dispositions' => fn ($q) => $q->whereNull('resolved_at')->latest('id'),
            ])
            ->get()
            ->filter(fn (InventoryBatch $b) => (float) $b->stock > 0 || $b->activeDisposition())
            ->map(function (InventoryBatch $b) use ($request) {
                $b->syncComputedStatus();
                $b->refresh();

                if (! $b->activeDisposition()) {
                    InventoryDisposition::query()->create([
                        'inventory_item_id' => $b->inventory_item_id,
                        'inventory_batch_id' => $b->id,
                        'disposition' => InventoryDisposition::PENDING,
                        'user_id' => $request->user()?->id,
                    ]);
                    $b->load(['dispositions' => fn ($q) => $q->whereNull('resolved_at')->latest('id')]);
                }

                return $this->transformBatch($b);
            })
            ->sortBy(fn ($row) => [$row['days_until_expiry'] ?? 999, $row['name'], $row['batch_no']])
            ->values();

        $weekStart = \App\Support\ManilaTime::startOfWeekUtc();

        return response()->json([
            'data' => $batches,
            'meta' => [
                'stats' => [
                    'expiring_soon' => $batches->where('status', 'Expiring Soon')->count(),
                    'expires_today' => $batches->where('status', 'Expires Today')->count(),
                    'awaiting_action' => $batches->where('disposition', InventoryDisposition::PENDING)->count(),
                    'resolved_week' => InventoryDisposition::query()
                        ->where('disposition', InventoryDisposition::RESOLVED)
                        ->where('resolved_at', '>=', $weekStart)
                        ->count(),
                ],
            ],
        ]);
    }

    public function markWasteBatch(Request $request, InventoryBatch $batch)
    {
        abort_unless($batch->expiry_date, 422, 'This batch is not perishable.');

        $prevStock = (float) $batch->stock;
        $batch->update([
            'stock' => 0,
            'status' => 'Expired',
        ]);

        $item = $batch->item;

        $this->writeBatchLog($request, $batch, [
            'quantity' => -$prevStock,
            'previous_stock' => $prevStock,
            'reason' => 'Marked as waste from expiring stock queue (Batch '.$batch->batch_no.')',
            'action_label' => 'Spoilage / Waste',
            'notes' => $request->input('notes', 'Disposed due to expiry.'),
            'log_type' => 'Expired',
            'stock_level' => '0 '.$item->unit,
            'status' => 'Expired',
        ]);

        $this->resolveBatchDisposition($batch, InventoryDisposition::WASTE, $request);
        $item->recalculateStockFromBatches();

        \App\Models\Notification::notifyIfLowStock($item->fresh());

        if ((float) $item->stock <= 0) {
            $this->clearPromosForInventory($item->id);
        }

        app(InventoryDeductionService::class)->syncMenusUsingInventory($item->id);

        return response()->json(['data' => $this->transformBatch($batch->fresh())]);
    }

    public function setKitchenPriorityBatch(Request $request, InventoryBatch $batch)
    {
        abort_unless($batch->expiry_date, 422, 'This batch is not perishable.');

        $daysUntil = $batch->daysUntilExpiry();
        if (($daysUntil !== null && $daysUntil < 0) || $batch->isExpired()) {
            abort(422, 'This item is expired and can only be marked as Waste.');
        }

        $this->upsertBatchDisposition($batch, [
            'disposition' => InventoryDisposition::KITCHEN_PRIORITY,
            'notes' => $request->input('notes'),
            'user_id' => $request->user()?->id,
        ]);

        return response()->json(['data' => $this->transformBatch($batch->fresh())]);
    }

    public function setPromoBatch(Request $request, InventoryBatch $batch)
    {
        abort_unless($batch->expiry_date, 422, 'This batch is not perishable.');

        $daysUntil = $batch->daysUntilExpiry();
        if (($daysUntil !== null && $daysUntil < 0) || $batch->isExpired()) {
            abort(422, 'This item is expired and can only be marked as Waste.');
        }

        $data = $request->validate([
            'menu_item_id' => ['required_without:menu_item_ids', 'nullable', 'integer', 'exists:menu_items,id'],
            'menu_item_ids' => ['required_without:menu_item_id', 'nullable', 'array', 'min:1'],
            'menu_item_ids.*' => ['integer', 'exists:menu_items,id'],
            'discount_percent' => ['required', 'numeric', 'min:1', 'max:90'],
            'promo_label' => ['nullable', 'string', 'max:60'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $selectedIds = collect($data['menu_item_ids'] ?? [])
            ->when(! empty($data['menu_item_id']), fn ($c) => $c->push((int) $data['menu_item_id']))
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();

        abort_if($selectedIds->isEmpty(), 422, 'Select at least one menu item for this promo.');

        $linkedIds = MenuItemIngredient::query()
            ->where('inventory_item_id', $batch->inventory_item_id)
            ->whereIn('menu_item_id', $selectedIds)
            ->pluck('menu_item_id')
            ->unique();

        foreach ($selectedIds as $menuId) {
            abort_unless($linkedIds->contains($menuId), 422, 'Selected menu item does not use this inventory item.');
        }

        $menus = MenuItem::query()->whereIn('id', $selectedIds)->get();
        $defaultLabel = $this->suggestedPromoLabel($daysUntil);
        $customerLabel = trim((string) ($data['promo_label'] ?? '')) ?: $defaultLabel;

        $this->clearPromosForInventory($batch->inventory_item_id);

        foreach ($menus as $menu) {
            $menu->update([
                'promo_active' => true,
                'promo_discount_percent' => (float) $data['discount_percent'],
                'promo_label' => $customerLabel,
            ]);
        }

        $menuNames = $menus->pluck('name')->implode(', ');
        $internalNote = trim((string) ($data['notes'] ?? ''))
            ?: "Promo ({$data['discount_percent']}% off · {$customerLabel}) on {$menuNames} to clear Batch {$batch->batch_no}.";

        $this->upsertBatchDisposition($batch, [
            'disposition' => InventoryDisposition::PROMO,
            'promo_menu_item_id' => $selectedIds->first(),
            'promo_discount_percent' => (float) $data['discount_percent'],
            'notes' => $internalNote,
            'user_id' => $request->user()?->id,
        ]);

        $actor = $request->user()?->name ?: 'Staff';
        ActivityLog::query()->create([
            'actor' => $actor,
            'action' => "Activated {$data['discount_percent']}% promo ({$customerLabel}) on {$menuNames} for expiring {$batch->item->name} (Batch {$batch->batch_no})",
        ]);

        return response()->json(['data' => $this->transformBatch($batch->fresh())]);
    }

    public function resolveBatch(Request $request, InventoryBatch $batch)
    {
        $daysUntil = $batch->daysUntilExpiry();
        if (($daysUntil !== null && $daysUntil < 0) || $batch->isExpired()) {
            abort(422, 'This item is expired and can only be marked as Waste.');
        }

        $this->resolveBatchDisposition($batch, InventoryDisposition::RESOLVED, $request);
        $this->clearPromosForInventory($batch->inventory_item_id);

        return response()->json(['message' => 'Resolved']);
    }

    // Backward compatibility handlers accepting InventoryItem $inventory
    public function markWaste(Request $request, InventoryItem $inventory)
    {
        $batch = $this->ensureActiveBatch($inventory, $request->input('batch_id'));

        if ($batch) {
            return $this->markWasteBatch($request, $batch);
        }

        abort_unless($inventory->expiry_date, 422, 'This item is not perishable.');
        $inventory->update(['stock' => 0, 'status' => 'Expired']);
        $this->clearPromosForInventory($inventory->id);
        \App\Models\Notification::notifyIfLowStock($inventory->fresh());
        app(InventoryDeductionService::class)->syncMenusUsingInventory($inventory->id);

        return response()->json(['message' => 'Item marked as waste']);
    }

    public function setKitchenPriority(Request $request, InventoryItem $inventory)
    {
        $batch = $this->ensureActiveBatch($inventory, $request->input('batch_id'));

        if ($batch) {
            return $this->setKitchenPriorityBatch($request, $batch);
        }

        abort(422, 'No active batch found for this item.');
    }

    public function setPromo(Request $request, InventoryItem $inventory)
    {
        $batch = $this->ensureActiveBatch($inventory, $request->input('batch_id'));

        if ($batch) {
            return $this->setPromoBatch($request, $batch);
        }

        abort(422, 'No active batch found for this item.');
    }

    public function resolve(Request $request, InventoryItem $inventory)
    {
        $batch = $this->ensureActiveBatch($inventory, $request->input('batch_id'));

        if ($batch) {
            return $this->resolveBatch($request, $batch);
        }

        $daysUntil = $inventory->daysUntilExpiry();
        if (($daysUntil !== null && $daysUntil < 0) || $inventory->isExpired()) {
            abort(422, 'This item is expired and can only be marked as Waste.');
        }

        $this->clearPromosForInventory($inventory->id);

        return response()->json(['message' => 'Resolved']);
    }

    private function ensureActiveBatch(InventoryItem $inventory, $batchId = null): ?InventoryBatch
    {
        $batch = $batchId ? $inventory->batches()->find($batchId) : null;
        if (! $batch) {
            $batch = $inventory->batches()->where('stock', '>', 0)->orderBy('expiry_date')->first()
                ?? $inventory->batches()->latest('id')->first();
        }

        if (! $batch && ((float) $inventory->stock > 0 || $inventory->expiry_date)) {
            $batch = $inventory->batches()->create([
                'batch_no' => $inventory->batch_no ?: InventoryItem::makeBatchNo($inventory->name, $inventory->date_placed),
                'stock' => (float) $inventory->stock,
                'initial_stock' => (float) $inventory->stock,
                'date_placed' => $inventory->date_placed ?? \App\Support\ManilaTime::todayString(),
                'expiry_date' => $inventory->expiry_date,
                'status' => InventoryItem::deriveStatus((float) $inventory->stock, (float) $inventory->reorder_level, $inventory->expiry_date),
            ]);
        }

        return $batch;
    }

    private function upsertBatchDisposition(InventoryBatch $batch, array $attrs): InventoryDisposition
    {
        $active = $batch->activeDisposition();
        if ($active) {
            $active->update([
                ...$attrs,
                'resolved_at' => null,
            ]);

            return $active->fresh();
        }

        return InventoryDisposition::query()->create([
            'inventory_item_id' => $batch->inventory_item_id,
            'inventory_batch_id' => $batch->id,
            ...$attrs,
        ]);
    }

    private function resolveBatchDisposition(InventoryBatch $batch, string $disposition, Request $request): void
    {
        $active = $batch->activeDisposition();
        if ($active) {
            $active->update([
                'disposition' => $disposition,
                'resolved_at' => now(),
                'notes' => $request->input('notes') ?? $active->notes,
                'user_id' => $request->user()?->id ?? $active->user_id,
            ]);

            return;
        }

        InventoryDisposition::query()->create([
            'inventory_item_id' => $batch->inventory_item_id,
            'inventory_batch_id' => $batch->id,
            'disposition' => $disposition,
            'resolved_at' => now(),
            'notes' => $request->input('notes'),
            'user_id' => $request->user()?->id,
        ]);
    }

    private function clearPromosForInventory(int $inventoryItemId): void
    {
        $menuIds = MenuItemIngredient::query()
            ->where('inventory_item_id', $inventoryItemId)
            ->pluck('menu_item_id');

        MenuItem::query()
            ->whereIn('id', $menuIds)
            ->update([
                'promo_active' => false,
                'promo_discount_percent' => null,
                'promo_label' => null,
            ]);
    }

    private function writeBatchLog(Request $request, InventoryBatch $batch, array $extra = []): void
    {
        $item = $batch->item;
        InventoryLog::query()->create([
            'inventory_item_id' => $item->id,
            'inventory_batch_id' => $batch->id,
            'item_name' => $item->name,
            'category' => $item->category,
            'stock_level' => $extra['stock_level'] ?? ($batch->stock.' '.$item->unit),
            'quantity' => $extra['quantity'] ?? null,
            'previous_stock' => $extra['previous_stock'] ?? null,
            'unit' => $item->unit,
            'reason' => $extra['reason'] ?? null,
            'action_label' => $extra['action_label'] ?? null,
            'notes' => $extra['notes'] ?? null,
            'batch_no' => $batch->batch_no,
            'date_placed' => $batch->date_placed ?? $item->date_placed,
            'expiry_date' => $batch->expiry_date,
            'log_type' => $extra['log_type'],
            'status' => $extra['status'] ?? $batch->status,
            'user_id' => $request->user()?->id,
        ]);
    }

    private function transformBatch(InventoryBatch $batch): array
    {
        $item = $batch->item;
        $disposition = $batch->activeDisposition();
        $daysUntil = $batch->daysUntilExpiry();
        $batchStock = (float) $batch->stock;
        $stockUnit = $item->unit ?: 'pcs';

        $ingredientRows = MenuItemIngredient::query()
            ->where('inventory_item_id', $item->id)
            ->with(['menuItem.sizes', 'menuItemSize'])
            ->get()
            ->filter(fn (MenuItemIngredient $row) => $row->menuItem && ! $row->menuItem->archived);

        $linkedMenus = $ingredientRows
            ->groupBy('menu_item_id')
            ->map(function ($rows) use ($batchStock, $stockUnit) {
                /** @var MenuItem $menu */
                $menu = $rows->first()->menuItem;
                $sizeEstimates = [];

                foreach ($rows as $row) {
                    $recipeQty = (float) $row->qty_per_serving;
                    $recipeUnit = $row->unit ?: $stockUnit;
                    try {
                        $qtyInStockUnit = UnitConverter::convert($recipeQty, $recipeUnit, $stockUnit);
                    } catch (\Throwable) {
                        $qtyInStockUnit = $recipeQty;
                    }

                    $ordersToClear = ($qtyInStockUnit > 0 && $batchStock > 0)
                        ? (int) ceil($batchStock / $qtyInStockUnit)
                        : null;

                    $sizeName = $row->menuItemSize?->name;
                    $sizePrice = $row->menuItemSize ? (float) $row->menuItemSize->price : (float) $menu->price;

                    $sizeEstimates[] = [
                        'size_id' => $row->menu_item_size_id,
                        'size_name' => $sizeName,
                        'price' => $sizePrice,
                        'qty_per_serving' => $recipeQty,
                        'unit' => $recipeUnit,
                        'qty_in_stock_unit' => round($qtyInStockUnit, 4),
                        'usage_label' => $this->formatQtyLabel($recipeQty, $recipeUnit),
                        'orders_to_clear' => $ordersToClear,
                    ];
                }

                // Order size estimates from smallest to largest usage
                usort($sizeEstimates, fn ($a, $b) => $a['qty_in_stock_unit'] <=> $b['qty_in_stock_unit']);

                $usages = array_column($sizeEstimates, 'qty_in_stock_unit');
                $maxUsage = count($usages) ? (float) max($usages) : 0.0;
                $minUsage = count($usages) ? (float) min($usages) : 0.0;

                $orderCounts = array_values(array_filter(
                    array_column($sizeEstimates, 'orders_to_clear'),
                    fn ($v) => $v !== null
                ));
                $minOrders = count($orderCounts) ? (int) min($orderCounts) : null;
                $maxOrders = count($orderCounts) ? (int) max($orderCounts) : null;

                $firstEst = $sizeEstimates[0] ?? null;
                $lastEst = $sizeEstimates[count($sizeEstimates) - 1] ?? null;
                if ($firstEst && $lastEst && $firstEst['usage_label'] !== $lastEst['usage_label']) {
                    $usageSummary = "{$firstEst['usage_label']} – {$lastEst['usage_label']} / order";
                } elseif ($firstEst) {
                    $usageSummary = "{$firstEst['usage_label']} / order";
                } else {
                    $usageSummary = '—';
                }

                if ($minOrders !== null && $maxOrders !== null) {
                    $ordersToClearLabel = $minOrders === $maxOrders
                        ? "~{$minOrders} ".($minOrders === 1 ? 'order' : 'orders')
                        : "~{$minOrders}–{$maxOrders} orders";
                } else {
                    $ordersToClearLabel = null;
                }

                $sizePrices = $menu->has_sizes && $menu->sizes->isNotEmpty()
                    ? $menu->sizes->pluck('price')->map(fn ($p) => (float) $p)
                    : collect([(float) $menu->price]);

                return [
                    'id' => $menu->id,
                    'name' => $menu->name,
                    'category' => $menu->category,
                    'has_sizes' => (bool) $menu->has_sizes,
                    'min_price' => (float) ($sizePrices->min() ?? $menu->price),
                    'max_price' => (float) ($sizePrices->max() ?? $menu->price),
                    'promo_active' => (bool) $menu->promo_active,
                    'promo_discount_percent' => $menu->promo_active ? (float) $menu->promo_discount_percent : null,
                    'promo_label' => $menu->promo_active ? $menu->promo_label : null,
                    'max_usage_in_stock_unit' => $maxUsage,
                    'min_usage_in_stock_unit' => $minUsage,
                    'usage_summary' => $usageSummary,
                    'min_orders_to_clear' => $minOrders,
                    'max_orders_to_clear' => $maxOrders,
                    'orders_to_clear_label' => $ordersToClearLabel,
                    'size_estimates' => $sizeEstimates,
                    'recommended' => false,
                ];
            })
            ->sort(function ($a, $b) {
                if ($b['max_usage_in_stock_unit'] !== $a['max_usage_in_stock_unit']) {
                    return $b['max_usage_in_stock_unit'] <=> $a['max_usage_in_stock_unit'];
                }

                return strcasecmp($a['name'], $b['name']);
            })
            ->values()
            ->map(function ($row, $idx) {
                if ($idx === 0 && $row['max_usage_in_stock_unit'] > 0) {
                    $row['recommended'] = true;
                }

                return $row;
            });

        $parts = array_filter([$item->category, $item->subcategory, $item->subcategory_detail]);

        return [
            'id' => $batch->id,
            'batch_id' => $batch->id,
            'inventory_item_id' => $item->id,
            'name' => $item->name,
            'batch_no' => $batch->batch_no,
            'category' => $item->category,
            'subcategory' => $item->subcategory,
            'subcategory_detail' => $item->subcategory_detail,
            'category_label' => implode(' › ', $parts),
            'stock' => $batchStock,
            'unit' => $stockUnit,
            'date_placed' => $batch->date_placed?->format('M d, Y'),
            'expiry_date' => $batch->expiry_date?->format('M d, Y'),
            'expiry_date_raw' => $batch->expiry_date?->format('Y-m-d'),
            'days_until_expiry' => $daysUntil,
            'status' => $batch->status,
            'disposition' => $disposition?->disposition ?? InventoryDisposition::PENDING,
            'disposition_label' => $this->dispositionLabel($disposition?->disposition ?? InventoryDisposition::PENDING),
            'promo_menu_item_id' => $disposition?->promo_menu_item_id,
            'promo_discount_percent' => $disposition?->promo_discount_percent,
            'suggested_discount_percent' => $this->suggestedDiscountPercent($daysUntil),
            'suggested_promo_label' => $this->suggestedPromoLabel($daysUntil),
            'notes' => $disposition?->notes,
            'linked_menus' => $linkedMenus,
        ];
    }

    private function suggestedDiscountPercent(?int $daysUntil): int
    {
        if ($daysUntil !== null && $daysUntil <= 0) {
            return 25;
        }
        if ($daysUntil !== null && $daysUntil <= 3) {
            return 15;
        }

        return 10;
    }

    private function suggestedPromoLabel(?int $daysUntil): string
    {
        if ($daysUntil !== null && $daysUntil <= 0) {
            return 'Flash Deal';
        }
        if ($daysUntil !== null && $daysUntil <= 3) {
            return "Today's Special";
        }

        return 'Limited Deal';
    }

    private function formatQtyLabel(float $qty, string $unit): string
    {
        $formatted = rtrim(rtrim(number_format($qty, 3, '.', ''), '0'), '.');
        if ($formatted === '' || $formatted === '-0') {
            $formatted = '0';
        }

        return "{$formatted} {$unit}";
    }

    private function dispositionLabel(string $disposition): string
    {
        return match ($disposition) {
            InventoryDisposition::PROMO => 'Use for promo',
            InventoryDisposition::KITCHEN_PRIORITY => 'Kitchen priority',
            InventoryDisposition::WASTE => 'Marked as waste',
            InventoryDisposition::RESOLVED => 'Resolved',
            default => 'Pending review',
        };
    }
}
