<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\MenuItem;
use App\Services\InventoryDeductionService;
use App\Support\Media;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class MenuController extends Controller
{
    public function index(Request $request)
    {
        $tab = $request->query('tab', 'active');
        $query = MenuItem::query()->with(['sizes', 'ingredients.inventoryItem'])->latest();

        if ($tab === 'archived') {
            $query->where('archived', true);
        } else {
            $query->where('archived', false);
        }

        if ($category = $request->query('category')) {
            if ($category !== 'All Categories') {
                $query->where('category', $category);
            }
        }
        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('category', 'like', "%{$search}%");
            });
        }

        $service = app(InventoryDeductionService::class);
        $service->syncMenuAvailability();

        $items = $query->get()->map(fn (MenuItem $m) => $this->transform($m, $service));

        return response()->json([
            'data' => $items,
            'meta' => [
                'active_count' => MenuItem::query()->where('archived', false)->count(),
                'archived_count' => MenuItem::query()->where('archived', true)->count(),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $this->normalizePayload($request);
        $data = $this->validated($request);
        $service = app(InventoryDeductionService::class);

        $item = DB::transaction(function () use ($request, $data) {
            $item = MenuItem::query()->create([
                'name' => $data['name'],
                'description' => $data['description'] ?? null,
                'category' => $data['category'],
                'image' => $this->resolveImage($request),
                'has_sizes' => $data['has_sizes'],
                'price' => $data['has_sizes'] ? 0 : ($data['price'] ?? 0),
                'available' => true,
                'archived' => false,
            ]);

            if ($data['has_sizes']) {
                foreach ($data['sizes'] ?? [] as $size) {
                    $item->sizes()->create([
                        'name' => $size['name'],
                        'price' => $size['price'],
                    ]);
                }
            }

            $this->syncIngredients($item, $data['ingredients'] ?? []);

            ActivityLog::query()->create([
                'actor' => 'Admin',
                'action' => 'Added menu item "'.$item->name.'"',
            ]);

            return $item->load(['sizes', 'ingredients.inventoryItem']);
        });

        $item->update(['available' => $service->canServe($item)]);

        return response()->json([
            'data' => $this->transform($item->fresh()->load(['sizes', 'ingredients.inventoryItem']), $service),
        ], 201);
    }

    public function update(Request $request, MenuItem $menu)
    {
        $this->normalizePayload($request);
        $data = $this->validated($request);
        $service = app(InventoryDeductionService::class);

        $item = DB::transaction(function () use ($request, $menu, $data) {
            $menu->update([
                'name' => $data['name'],
                'description' => $data['description'] ?? null,
                'category' => $data['category'],
                'image' => $this->resolveImage($request, $menu->image),
                'has_sizes' => $data['has_sizes'],
                'price' => $data['has_sizes'] ? 0 : ($data['price'] ?? 0),
            ]);

            $menu->sizes()->delete();
            if ($data['has_sizes']) {
                foreach ($data['sizes'] ?? [] as $size) {
                    $menu->sizes()->create([
                        'name' => $size['name'],
                        'price' => $size['price'],
                    ]);
                }
            }

            $this->syncIngredients($menu, $data['ingredients'] ?? []);

            return $menu->load(['sizes', 'ingredients.inventoryItem']);
        });

        if (! $item->archived) {
            $item->update(['available' => $service->canServe($item)]);
        }

        return response()->json([
            'data' => $this->transform($item->fresh()->load(['sizes', 'ingredients.inventoryItem']), $service),
        ]);
    }

    public function toggleAvailability(MenuItem $menu)
    {
        if ($menu->archived) {
            return response()->json(['message' => 'Archived items cannot be toggled'], 422);
        }
        $service = app(InventoryDeductionService::class);
        $canServe = $service->canServe($menu->load('ingredients.inventoryItem'));
        if (! $canServe) {
            $menu->update(['available' => false]);
            $reason = $service->unserviceableReason($menu);
            $message = $reason === 'expired'
                ? 'This item is disabled because one or more linked ingredients are expired.'
                : 'This item is disabled because ingredients are insufficient.';

            return response()->json([
                'message' => $message,
                'data' => $this->transform($menu->load(['sizes', 'ingredients.inventoryItem']), $service),
            ], 422);
        }

        $menu->update(['available' => ! $menu->available]);

        return response()->json(['data' => $this->transform($menu->load(['sizes', 'ingredients.inventoryItem']), $service)]);
    }

    public function archive(MenuItem $menu)
    {
        $menu->update(['archived' => true, 'available' => false]);

        return response()->json(['data' => $this->transform($menu->load(['sizes', 'ingredients.inventoryItem']))]);
    }

    public function restore(MenuItem $menu)
    {
        $service = app(InventoryDeductionService::class);
        $menu->update([
            'archived' => false,
            'available' => $service->canServe($menu->load('ingredients.inventoryItem')),
        ]);

        return response()->json(['data' => $this->transform($menu->load(['sizes', 'ingredients.inventoryItem']))]);
    }

    private function normalizePayload(Request $request): void
    {
        foreach (['ingredients', 'sizes'] as $key) {
            $value = $request->input($key);
            if (is_string($value)) {
                $decoded = json_decode($value, true);
                $request->merge([$key => is_array($decoded) ? $decoded : []]);
            }
        }

        if ($request->exists('has_sizes')) {
            $request->merge([
                'has_sizes' => filter_var($request->input('has_sizes'), FILTER_VALIDATE_BOOLEAN),
            ]);
        }
    }

    private function validated(Request $request): array
    {
        if ($request->hasFile('image')) {
            $request->validate([
                'image' => ['image', 'max:5120'],
            ]);
        }

        return $request->validate([
            'name' => ['required', 'string'],
            'description' => ['nullable', 'string'],
            'category' => ['required', 'string'],
            'has_sizes' => ['required', 'boolean'],
            'price' => ['nullable', 'numeric', 'min:0'],
            'sizes' => ['nullable', 'array'],
            'sizes.*.name' => ['required_with:sizes', 'string'],
            'sizes.*.price' => ['required_with:sizes', 'numeric', 'min:0'],
            'ingredients' => ['nullable', 'array'],
            'ingredients.*.inventory_item_id' => [
                'required',
                'integer',
                Rule::exists('inventory_items', 'id')->whereNull('deleted_at'),
            ],
            'ingredients.*.qty_per_serving' => ['required', 'numeric', 'gt:0'],
        ]);
    }

    private function resolveImage(Request $request, ?string $existing = null): ?string
    {
        if ($request->hasFile('image')) {
            $path = $request->file('image')->store('menu', 'public');

            return '/storage/'.$path;
        }

        $url = $request->input('image');
        if (! is_string($url) || $url === '' || str_starts_with($url, 'blob:')) {
            return $existing;
        }

        if (preg_match('#(/storage/.+)$#', $url, $m)) {
            return $m[1];
        }

        return $url;
    }

    /**
     * @param  array<int, array{inventory_item_id: int, qty_per_serving: float|int|string}>  $ingredients
     */
    private function syncIngredients(MenuItem $item, array $ingredients): void
    {
        $item->ingredients()->delete();

        $seen = [];
        foreach ($ingredients as $row) {
            $inventoryId = (int) $row['inventory_item_id'];
            if (isset($seen[$inventoryId])) {
                continue;
            }
            $seen[$inventoryId] = true;

            $item->ingredients()->create([
                'inventory_item_id' => $inventoryId,
                'qty_per_serving' => $row['qty_per_serving'],
            ]);
        }
    }

    private function transform(MenuItem $m, ?InventoryDeductionService $service = null): array
    {
        $service ??= app(InventoryDeductionService::class);
        $m->loadMissing([
            'sizes',
            'ingredients' => fn ($q) => $q->with(['inventoryItem' => fn ($q) => $q->withTrashed()]),
        ]);
        $stockOk = $service->canServe($m);
        $stockReason = $service->unserviceableReason($m);

        return [
            'id' => $m->id,
            'name' => $m->name,
            'description' => $m->description,
            'category' => $m->category,
            'image' => Media::url($m->image),
            'hasSizes' => $m->has_sizes,
            'sizes' => $m->sizes->map(fn ($s) => [
                'name' => $s->name,
                'price' => (float) $s->price,
            ])->values(),
            'ingredients' => $m->ingredients->map(function ($ing) {
                $inv = $ing->inventoryItem;

                return [
                    'inventory_item_id' => $ing->inventory_item_id,
                    'qty_per_serving' => (float) $ing->qty_per_serving,
                    'name' => $inv?->name,
                    'unit' => $inv?->unit,
                    'stock' => ($inv && ! $inv->trashed()) ? (float) $inv->stock : 0.0,
                ];
            })->values(),
            'price' => (float) $m->price,
            'available' => (bool) $m->available && $stockOk,
            'stockOk' => $stockOk,
            'stockReason' => $stockReason,
            'archived' => $m->archived,
        ];
    }
}
