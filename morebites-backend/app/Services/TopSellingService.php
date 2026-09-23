<?php

namespace App\Services;

use App\Models\MenuItem;
use App\Models\OrderItem;
use App\Support\Media;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class TopSellingService
{
    public function __construct(
        protected InventoryDeductionService $inventoryService
    ) {}

    /**
     * Get top-selling menu items based on a rolling 30-day window with 2-tier fallback.
     *
     * @param int $limit
     * @return Collection
     */
    public function getTopSelling(int $limit = 10): Collection
    {
        $since = Carbon::now()->subDays(30);

        $dateExpr = Schema::hasColumn('orders', 'order_date')
            ? 'COALESCE(orders.order_date, orders.created_at)'
            : 'orders.created_at';

        // 1. Primary Query: Join order_items with orders and menu_items
        $salesRows = OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->join('menu_items', function ($join) {
                $join->on('menu_items.id', '=', 'order_items.menu_item_id')
                    ->orWhere(function ($q) {
                        $q->whereNull('order_items.menu_item_id')
                            ->whereColumn('menu_items.name', 'order_items.name');
                    });
            })
            ->where('menu_items.archived', false)
            ->where('orders.status', '!=', 'Cancelled')
            ->whereRaw("{$dateExpr} >= ?", [$since])
            ->select(
                'menu_items.id',
                DB::raw('SUM(order_items.qty) as units_sold')
            )
            ->groupBy('menu_items.id')
            ->orderByDesc('units_sold')
            ->get();

        $priorStart = Carbon::now()->subDays(60);
        $priorEnd = Carbon::now()->subDays(30);

        $priorSalesRows = OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->join('menu_items', function ($join) {
                $join->on('menu_items.id', '=', 'order_items.menu_item_id')
                    ->orWhere(function ($q) {
                        $q->whereNull('order_items.menu_item_id')
                            ->whereColumn('menu_items.name', 'order_items.name');
                    });
            })
            ->where('menu_items.archived', false)
            ->where('orders.status', '!=', 'Cancelled')
            ->whereRaw("{$dateExpr} >= ? AND {$dateExpr} < ?", [$priorStart, $priorEnd])
            ->select(
                'menu_items.id',
                DB::raw('SUM(order_items.qty) as units_sold')
            )
            ->groupBy('menu_items.id')
            ->get();

        $priorUnitsMap = $priorSalesRows->pluck('units_sold', 'id')->all();

        // If at least 3 distinct products have recorded sales within the 30-day window
        if ($salesRows->count() >= 3) {
            $unitsMap = $salesRows->pluck('units_sold', 'id')->all();
            $itemIds = $salesRows->pluck('id')->take($limit)->all();

            $items = MenuItem::query()
                ->with(['sizes', 'ingredients.inventoryItem'])
                ->whereIn('id', $itemIds)
                ->get()
                ->sortBy(fn ($m) => array_search($m->id, $itemIds))
                ->values();

            return $this->formatItems($items, $unitsMap, $priorUnitsMap);
        }

        // 2. Fallback Tier 1: Return menu items where is_featured is true
        $featuredItems = MenuItem::query()
            ->with(['sizes', 'ingredients.inventoryItem'])
            ->where('archived', false)
            ->where('is_featured', true)
            ->take($limit)
            ->get();

        if ($featuredItems->count() > 0) {
            return $this->formatItems($featuredItems, [], $priorUnitsMap);
        }

        // 3. Fallback Tier 2: Return most recently created active menu items, newest first
        $newestItems = MenuItem::query()
            ->with(['sizes', 'ingredients.inventoryItem'])
            ->where('archived', false)
            ->where('available', true)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->take($limit)
            ->get();

        return $this->formatItems($newestItems, [], $priorUnitsMap);
    }

    /**
     * Format menu items into standard consumer payload.
     */
    private function formatItems(Collection $items, array $unitsMap = [], array $priorUnitsMap = []): Collection
    {
        $itemIds = $items->pluck('id')->filter()->all();

        $ratingStats = DB::table('orders')
            ->join('order_items', 'orders.id', '=', 'order_items.order_id')
            ->whereNotNull('orders.food_rating')
            ->whereIn('order_items.menu_item_id', $itemIds)
            ->select(
                'order_items.menu_item_id',
                DB::raw('ROUND(AVG(orders.food_rating), 1) as avg_rating'),
                DB::raw('COUNT(DISTINCT orders.id) as review_count')
            )
            ->groupBy('order_items.menu_item_id')
            ->get()
            ->keyBy('menu_item_id');

        return $items->map(function (MenuItem $m) use ($unitsMap, $priorUnitsMap, $ratingStats) {
            $stockOk = $this->inventoryService->canServe($m);
            $stockReason = $stockOk ? '' : $this->inventoryService->outOfStockReason($m);
            $isAvailable = (bool) $m->available && ! (bool) $m->archived && $stockOk;

            $sizes = $m->sizes->map(fn ($s) => [
                'id' => (string) $s->id,
                'sizeName' => $s->name,
                'name' => $s->name,
                'price' => (float) $s->price,
            ])->values();

            $min = $sizes->min('price');
            $max = $sizes->max('price');
            $priceLabel = $m->has_sizes && $sizes->count()
                ? '₱'.number_format((float) $min, 0).' - ₱'.number_format((float) $max, 0)
                : '₱'.number_format((float) $m->price, 0);

            $stat = $ratingStats->get($m->id);
            $rating = $stat ? (float) $stat->avg_rating : null;
            $reviewCount = $stat ? (int) $stat->review_count : 0;
            $units = isset($unitsMap[$m->id]) ? (int) $unitsMap[$m->id] : 0;

            $hasPrior = array_key_exists($m->id, $priorUnitsMap) && $priorUnitsMap[$m->id] !== null;
            $priorUnits = $hasPrior ? (int) $priorUnitsMap[$m->id] : 0;

            if (! $hasPrior || $priorUnits === 0) {
                $change = '—';
            } else {
                $diff = $units - $priorUnits;
                $pct = (int) round(($diff / $priorUnits) * 100);
                if ($pct > 0) {
                    $change = '↑ '.$pct.'%';
                } elseif ($pct < 0) {
                    $change = '↓ '.abs($pct).'%';
                } else {
                    $change = '0%';
                }
            }

            return [
                'id' => (string) $m->id,
                'product_id' => $m->id,
                'db_id' => $m->id,
                'name' => $m->name,
                'price' => (float) ($m->has_sizes && $min ? $min : $m->price),
                'image' => Media::url($m->image),
                'category' => $m->category,
                'description' => $m->description,
                'priceLabel' => $priceLabel,
                'hasSizes' => (bool) $m->has_sizes,
                'sizes' => $sizes,
                'available' => $isAvailable,
                'availability' => $isAvailable,
                'stockOk' => $stockOk,
                'stockReason' => $stockReason,
                'rating' => $rating,
                'reviewCount' => $reviewCount,
                'reviews' => $reviewCount,
                'promoActive' => (bool) $m->promo_active,
                'promoDiscountPercent' => $m->promo_active ? (float) ($m->promo_discount_percent ?? 0) : null,
                'promoLabel' => $m->promo_active ? ($m->promo_label ?: 'Limited deal') : null,
                'units' => $units,
                'units_sold' => $units,
                'change' => $change,
            ];
        });
    }
}
