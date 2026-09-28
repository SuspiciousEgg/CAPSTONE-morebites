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
     * PROMPT 42 DIAGNOSTIC REPORT — Top Selling Items Trend Calculation:
     * 1. Does the calculation logic exist?
     *    - YES: `getTopSelling()` queries a current 30-day window (`now()->subDays(30)` to `now()`)
     *      and a previous 30-day window (`now()->subDays(60)` to `now()->subDays(30)`), and
     *      `formatItems()` computes `round((($units - $priorUnits) / $priorUnits) * 100)`.
     * 2. Why was every item resolving to "—"?
     *    - Direct inspection of the `orders` table confirmed all 15 existing orders were created
     *      between `2026-09-02` and `2026-09-24` (< 30 days of history). The previous 30-day window
     *      (`subDays(60)` to `subDays(30)`) legitimately returns 0 rows (`$priorUnitsMap = []`),
     *      causing `if (!$hasPrior || $priorUnits === 0)` to evaluate to true for every item and
     *      default to `'—'`.
     *    - Secondary query bug fixed: when `order_items.menu_item_id` is NULL (e.g., seeded row #2
     *      `"Halo-halo"` vs menu item `"Halo Halo"`, or sized names `"Item (Size)"`), strict
     *      `menu_items.name = order_items.name` failed to match. Normalized hyphen/case and
     *      size-suffix matching is now applied.
     * 3. Test / Placeholder Menu Items Check:
     *    - Confirmed `"Try kog add"` (`menu_items.id = 18`, category `Pasta`, created `2026-09-13`)
     *      and `"Petsa"` (`menu_items.id = 17`, archived) were manually inserted test rows in the
     *      live database (not in `DatabaseSeeder.php`). `"Try kog add"` had 3 units across 2 test
     *      orders, skewing the Top 5 ranking. Archived `"Try kog add"` in DB and excluded known
     *      test placeholder names from Top Selling rankings.
     *
     * @param int $limit
     * @return Collection
     */
    public function getTopSelling(int $limit = 10, ?Carbon $from = null, ?Carbon $to = null): Collection
    {
        $hasExplicitRange = $from !== null || $to !== null;
        $start = $from ? $from->copy()->startOfDay() : Carbon::now()->subDays(30);
        $end = $to ? $to->copy()->endOfDay() : Carbon::now();

        $dateExpr = Schema::hasColumn('orders', 'order_date')
            ? 'COALESCE(orders.order_date, orders.created_at)'
            : 'orders.created_at';

        $isMysql = DB::connection()->getDriverName() === 'mysql';
        $fallbackNameMatchSql = $isMysql
            ? "LOWER(REPLACE(menu_items.name, '-', ' ')) = LOWER(REPLACE(TRIM(SUBSTRING_INDEX(order_items.name, ' (', 1)), '-', ' '))"
            : "LOWER(REPLACE(menu_items.name, '-', ' ')) = LOWER(REPLACE(order_items.name, '-', ' '))";

        $excludedTestNames = ['try kog add', 'petsa'];

        // 1. Primary Query: Join order_items with orders and menu_items within target window
        $salesRows = OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->join('menu_items', function ($join) use ($fallbackNameMatchSql) {
                $join->on('menu_items.id', '=', 'order_items.menu_item_id')
                    ->orWhere(function ($q) use ($fallbackNameMatchSql) {
                        $q->whereNull('order_items.menu_item_id')
                            ->whereRaw($fallbackNameMatchSql);
                    });
            })
            ->where('menu_items.archived', false)
            ->whereRaw('LOWER(TRIM(menu_items.name)) NOT IN (?, ?)', $excludedTestNames)
            ->where('orders.status', '!=', 'Cancelled')
            ->whereRaw("{$dateExpr} >= ? AND {$dateExpr} <= ?", [$start, $end])
            ->select(
                'menu_items.id',
                DB::raw('SUM(order_items.qty) as units_sold')
            )
            ->groupBy('menu_items.id')
            ->orderByDesc('units_sold')
            ->get();

        $rangeDays = max(1, (int) $start->copy()->startOfDay()->diffInDays($end->copy()->startOfDay()) + 1);
        $priorStart = $hasExplicitRange
            ? $start->copy()->subDays($rangeDays)->startOfDay()
            : Carbon::now()->subDays(60);
        $priorEnd = $hasExplicitRange
            ? $start->copy()
            : Carbon::now()->subDays(30);

        // Previous window of equal length for period-over-period trend comparison
        $priorSalesRows = OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->join('menu_items', function ($join) use ($fallbackNameMatchSql) {
                $join->on('menu_items.id', '=', 'order_items.menu_item_id')
                    ->orWhere(function ($q) use ($fallbackNameMatchSql) {
                        $q->whereNull('order_items.menu_item_id')
                            ->whereRaw($fallbackNameMatchSql);
                    });
            })
            ->where('menu_items.archived', false)
            ->whereRaw('LOWER(TRIM(menu_items.name)) NOT IN (?, ?)', $excludedTestNames)
            ->where('orders.status', '!=', 'Cancelled')
            ->whereRaw("{$dateExpr} >= ? AND {$dateExpr} < ?", [$priorStart, $priorEnd])
            ->select(
                'menu_items.id',
                DB::raw('SUM(order_items.qty) as units_sold')
            )
            ->groupBy('menu_items.id')
            ->get();

        $priorUnitsMap = $priorSalesRows->pluck('units_sold', 'id')->all();

        // If any products have recorded sales within the window, return them ranked by units sold
        if ($salesRows->count() >= 1) {
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

        if ($hasExplicitRange) {
            return collect();
        }

        // 2. Fallback Tier 1: Return menu items where is_featured is true
        $featuredItems = MenuItem::query()
            ->with(['sizes', 'ingredients.inventoryItem'])
            ->where('archived', false)
            ->whereRaw('LOWER(TRIM(name)) NOT IN (?, ?)', $excludedTestNames)
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
            ->whereRaw('LOWER(TRIM(name)) NOT IN (?, ?)', $excludedTestNames)
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
            $trendPct = null;
            $trendDirection = 'none';

            if (! $hasPrior || $priorUnits === 0) {
                $change = 'No prior data';
            } else {
                $diff = $units - $priorUnits;
                $pct = (int) round(($diff / $priorUnits) * 100);
                $trendPct = $pct;
                if ($pct > 0) {
                    $change = '↑ '.$pct.'%';
                    $trendDirection = 'up';
                } elseif ($pct < 0) {
                    $change = '↓ '.abs($pct).'%';
                    $trendDirection = 'down';
                } else {
                    $change = '0%';
                    $trendDirection = 'flat';
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
                'prior_units' => $priorUnits,
                'trend_pct' => $trendPct,
                'trend_direction' => $trendDirection,
                'change' => $change,
            ];
        });
    }
}
