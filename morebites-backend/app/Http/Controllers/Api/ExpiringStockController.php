<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryBatch;
use App\Models\InventoryDisposition;
use App\Models\InventoryItem;
use App\Models\InventoryLog;
use App\Models\MenuItem;
use App\Models\MenuItemIngredient;
use App\Services\InventoryDeductionService;
use Illuminate\Http\Request;

class ExpiringStockController extends Controller
{
    public function index(Request $request)
    {
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

        $weekStart = now()->startOfWeek();

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
            abort(422, 'This batch is expired and can only be marked as Waste.');
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
            abort(422, 'This batch is expired and can only be marked as Waste.');
        }

        $data = $request->validate([
            'menu_item_id' => ['required', 'integer', 'exists:menu_items,id'],
            'discount_percent' => ['required', 'numeric', 'min:1', 'max:90'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $linked = MenuItemIngredient::query()
            ->where('inventory_item_id', $batch->inventory_item_id)
            ->where('menu_item_id', $data['menu_item_id'])
            ->exists();

        abort_unless($linked, 422, 'Selected menu item does not use this inventory item.');

        $menu = MenuItem::query()->findOrFail($data['menu_item_id']);
        $label = 'Use It Up — '.$batch->item->name;

        $this->clearPromosForInventory($batch->inventory_item_id);

        $menu->update([
            'promo_active' => true,
            'promo_discount_percent' => (float) $data['discount_percent'],
            'promo_label' => $label,
        ]);

        $this->upsertBatchDisposition($batch, [
            'disposition' => InventoryDisposition::PROMO,
            'promo_menu_item_id' => $menu->id,
            'promo_discount_percent' => (float) $data['discount_percent'],
            'notes' => $data['notes'] ?? null,
            'user_id' => $request->user()?->id,
        ]);

        return response()->json(['data' => $this->transformBatch($batch->fresh())]);
    }

    public function resolveBatch(Request $request, InventoryBatch $batch)
    {
        $this->resolveBatchDisposition($batch, InventoryDisposition::RESOLVED, $request);
        $this->clearPromosForInventory($batch->inventory_item_id);

        return response()->json(['message' => 'Resolved']);
    }

    // Backward compatibility handlers accepting InventoryItem $inventory
    public function markWaste(Request $request, InventoryItem $inventory)
    {
        $batchId = $request->input('batch_id');
        $batch = $batchId ? $inventory->batches()->find($batchId) : null;
        if (! $batch) {
            $batch = $inventory->batches()->where('stock', '>', 0)->orderBy('expiry_date')->first();
        }

        if ($batch) {
            return $this->markWasteBatch($request, $batch);
        }

        abort_unless($inventory->expiry_date, 422, 'This item is not perishable.');
        $inventory->update(['stock' => 0, 'status' => 'Expired']);
        $this->clearPromosForInventory($inventory->id);
        app(InventoryDeductionService::class)->syncMenusUsingInventory($inventory->id);

        return response()->json(['message' => 'Item marked as waste']);
    }

    public function setKitchenPriority(Request $request, InventoryItem $inventory)
    {
        $batchId = $request->input('batch_id');
        $batch = $batchId ? $inventory->batches()->find($batchId) : null;
        if (! $batch) {
            $batch = $inventory->batches()->where('stock', '>', 0)->orderBy('expiry_date')->first();
        }

        if ($batch) {
            return $this->setKitchenPriorityBatch($request, $batch);
        }

        abort(422, 'No active batch found for this item.');
    }

    public function setPromo(Request $request, InventoryItem $inventory)
    {
        $batchId = $request->input('batch_id');
        $batch = $batchId ? $inventory->batches()->find($batchId) : null;
        if (! $batch) {
            $batch = $inventory->batches()->where('stock', '>', 0)->orderBy('expiry_date')->first();
        }

        if ($batch) {
            return $this->setPromoBatch($request, $batch);
        }

        abort(422, 'No active batch found for this item.');
    }

    public function resolve(Request $request, InventoryItem $inventory)
    {
        $batchId = $request->input('batch_id');
        $batch = $batchId ? $inventory->batches()->find($batchId) : null;
        if (! $batch) {
            $batch = $inventory->batches()->latest('id')->first();
        }

        if ($batch) {
            return $this->resolveBatch($request, $batch);
        }

        $this->clearPromosForInventory($inventory->id);

        return response()->json(['message' => 'Resolved']);
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

        $linkedMenus = MenuItemIngredient::query()
            ->where('inventory_item_id', $item->id)
            ->with('menuItem')
            ->get()
            ->map(fn (MenuItemIngredient $row) => [
                'id' => $row->menuItem?->id,
                'name' => $row->menuItem?->name,
                'category' => $row->menuItem?->category,
                'promo_active' => (bool) ($row->menuItem?->promo_active),
            ])
            ->filter(fn ($row) => $row['id'])
            ->values();

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
            'stock' => (float) $batch->stock,
            'unit' => $item->unit,
            'date_placed' => $batch->date_placed?->format('M d, Y'),
            'expiry_date' => $batch->expiry_date?->format('M d, Y'),
            'expiry_date_raw' => $batch->expiry_date?->format('Y-m-d'),
            'days_until_expiry' => $daysUntil,
            'status' => $batch->status,
            'disposition' => $disposition?->disposition ?? InventoryDisposition::PENDING,
            'disposition_label' => $this->dispositionLabel($disposition?->disposition ?? InventoryDisposition::PENDING),
            'promo_menu_item_id' => $disposition?->promo_menu_item_id,
            'promo_discount_percent' => $disposition?->promo_discount_percent,
            'notes' => $disposition?->notes,
            'linked_menus' => $linkedMenus,
        ];
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
