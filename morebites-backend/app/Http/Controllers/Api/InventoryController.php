<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Models\InventoryLog;
use App\Models\MenuItemIngredient;
use App\Services\InventoryDeductionService;
use Carbon\Carbon;
use Illuminate\Http\Request;

class InventoryController extends Controller
{
    public function index(Request $request)
    {
        $query = InventoryItem::query()->latest();

        if ($category = $request->query('category')) {
            if ($category !== 'All Categories') {
                $query->where('category', $category);
            }
        }
        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('category', 'like', "%{$search}%")
                    ->orWhere('batch_no', 'like', "%{$search}%");
            });
        }

        $items = $query->get()->map(function (InventoryItem $i) {
            $this->syncComputedStatus($i);

            return $this->transform($i->fresh());
        });

        if ($status = $request->query('status')) {
            if ($status !== 'All Status' && $status !== 'All Statuses') {
                $items = $items->filter(fn ($row) => $row['status'] === $status)->values();
            }
        }

        $all = InventoryItem::query()->get();
        $transformed = $all->map(function (InventoryItem $i) {
            $this->syncComputedStatus($i);

            return $this->transform($i);
        });

        $weekAgo = now()->subDays(7)->startOfDay();
        $addedThisWeek = $all->filter(function (InventoryItem $i) use ($weekAgo) {
            $placed = $i->date_placed ?: $i->created_at;

            return $placed && $placed->greaterThanOrEqualTo($weekAgo);
        })->count();

        return response()->json([
            'data' => $items->values(),
            'meta' => [
                'stats' => [
                    'total' => $transformed->count(),
                    'low' => $transformed->whereIn('status', ['Low Stock', 'Out of Stock'])->count(),
                    'expiring' => $transformed->whereIn('status', ['Expiring Soon', 'Expires Today'])->count(),
                    'ok' => $transformed->where('status', 'Sufficient')->count(),
                    'added_week' => $addedThisWeek,
                ],
            ],
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string'],
            'category' => ['required', 'string'],
            'subcategory' => ['nullable', 'string'],
            'subcategory_detail' => ['nullable', 'string'],
            'stock' => ['required', 'numeric', 'min:0'],
            'unit' => ['required', 'string'],
            'reorder_level' => ['required', 'numeric', 'min:0'],
            'date_placed' => ['nullable', 'date'],
            'expiry_date' => ['nullable', 'date', 'after_or_equal:date_placed'],
            'batch_no' => ['nullable', 'string'],
        ]);

        $datePlaced = ! empty($data['date_placed'])
            ? Carbon::parse($data['date_placed'])->startOfDay()
            : now()->startOfDay();
        $expiry = ! empty($data['expiry_date']) ? Carbon::parse($data['expiry_date'])->startOfDay() : null;
        $batch = $data['batch_no'] ?? InventoryItem::makeBatchNo($data['name'], $datePlaced);

        $status = InventoryItem::deriveStatus(
            (float) $data['stock'],
            (float) $data['reorder_level'],
            $expiry
        );
        $service = app(InventoryDeductionService::class);

        $existing = InventoryItem::withTrashed()
            ->whereRaw('LOWER(name) = ?', [mb_strtolower(trim($data['name']))])
            ->first();

        if ($existing) {
            if ($existing->trashed()) {
                $existing->restore();
            }

            $prev = (float) $existing->stock;
            $existing->update([
                'category' => $data['category'],
                'subcategory' => $data['subcategory'] ?? null,
                'subcategory_detail' => $data['subcategory_detail'] ?? null,
                'stock' => $data['stock'],
                'unit' => $data['unit'],
                'reorder_level' => $data['reorder_level'],
                'batch_no' => $batch,
                'date_placed' => $datePlaced,
                'expiry_date' => $expiry,
                'status' => $status,
            ]);

            $this->writeLog($request, $existing, [
                'quantity' => (float) $existing->stock - $prev,
                'previous_stock' => $prev,
                'reason' => 'Item restored / re-added',
                'action_label' => 'Supplier Delivery',
                'notes' => 'Stock item restored from soft-deleted inventory.',
                'log_type' => 'Restocked',
            ]);

            $service->syncMenusUsingInventory($existing->id);

            return response()->json(['data' => $this->transform($existing->fresh())], 201);
        }

        $item = InventoryItem::query()->create([
            'name' => $data['name'],
            'category' => $data['category'],
            'subcategory' => $data['subcategory'] ?? null,
            'subcategory_detail' => $data['subcategory_detail'] ?? null,
            'stock' => $data['stock'],
            'unit' => $data['unit'],
            'reorder_level' => $data['reorder_level'],
            'batch_no' => $batch,
            'date_placed' => $datePlaced,
            'expiry_date' => $expiry,
            'status' => $status,
        ]);

        $this->writeLog($request, $item, [
            'quantity' => (float) $item->stock,
            'previous_stock' => 0,
            'reason' => 'Initial inventory setup',
            'action_label' => 'Initial Stock',
            'notes' => 'Initial stock added during inventory setup.',
            'log_type' => 'Added',
        ]);

        $service->syncMenuAvailability();

        return response()->json(['data' => $this->transform($item)], 201);
    }

    public function update(Request $request, InventoryItem $inventory)
    {
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string'],
            'category' => ['sometimes', 'required', 'string'],
            'subcategory' => ['nullable', 'string'],
            'subcategory_detail' => ['nullable', 'string'],
            'stock' => ['sometimes', 'required', 'numeric', 'min:0'],
            'unit' => ['sometimes', 'required', 'string'],
            'reorder_level' => ['sometimes', 'required', 'numeric', 'min:0'],
            'date_placed' => ['nullable', 'date'],
            'expiry_date' => ['nullable', 'date'],
            'batch_no' => ['nullable', 'string'],
        ]);

        $prevStock = (float) $inventory->stock;
        $stock = array_key_exists('stock', $data) ? (float) $data['stock'] : $prevStock;
        $reorder = array_key_exists('reorder_level', $data)
            ? (float) $data['reorder_level']
            : (float) $inventory->reorder_level;
        $expiry = array_key_exists('expiry_date', $data)
            ? ($data['expiry_date'] ? Carbon::parse($data['expiry_date']) : null)
            : $inventory->expiry_date;

        if (array_key_exists('date_placed', $data)) {
            $data['date_placed'] = $data['date_placed']
                ? Carbon::parse($data['date_placed'])->startOfDay()
                : null;
        }
        if (array_key_exists('expiry_date', $data)) {
            $data['expiry_date'] = $expiry;
        }

        $inventory->update([
            ...$data,
            'status' => InventoryItem::deriveStatus($stock, $reorder, $expiry),
        ]);

        $this->writeLog($request, $inventory->fresh(), [
            'quantity' => $stock - $prevStock,
            'previous_stock' => $prevStock,
            'reason' => 'Manual stock adjustment',
            'action_label' => 'Inventory Count',
            'notes' => 'Stock updated via edit stock form.',
            'log_type' => 'Updated',
        ]);

        app(InventoryDeductionService::class)->syncMenusUsingInventory($inventory->id);

        return response()->json(['data' => $this->transform($inventory->fresh())]);
    }

    public function restock(Request $request, InventoryItem $inventory)
    {
        $data = $request->validate([
            'quantity' => ['required', 'numeric', 'gt:0'],
            'date_placed' => ['nullable', 'date'],
            'expiry_date' => ['nullable', 'date'],
        ]);

        $prevStock = (float) $inventory->stock;
        $qty = (float) $data['quantity'];
        $newStock = $prevStock + $qty;

        $updates = [
            'stock' => $newStock,
        ];
        if (! empty($data['date_placed'])) {
            $updates['date_placed'] = Carbon::parse($data['date_placed'])->startOfDay();
            $updates['batch_no'] = InventoryItem::makeBatchNo($inventory->name, $updates['date_placed']);
        }
        if (array_key_exists('expiry_date', $data)) {
            $updates['expiry_date'] = $data['expiry_date']
                ? Carbon::parse($data['expiry_date'])->startOfDay()
                : null;
        }

        $expiry = $updates['expiry_date'] ?? $inventory->expiry_date;
        $updates['status'] = InventoryItem::deriveStatus(
            $newStock,
            (float) $inventory->reorder_level,
            $expiry
        );

        $inventory->update($updates);

        $this->writeLog($request, $inventory->fresh(), [
            'quantity' => $qty,
            'previous_stock' => $prevStock,
            'reason' => 'Manual restock',
            'action_label' => 'Supplier Delivery',
            'notes' => 'Stock increased via restock action.',
            'log_type' => 'Restocked',
        ]);

        app(InventoryDeductionService::class)->syncMenusUsingInventory($inventory->id);

        return response()->json(['data' => $this->transform($inventory->fresh())]);
    }

    public function destroy(Request $request, InventoryItem $inventory)
    {
        $menuItemIds = MenuItemIngredient::query()
            ->where('inventory_item_id', $inventory->id)
            ->pluck('menu_item_id');

        $this->writeLog($request, $inventory, [
            'quantity' => -(float) $inventory->stock,
            'previous_stock' => (float) $inventory->stock,
            'reason' => 'Item removed from inventory',
            'action_label' => 'Removed',
            'notes' => 'Inventory item soft-deleted. Linked menu items disabled.',
            'log_type' => 'Removed',
            'stock_level' => '0 '.$inventory->unit,
            'status' => 'Out of Stock',
        ]);

        $inventory->delete();

        $service = app(InventoryDeductionService::class);
        $service->disableMenuItems($menuItemIds);
        $service->syncMenusUsingInventory($inventory->id);

        return response()->json(['message' => 'Deleted']);
    }

    public function logs(Request $request)
    {
        $query = InventoryLog::query()->with('user')->latest();

        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(function ($q) use ($search) {
                $q->where('item_name', 'like', "%{$search}%")
                    ->orWhere('batch_no', 'like', "%{$search}%")
                    ->orWhere('reason', 'like', "%{$search}%")
                    ->orWhere('category', 'like', "%{$search}%");
            });
        }

        if ($category = $request->query('category')) {
            if ($category !== 'All Categories') {
                $query->where('category', $category);
            }
        }

        if ($activity = $request->query('activity')) {
            $typeMap = [
                'New Stock' => ['Added'],
                'Restocked' => ['Restocked'],
                'Stock Deducted' => ['Removed'],
                'Manual Adjustment' => ['Updated'],
                'Expired' => ['Expired'],
            ];
            if (isset($typeMap[$activity])) {
                $query->whereIn('log_type', $typeMap[$activity]);
            }
        }

        $range = $request->query('range', 'all');
        if ($range === 'today') {
            $query->whereDate('created_at', now()->toDateString());
        } elseif ($range === '7d') {
            $query->where('created_at', '>=', now()->subDays(7));
        } elseif ($range === '30d') {
            $query->where('created_at', '>=', now()->subDays(30));
        }

        $logs = $query->take(200)->get();
        $today = InventoryLog::query()->whereDate('created_at', now()->toDateString());

        return response()->json([
            'data' => $logs->map(fn (InventoryLog $log) => $log->transformForApi())->values(),
            'meta' => [
                'stats' => [
                    'restock' => (clone $today)->whereIn('log_type', ['Added', 'Restocked'])->count(),
                    'deductions' => (clone $today)->where('log_type', 'Removed')->count(),
                    'adjustments' => (clone $today)->where('log_type', 'Updated')->count(),
                    'expired' => (clone $today)->where('log_type', 'Expired')->count(),
                    'total_today' => (clone $today)->count(),
                ],
            ],
        ]);
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

    private function transform(InventoryItem $i): array
    {
        $daysLeft = $i->daysLeft();
        $status = InventoryItem::deriveStatus(
            (float) $i->stock,
            (float) $i->reorder_level,
            $i->expiry_date
        );

        return [
            'id' => $i->id,
            'name' => $i->name,
            'batch_no' => $i->batch_no,
            'category' => $i->category,
            'subcategory' => $i->subcategory,
            'subcategory_detail' => $i->subcategory_detail,
            'category_label' => collect([
                $i->category,
                $i->subcategory,
                $i->subcategory_detail,
            ])->filter()->implode(' › '),
            'stock' => (float) $i->stock,
            'unit' => $i->unit,
            'reorder' => (float) $i->reorder_level,
            'date_placed' => $i->date_placed?->format('M d, Y'),
            'date_placed_raw' => $i->date_placed?->format('Y-m-d'),
            'expiry_date' => $i->expiry_date?->format('M d, Y'),
            'expiry_date_raw' => $i->expiry_date?->format('Y-m-d'),
            'days_left' => $daysLeft,
            'updated' => $i->updated_at?->diffForHumans(),
            'status' => $status,
        ];
    }
}
