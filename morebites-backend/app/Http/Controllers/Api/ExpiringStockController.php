<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
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
        $items = InventoryItem::query()
            ->whereNotNull('expiry_date')
            ->where(function ($q) {
                $q->whereIn('status', ['Expiring Soon', 'Expires Today', 'Expired'])
                    ->orWhereHas('dispositions', fn ($d) => $d->whereNull('resolved_at'));
            })
            ->with(['dispositions' => fn ($q) => $q->whereNull('resolved_at')->latest('id')])
            ->get()
            ->filter(fn (InventoryItem $item) => (float) $item->stock > 0 || $item->activeDisposition())
            ->map(function (InventoryItem $item) use ($request) {
                $this->syncComputedStatus($item);
                $item->refresh();

                if (! $item->activeDisposition()) {
                    InventoryDisposition::query()->create([
                        'inventory_item_id' => $item->id,
                        'disposition' => InventoryDisposition::PENDING,
                        'user_id' => $request->user()?->id,
                    ]);
                    $item->load(['dispositions' => fn ($q) => $q->whereNull('resolved_at')->latest('id')]);
                }

                return $this->transform($item);
            })
            ->sortBy(fn ($row) => [$row['days_until_expiry'] ?? 999, $row['name']])
            ->values();

        $weekStart = now()->startOfWeek();

        return response()->json([
            'data' => $items,
            'meta' => [
                'stats' => [
                    'expiring_soon' => $items->where('status', 'Expiring Soon')->count(),
                    'expires_today' => $items->where('status', 'Expires Today')->count(),
                    'awaiting_action' => $items->where('disposition', InventoryDisposition::PENDING)->count(),
                    'resolved_week' => InventoryDisposition::query()
                        ->where('disposition', InventoryDisposition::RESOLVED)
                        ->where('resolved_at', '>=', $weekStart)
                        ->count(),
                ],
            ],
        ]);
    }

    public function markWaste(Request $request, InventoryItem $inventory)
    {
        abort_unless($inventory->expiry_date, 422, 'This item is not perishable.');

        $prevStock = (float) $inventory->stock;
        $inventory->update([
            'stock' => 0,
            'status' => 'Expired',
        ]);

        $this->writeLog($request, $inventory->fresh(), [
            'quantity' => -$prevStock,
            'previous_stock' => $prevStock,
            'reason' => 'Marked as waste from expiring stock queue',
            'action_label' => 'Spoilage / Waste',
            'notes' => $request->input('notes', 'Disposed due to expiry.'),
            'log_type' => 'Expired',
            'stock_level' => '0 '.$inventory->unit,
            'status' => 'Expired',
        ]);

        $this->resolveDisposition($inventory, InventoryDisposition::WASTE, $request);
        $this->clearPromosForInventory($inventory->id);

        app(InventoryDeductionService::class)->syncMenusUsingInventory($inventory->id);

        return response()->json(['data' => $this->transform($inventory->fresh())]);
    }

    public function setKitchenPriority(Request $request, InventoryItem $inventory)
    {
        abort_unless($inventory->expiry_date, 422, 'This item is not perishable.');

        $this->upsertDisposition($inventory, [
            'disposition' => InventoryDisposition::KITCHEN_PRIORITY,
            'notes' => $request->input('notes'),
            'user_id' => $request->user()?->id,
        ]);

        return response()->json(['data' => $this->transform($inventory->fresh())]);
    }

    public function setPromo(Request $request, InventoryItem $inventory)
    {
        abort_unless($inventory->expiry_date, 422, 'This item is not perishable.');

        $data = $request->validate([
            'menu_item_id' => ['required', 'integer', 'exists:menu_items,id'],
            'discount_percent' => ['required', 'numeric', 'min:1', 'max:90'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $linked = MenuItemIngredient::query()
            ->where('inventory_item_id', $inventory->id)
            ->where('menu_item_id', $data['menu_item_id'])
            ->exists();

        abort_unless($linked, 422, 'Selected menu item does not use this inventory item.');

        $menu = MenuItem::query()->findOrFail($data['menu_item_id']);
        $label = 'Use It Up — '.$inventory->name;

        $this->clearPromosForInventory($inventory->id);

        $menu->update([
            'promo_active' => true,
            'promo_discount_percent' => (float) $data['discount_percent'],
            'promo_label' => $label,
        ]);

        $this->upsertDisposition($inventory, [
            'disposition' => InventoryDisposition::PROMO,
            'promo_menu_item_id' => $menu->id,
            'promo_discount_percent' => (float) $data['discount_percent'],
            'notes' => $data['notes'] ?? null,
            'user_id' => $request->user()?->id,
        ]);

        return response()->json(['data' => $this->transform($inventory->fresh())]);
    }

    public function resolve(Request $request, InventoryItem $inventory)
    {
        $this->resolveDisposition($inventory, InventoryDisposition::RESOLVED, $request);
        $this->clearPromosForInventory($inventory->id);

        return response()->json(['message' => 'Resolved']);
    }

    private function upsertDisposition(InventoryItem $inventory, array $attrs): InventoryDisposition
    {
        $active = $inventory->activeDisposition();
        if ($active) {
            $active->update([
                ...$attrs,
                'resolved_at' => null,
            ]);

            return $active->fresh();
        }

        return InventoryDisposition::query()->create([
            'inventory_item_id' => $inventory->id,
            ...$attrs,
        ]);
    }

    private function resolveDisposition(InventoryItem $inventory, string $disposition, Request $request): void
    {
        $active = $inventory->activeDisposition();
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
            'inventory_item_id' => $inventory->id,
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

    private function syncComputedStatus(InventoryItem $item): void
    {
        $next = InventoryItem::deriveStatus(
            (float) $item->stock,
            (float) $item->reorder_level,
            $item->expiry_date
        );

        if ($item->status !== $next) {
            $item->update(['status' => $next]);
        }
    }

    private function writeLog(Request $request, InventoryItem $item, array $extra = []): void
    {
        InventoryLog::query()->create([
            'inventory_item_id' => $item->id,
            'item_name' => $item->name,
            'category' => $item->category,
            'stock_level' => $extra['stock_level'] ?? ($item->stock.' '.$item->unit),
            'quantity' => $extra['quantity'] ?? null,
            'previous_stock' => $extra['previous_stock'] ?? null,
            'unit' => $item->unit,
            'reason' => $extra['reason'] ?? null,
            'action_label' => $extra['action_label'] ?? null,
            'notes' => $extra['notes'] ?? null,
            'batch_no' => InventoryLog::makeBatchNo($item->id, $item->batch_no),
            'date_placed' => $item->date_placed,
            'expiry_date' => $item->expiry_date,
            'log_type' => $extra['log_type'],
            'status' => $extra['status'] ?? $item->status,
            'user_id' => $request->user()?->id,
        ]);
    }

    private function transform(InventoryItem $item): array
    {
        $disposition = $item->activeDisposition();
        $daysUntil = $item->daysUntilExpiry();

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
            'id' => $item->id,
            'name' => $item->name,
            'batch_no' => $item->batch_no,
            'category' => $item->category,
            'subcategory' => $item->subcategory,
            'subcategory_detail' => $item->subcategory_detail,
            'category_label' => implode(' › ', $parts),
            'stock' => (float) $item->stock,
            'unit' => $item->unit,
            'expiry_date' => $item->expiry_date?->format('M d, Y'),
            'expiry_date_raw' => $item->expiry_date?->format('Y-m-d'),
            'days_until_expiry' => $daysUntil,
            'status' => InventoryItem::deriveStatus(
                (float) $item->stock,
                (float) $item->reorder_level,
                $item->expiry_date
            ),
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
