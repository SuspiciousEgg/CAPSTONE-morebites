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
use Illuminate\Validation\ValidationException;

class MenuController extends Controller
{
    public function index(Request $request)
    {
        $tab = $request->query('tab', 'active');
        $query = MenuItem::query()->with(['sizes', 'ingredients.inventoryItem'])->latest();

        if ($tab === 'archived') {
            $query->where('archived', true);
        } elseif ($tab !== 'all') {
            $query->where('archived', false);
        }

        if ($category = $request->query('category')) {
            if ($category !== 'All Categories') {
                $query->where('category', $category);
            }
        }
        if ($subcategory = $request->query('subcategory')) {
            if ($subcategory !== 'All Subcategories') {
                $query->where('subcategory', $subcategory);
            }
        }
        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('category', 'like', "%{$search}%")
                    ->orWhere('subcategory', 'like', "%{$search}%");
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
                'subcategory' => !empty($data['subcategory']) ? trim($data['subcategory']) : null,
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

            $this->syncIngredients($item, $data);

            ActivityLog::query()->create([
                'actor' => 'Admin',
                'action' => 'Added menu item "'.$item->name.'"',
            ]);

            return $item->fresh()->load([
                'sizes',
                'ingredients' => fn ($q) => $q->with(['inventoryItem' => fn ($q) => $q->withTrashed()]),
            ]);
        });

        $item->update(['available' => $service->canServe($item)]);

        $fresh = $item->fresh()->load([
            'sizes',
            'ingredients' => fn ($q) => $q->with(['inventoryItem' => fn ($q) => $q->withTrashed()]),
        ]);

        return response()->json([
            'data' => $this->transform($fresh, $service),
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
                'subcategory' => !empty($data['subcategory']) ? trim($data['subcategory']) : null,
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

            $this->syncIngredients($menu, $data);

            return $menu->fresh()->load([
                'sizes',
                'ingredients' => fn ($q) => $q->with(['inventoryItem' => fn ($q) => $q->withTrashed()]),
            ]);
        });

        if (! $item->archived) {
            $item->update(['available' => $service->canServe($item)]);
        }

        $fresh = $item->fresh()->load([
            'sizes',
            'ingredients' => fn ($q) => $q->with(['inventoryItem' => fn ($q) => $q->withTrashed()]),
        ]);

        return response()->json([
            'data' => $this->transform($fresh, $service),
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

        $sizes = $request->input('sizes');
        if (is_array($sizes)) {
            $normalizedSizes = [];
            foreach ($sizes as $size) {
                if (! is_array($size)) {
                    continue;
                }
                $sizeIng = $size['ingredients'] ?? [];
                if (is_string($sizeIng)) {
                    $decodedIng = json_decode($sizeIng, true);
                    $sizeIng = is_array($decodedIng) ? $decodedIng : [];
                }
                if (is_array($sizeIng)) {
                    $size['ingredients'] = collect($sizeIng)
                        ->filter(fn ($row) => is_array($row) && ! empty($row['inventory_item_id']))
                        ->map(fn ($row) => [
                            'inventory_item_id' => (int) $row['inventory_item_id'],
                            'qty_per_serving' => isset($row['qty_per_serving']) && $row['qty_per_serving'] !== '' && (float) $row['qty_per_serving'] > 0
                                ? (float) $row['qty_per_serving']
                                : 1.0,
                        ])
                        ->values()
                        ->all();
                } else {
                    $size['ingredients'] = [];
                }
                $normalizedSizes[] = $size;
            }
            $request->merge(['sizes' => $normalizedSizes]);
        }

        if (is_array($request->input('ingredients'))) {
            $normalizedIngredients = collect($request->input('ingredients'))
                ->filter(fn ($row) => is_array($row) && ! empty($row['inventory_item_id']))
                ->map(fn ($row) => [
                    'menu_item_size_id' => ! empty($row['menu_item_size_id']) ? (int) $row['menu_item_size_id'] : null,
                    'size_name' => ! empty($row['size_name']) ? (string) $row['size_name'] : null,
                    'inventory_item_id' => (int) $row['inventory_item_id'],
                    'qty_per_serving' => isset($row['qty_per_serving']) && $row['qty_per_serving'] !== '' && (float) $row['qty_per_serving'] > 0
                        ? (float) $row['qty_per_serving']
                        : 1.0,
                ])
                ->values()
                ->all();
            $request->merge(['ingredients' => $normalizedIngredients]);
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

        $validated = $request->validate([
            'name' => ['required', 'string'],
            'description' => ['nullable', 'string'],
            'category' => ['required', 'string'],
            'subcategory' => ['nullable', 'string'],
            'has_sizes' => ['required', 'boolean'],
            'price' => ['nullable', 'numeric', 'min:0'],
            'sizes' => ['nullable', 'array'],
            'sizes.*.name' => ['required_with:sizes', 'string'],
            'sizes.*.price' => ['required_with:sizes', 'numeric', 'min:0'],
            'sizes.*.ingredients' => ['nullable', 'array'],
            'sizes.*.ingredients.*.inventory_item_id' => [
                'required',
                'integer',
                Rule::exists('inventory_items', 'id')->whereNull('deleted_at'),
            ],
            'sizes.*.ingredients.*.qty_per_serving' => ['nullable', 'numeric', 'gt:0'],
            'ingredients' => ['nullable', 'array'],
            'ingredients.*.menu_item_size_id' => ['nullable', 'integer'],
            'ingredients.*.size_name' => ['nullable', 'string'],
            'ingredients.*.inventory_item_id' => [
                'required',
                'integer',
                Rule::exists('inventory_items', 'id')->whereNull('deleted_at'),
            ],
            'ingredients.*.qty_per_serving' => ['nullable', 'numeric', 'gt:0'],
        ]);

        if (!empty($validated['has_sizes']) && !empty($validated['sizes'])) {
            $names = array_map(fn ($s) => strtolower(trim((string) ($s['name'] ?? ''))), $validated['sizes']);
            if (count($names) !== count(array_unique($names))) {
                throw ValidationException::withMessages([
                    'sizes' => ['Each size option must have a unique name.'],
                ]);
            }

            $prices = array_map(fn ($s) => (string) (float) ($s['price'] ?? 0), $validated['sizes']);
            if (count($prices) !== count(array_unique($prices))) {
                throw ValidationException::withMessages([
                    'sizes' => ['Each size option must have a unique price.'],
                ]);
            }
        }

        return $validated;
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
     * @param  array<string, mixed>  $data
     */
    private function syncIngredients(MenuItem $item, array $data): void
    {
        $item->ingredients()->delete();

        if ($item->has_sizes) {
            $sizes = $data['sizes'] ?? [];
            $hasNested = collect($sizes)->contains(fn ($s) => ! empty($s['ingredients']));

            if ($hasNested) {
                $persistedSizes = $item->sizes()->get();
                foreach ($sizes as $sData) {
                    $sizeName = trim($sData['name'] ?? '');
                    $matchingSize = $persistedSizes->first(
                        fn ($ps) => strcasecmp(trim($ps->name), $sizeName) === 0
                    );
                    if (! $matchingSize) {
                        continue;
                    }

                    $seen = [];
                    foreach ($sData['ingredients'] ?? [] as $row) {
                        if (empty($row['inventory_item_id'])) {
                            continue;
                        }
                        $inventoryId = (int) $row['inventory_item_id'];
                        if (isset($seen[$inventoryId])) {
                            continue;
                        }
                        $seen[$inventoryId] = true;

                        $qty = isset($row['qty_per_serving']) && (float) $row['qty_per_serving'] > 0
                            ? (float) $row['qty_per_serving']
                            : 1.0;

                        $item->ingredients()->create([
                            'menu_item_size_id' => $matchingSize->id,
                            'inventory_item_id' => $inventoryId,
                            'qty_per_serving' => $qty,
                        ]);
                    }
                }

                return;
            }

            $topIngredients = $data['ingredients'] ?? [];
            if (! empty($topIngredients)) {
                $persistedSizes = $item->sizes()->get();
                $seen = [];
                foreach ($topIngredients as $row) {
                    if (empty($row['inventory_item_id'])) {
                        continue;
                    }
                    $sizeId = $row['menu_item_size_id'] ?? null;
                    if (! $sizeId && ! empty($row['size_name'])) {
                        $sizeObj = $persistedSizes->first(
                            fn ($ps) => strcasecmp(trim($ps->name), trim($row['size_name'])) === 0
                        );
                        $sizeId = $sizeObj?->id;
                    }

                    $key = ($sizeId ?? 'base') . '-' . $row['inventory_item_id'];
                    if (isset($seen[$key])) {
                        continue;
                    }
                    $seen[$key] = true;

                    $qty = isset($row['qty_per_serving']) && (float) $row['qty_per_serving'] > 0
                        ? (float) $row['qty_per_serving']
                        : 1.0;

                    $item->ingredients()->create([
                        'menu_item_size_id' => $sizeId,
                        'inventory_item_id' => (int) $row['inventory_item_id'],
                        'qty_per_serving' => $qty,
                    ]);
                }

                return;
            }
        }

        $seen = [];
        foreach ($data['ingredients'] ?? [] as $row) {
            if (empty($row['inventory_item_id'])) {
                continue;
            }
            $inventoryId = (int) $row['inventory_item_id'];
            if (isset($seen[$inventoryId])) {
                continue;
            }
            $seen[$inventoryId] = true;

            $qty = isset($row['qty_per_serving']) && (float) $row['qty_per_serving'] > 0
                ? (float) $row['qty_per_serving']
                : 1.0;

            $item->ingredients()->create([
                'menu_item_size_id' => null,
                'inventory_item_id' => $inventoryId,
                'qty_per_serving' => $qty,
            ]);
        }
    }

    private function transform(MenuItem $m, ?InventoryDeductionService $service = null): array
    {
        $service ??= app(InventoryDeductionService::class);
        $m->loadMissing([
            'sizes.ingredients.inventoryItem' => fn ($q) => $q->withTrashed(),
            'ingredients' => fn ($q) => $q->with(['inventoryItem' => fn ($q) => $q->withTrashed(), 'menuItemSize']),
        ]);
        $stockOk = $service->canServe($m);
        $stockReason = $service->unserviceableReason($m);

        return [
            'id' => $m->id,
            'name' => $m->name,
            'description' => $m->description,
            'category' => $m->category,
            'subcategory' => $m->subcategory,
            'category_label' => $m->subcategory ? "{$m->category} › {$m->subcategory}" : $m->category,
            'image' => Media::url($m->image),
            'hasSizes' => $m->has_sizes,
            'sizes' => $m->sizes->map(fn ($s) => [
                'id' => $s->id,
                'name' => $s->name,
                'price' => (float) $s->price,
                'ingredients' => $s->ingredients->map(function ($ing) {
                    $inv = $ing->inventoryItem;

                    return [
                        'id' => $ing->id,
                        'menu_item_size_id' => $ing->menu_item_size_id,
                        'inventory_item_id' => $ing->inventory_item_id,
                        'qty_per_serving' => (float) $ing->qty_per_serving,
                        'name' => $inv?->name,
                        'unit' => $inv?->unit,
                        'stock' => ($inv && ! $inv->trashed()) ? (float) $inv->stock : 0.0,
                    ];
                })->values(),
            ])->values(),
            'ingredients' => $m->ingredients->map(function ($ing) {
                $inv = $ing->inventoryItem;

                return [
                    'id' => $ing->id,
                    'menu_item_size_id' => $ing->menu_item_size_id,
                    'size_name' => $ing->menuItemSize?->name,
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
