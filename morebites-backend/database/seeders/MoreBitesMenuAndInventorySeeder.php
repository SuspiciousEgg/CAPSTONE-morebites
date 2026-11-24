<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\InventoryBatch;
use App\Models\InventoryItem;
use App\Models\InventoryLog;
use App\Models\MenuItem;
use App\Models\MenuItemIngredient;
use App\Models\MenuItemSize;
use App\Services\InventoryDeductionService;
use App\Support\UnitConverter;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Rebuilds MoreBites Inventory & Menu from:
 *  - Main Branch Menu Board (Premium Pizza 7 flavors x 5 sizes, Pizzadilla 6 flavors,
 *    Thin-Crust Pizza 5 flavors, Quesadilla 6 flavors, Rice Meals & Chicken Wings/Tenders 8 items)
 *  - Creamy Special Halo-Halo Board (18 flavors)
 *  - Classic Beverages (Coke 1.5L, Sprite 1.5L)
 *  - Standardized Kitchen Recipe & Ingredient Measurement Guide PDF, mapped to no-scale
 *    Kitchen Portion Tools (scoop, cup, ladle, slice, portion, pcs, bottle).
 */
class MoreBitesMenuAndInventorySeeder extends Seeder
{
    public bool $wipeOrdersAndLogs = false;

    public function run(): void
    {
        $this->resetTables();

        $inv = $this->seedInventoryItems();
        $this->seedMenuItems($inv);

        app(InventoryDeductionService::class)->syncMenuAvailability();
    }

    private function resetTables(): void
    {
        Schema::disableForeignKeyConstraints();

        try {
            $tables = [
                'inventory_dispositions',
                'inventory_logs',
                'inventory_batches',
                'menu_item_ingredients',
                'menu_item_sizes',
                'menu_items',
                'inventory_items',
            ];

            if ($this->wipeOrdersAndLogs) {
                $tables = array_merge([
                    'order_inventory_deductions',
                    'order_items',
                    'orders',
                    'order_sequences',
                    'loyalty_ledger',
                    'exported_reports',
                    'gas_expenses',
                    'activity_logs',
                    'notification_reads',
                    'notifications',
                ], $tables);
            }

            foreach ($tables as $table) {
                if (Schema::hasTable($table)) {
                    DB::table($table)->truncate();
                }
            }

            if ($this->wipeOrdersAndLogs && Schema::hasTable('customers') && Schema::hasColumn('customers', 'loyalty_points')) {
                $resetCols = ['loyalty_points' => 0];
                if (Schema::hasColumn('customers', 'points_expire_at')) {
                    $resetCols['points_expire_at'] = null;
                }
                Customer::query()->update($resetCols);
            }
        } finally {
            Schema::enableForeignKeyConstraints();
        }
    }

    /**
     * @return array<string, InventoryItem>
     */
    private function seedInventoryItems(): array
    {
        $definitions = [
            // === PIZZA & QUESADILLA BASES ===
            'pizza_dough' => [
                'name' => 'Pizza Dough',
                'category' => 'Raw Materials',
                'subcategory' => 'Flour & Bases',
                'stock' => 25,
                'unit' => 'kg',
                'portion_unit' => 'portion',
                'portions_per_unit' => 5.5, // ~180g Medium 9" dough ball per portion
                'reorder_level' => 5,
                'price' => 75.00,
                'days_until_expiry' => 14,
            ],
            'pizzadilla_base' => [
                'name' => 'Pizzadilla Tortilla Base',
                'category' => 'Raw Materials',
                'subcategory' => 'Flour & Bases',
                'stock' => 12,
                'unit' => 'pack',
                'portion_unit' => 'pcs',
                'portions_per_unit' => 10, // 10 x 9" tortillas/pack; 2 pcs (~130g) per Pizzadilla/Quesadilla
                'reorder_level' => 3,
                'price' => 180.00,
                'days_until_expiry' => 30,
            ],
            'thin_crust_base' => [
                'name' => 'Thin-Crust Dough Base',
                'category' => 'Raw Materials',
                'subcategory' => 'Flour & Bases',
                'stock' => 10,
                'unit' => 'pack',
                'portion_unit' => 'pcs',
                'portions_per_unit' => 10, // 10 thin-pressed 9" crusts per pack
                'reorder_level' => 3,
                'price' => 160.00,
                'days_until_expiry' => 21,
            ],

            // === PIZZA SAUCES, MEATS, VEGETABLES & CHEESES (PDF-CALIBRATED PORTION TOOLS) ===
            'pizza_sauce' => [
                'name' => 'Pizza Sauce',
                'category' => 'Ingredients',
                'subcategory' => 'Sauces & Condiments',
                'stock' => 15,
                'unit' => 'L',
                'portion_unit' => 'ladle',
                'portions_per_unit' => 20, // 1 ladle ≈ 50g sauce
                'reorder_level' => 3,
                'price' => 160.00,
                'days_until_expiry' => 45,
            ],
            'ground_beef' => [
                'name' => 'Ground Beef (Cooked)',
                'category' => 'Meat',
                'subcategory' => 'Beef',
                'stock' => 12,
                'unit' => 'kg',
                'portion_unit' => 'scoop',
                'portions_per_unit' => 20, // 1 scoop ≈ 50g cooked, drained ground beef
                'reorder_level' => 3,
                'price' => 480.00,
                'days_until_expiry' => 14,
            ],
            'chicken_ham' => [
                'name' => 'Chicken Ham',
                'category' => 'Meat',
                'subcategory' => 'Processed Meat',
                'stock' => 10,
                'unit' => 'pack',
                'portion_unit' => 'scoop',
                'portions_per_unit' => 20, // 1 kg pack; 1 scoop ≈ 50g diced ready-to-top
                'reorder_level' => 2,
                'price' => 280.00,
                'days_until_expiry' => 21,
            ],
            'beef_pepperoni' => [
                'name' => 'Beef Pepperoni',
                'category' => 'Meat',
                'subcategory' => 'Beef',
                'stock' => 12,
                'unit' => 'pack',
                'portion_unit' => 'slice',
                'portions_per_unit' => 165, // 500g pack; ~3g per slice (PDF p.11 standard)
                'reorder_level' => 3,
                'price' => 250.00,
                'days_until_expiry' => 30,
            ],
            'mushrooms' => [
                'name' => 'Sliced Mushrooms',
                'category' => 'Ingredients',
                'subcategory' => 'Vegetables',
                'stock' => 18,
                'unit' => 'can',
                'portion_unit' => 'scoop',
                'portions_per_unit' => 16, // 400g drained can; 1 scoop ≈ 25g drained sliced mushrooms
                'reorder_level' => 4,
                'price' => 96.00,
                'days_until_expiry' => 90,
            ],
            'pineapple' => [
                'name' => 'Pineapple Tidbits',
                'category' => 'Ingredients',
                'subcategory' => 'Vegetables',
                'stock' => 16,
                'unit' => 'can',
                'portion_unit' => 'scoop',
                'portions_per_unit' => 20, // 500g drained can; 1 scoop ≈ 25g drained tidbits
                'reorder_level' => 4,
                'price' => 100.00,
                'days_until_expiry' => 90,
            ],
            'kernel_corn' => [
                'name' => 'Kernel Corn',
                'category' => 'Ingredients',
                'subcategory' => 'Vegetables',
                'stock' => 16,
                'unit' => 'can',
                'portion_unit' => 'scoop',
                'portions_per_unit' => 12, // 300g drained can; 1 scoop ≈ 25g drained corn
                'reorder_level' => 4,
                'price' => 60.00,
                'days_until_expiry' => 90,
            ],
            'quickmelt_cheese' => [
                'name' => 'Quickmelt Cheese',
                'category' => 'Ingredients',
                'subcategory' => 'Dairy',
                'stock' => 15,
                'unit' => 'pack',
                'portion_unit' => 'cup',
                'portions_per_unit' => 12.5, // 1 kg pack; 1 cup ≈ 80g shredded
                'reorder_level' => 3,
                'price' => 360.00,
                'days_until_expiry' => 30,
            ],
            'mozzarella_cheese' => [
                'name' => 'Mozzarella Cheese',
                'category' => 'Ingredients',
                'subcategory' => 'Dairy',
                'stock' => 15,
                'unit' => 'pack',
                'portion_unit' => 'cup',
                'portions_per_unit' => 16, // 1 kg pack; 1 cup ≈ 60g shredded
                'reorder_level' => 3,
                'price' => 450.00,
                'days_until_expiry' => 30,
            ],

            // === CHICKEN WINGS, TENDERS & SIDES ===
            'chicken_wings' => [
                'name' => 'Chicken Wings',
                'category' => 'Meat',
                'subcategory' => 'Chicken',
                'subcategory_detail' => 'Wings',
                'stock' => 15,
                'unit' => 'pack',
                'portion_unit' => 'pcs',
                'portions_per_unit' => 24, // 24 pcs per pack
                'reorder_level' => 3,
                'price' => 360.00,
                'days_until_expiry' => 21,
            ],
            'chicken_tenders' => [
                'name' => 'Boneless Chicken Tenders',
                'category' => 'Meat',
                'subcategory' => 'Chicken',
                'subcategory_detail' => 'Breast',
                'stock' => 12,
                'unit' => 'pack',
                'portion_unit' => 'pcs',
                'portions_per_unit' => 24, // 24 tenders per pack
                'reorder_level' => 3,
                'price' => 384.00,
                'days_until_expiry' => 21,
            ],
            'wing_glaze' => [
                'name' => 'Wing Glaze & Flavor Sauce',
                'category' => 'Ingredients',
                'subcategory' => 'Sauces & Condiments',
                'stock' => 10,
                'unit' => 'bottle',
                'portion_unit' => 'ladle',
                'portions_per_unit' => 25,
                'reorder_level' => 2,
                'price' => 200.00,
                'days_until_expiry' => 60,
            ],
            'steamed_rice' => [
                'name' => 'Steamed Rice',
                'category' => 'Sides',
                'subcategory' => 'Prepared',
                'stock' => 20,
                'unit' => 'kg',
                'portion_unit' => 'cup',
                'portions_per_unit' => 10,
                'reorder_level' => 5,
                'price' => 60.00,
                'days_until_expiry' => 60,
            ],
            'kropek' => [
                'name' => 'Kropek Crackers',
                'category' => 'Sides',
                'subcategory' => 'Snacks',
                'stock' => 10,
                'unit' => 'pack',
                'portion_unit' => 'cup',
                'portions_per_unit' => 10,
                'reorder_level' => 2,
                'price' => 80.00,
                'days_until_expiry' => 60,
            ],
            'frozen_fries' => [
                'name' => 'Frozen French Fries',
                'category' => 'Sides',
                'subcategory' => 'Frozen',
                'stock' => 12,
                'unit' => 'pack',
                'portion_unit' => 'scoop',
                'portions_per_unit' => 10, // 1 kg pack; 10 scoops (~100g each)
                'reorder_level' => 3,
                'price' => 180.00,
                'days_until_expiry' => 60,
            ],

            // === CREAMY SPECIAL HALO-HALO INGREDIENTS ===
            'halo_milk_base' => [
                'name' => 'Creamy Halo-Halo Milk Base',
                'category' => 'Dessert',
                'subcategory' => 'Ready-to-Serve',
                'stock' => 20,
                'unit' => 'L',
                'portion_unit' => 'ladle',
                'portions_per_unit' => 10,
                'reorder_level' => 4,
                'price' => 140.00,
                'days_until_expiry' => 30,
            ],
            'halo_ice_cup' => [
                'name' => 'Shaved Ice & Cup Pack',
                'category' => 'Dessert',
                'subcategory' => 'Frozen',
                'stock' => 12,
                'unit' => 'pack',
                'portion_unit' => 'pcs',
                'portions_per_unit' => 25,
                'reorder_level' => 3,
                'price' => 150.00,
                'days_until_expiry' => 90,
            ],
            'halo_mixins' => [
                'name' => 'Sweet Halo-Halo Mixins',
                'category' => 'Dessert',
                'subcategory' => 'Toppings',
                'stock' => 12,
                'unit' => 'pack',
                'portion_unit' => 'scoop',
                'portions_per_unit' => 15,
                'reorder_level' => 3,
                'price' => 180.00,
                'days_until_expiry' => 45,
            ],
            'ube_halaya' => [
                'name' => 'Ube Halaya & Ice Cream',
                'category' => 'Dessert',
                'subcategory' => 'Toppings',
                'stock' => 10,
                'unit' => 'tray',
                'portion_unit' => 'scoop',
                'portions_per_unit' => 16,
                'reorder_level' => 2,
                'price' => 240.00,
                'days_until_expiry' => 30,
            ],
            'mango_puree' => [
                'name' => 'Sweet Mango Cubes & Puree',
                'category' => 'Dessert',
                'subcategory' => 'Toppings',
                'stock' => 10,
                'unit' => 'pack',
                'portion_unit' => 'scoop',
                'portions_per_unit' => 16,
                'reorder_level' => 2,
                'price' => 220.00,
                'days_until_expiry' => 21,
            ],
            'strawberry_topping' => [
                'name' => 'Strawberry Syrup & Ice Cream',
                'category' => 'Dessert',
                'subcategory' => 'Toppings',
                'stock' => 8,
                'unit' => 'bottle',
                'portion_unit' => 'scoop',
                'portions_per_unit' => 16,
                'reorder_level' => 2,
                'price' => 240.00,
                'days_until_expiry' => 45,
            ],
            'vanilla_ice_cream' => [
                'name' => 'Vanilla Ice Cream',
                'category' => 'Dessert',
                'subcategory' => 'Frozen',
                'stock' => 8,
                'unit' => 'tray',
                'portion_unit' => 'scoop',
                'portions_per_unit' => 20,
                'reorder_level' => 2,
                'price' => 210.00,
                'days_until_expiry' => 45,
            ],
            'choco_ice_cream' => [
                'name' => 'Chocolate Ice Cream & Syrup',
                'category' => 'Dessert',
                'subcategory' => 'Toppings',
                'stock' => 8,
                'unit' => 'tray',
                'portion_unit' => 'scoop',
                'portions_per_unit' => 20,
                'reorder_level' => 2,
                'price' => 240.00,
                'days_until_expiry' => 45,
            ],
            'leche_flan' => [
                'name' => 'Leche Flan',
                'category' => 'Dessert',
                'subcategory' => 'Toppings',
                'stock' => 10,
                'unit' => 'tray',
                'portion_unit' => 'slice',
                'portions_per_unit' => 8,
                'reorder_level' => 2,
                'price' => 160.00,
                'days_until_expiry' => 14,
            ],
            'shredded_buko' => [
                'name' => 'Shredded Buko',
                'category' => 'Dessert',
                'subcategory' => 'Toppings',
                'stock' => 8,
                'unit' => 'pack',
                'portion_unit' => 'scoop',
                'portions_per_unit' => 16,
                'reorder_level' => 2,
                'price' => 160.00,
                'days_until_expiry' => 14,
            ],
            'crushed_graham' => [
                'name' => 'Crushed Graham',
                'category' => 'Dessert',
                'subcategory' => 'Dry Mix',
                'stock' => 10,
                'unit' => 'pack',
                'portion_unit' => 'scoop',
                'portions_per_unit' => 16,
                'reorder_level' => 2,
                'price' => 96.00,
                'days_until_expiry' => 90,
            ],
            'cheddar_cheese' => [
                'name' => 'Grated Cheddar Cheese',
                'category' => 'Ingredients',
                'subcategory' => 'Dairy',
                'stock' => 8,
                'unit' => 'pack',
                'portion_unit' => 'scoop',
                'portions_per_unit' => 20,
                'reorder_level' => 2,
                'price' => 160.00,
                'days_until_expiry' => 30,
            ],

            // === BEVERAGES ===
            'coke_15l' => [
                'name' => 'Coke 1.5L Bottle',
                'category' => 'Beverages',
                'subcategory' => 'Soft Drinks',
                'stock' => 36,
                'unit' => 'bottle',
                'portion_unit' => null,
                'portions_per_unit' => null,
                'reorder_level' => 6,
                'price' => 55.00,
                'days_until_expiry' => 120,
            ],
            'sprite_15l' => [
                'name' => 'Sprite 1.5L Bottle',
                'category' => 'Beverages',
                'subcategory' => 'Soft Drinks',
                'stock' => 36,
                'unit' => 'bottle',
                'portion_unit' => null,
                'portions_per_unit' => null,
                'reorder_level' => 6,
                'price' => 55.00,
                'days_until_expiry' => 120,
            ],
        ];

        $map = [];
        foreach ($definitions as $key => $cfg) {
            $placed = now()->startOfDay();
            $expiry = now()->addDays($cfg['days_until_expiry'])->startOfDay();
            $batchNo = InventoryItem::makeBatchNo($cfg['name'], $placed);
            $stock = (float) $cfg['stock'];
            $reorder = (float) $cfg['reorder_level'];
            $status = InventoryItem::deriveStatus($stock, $reorder, $expiry);

            $item = InventoryItem::query()->create([
                'name' => $cfg['name'],
                'batch_no' => $batchNo,
                'category' => $cfg['category'],
                'subcategory' => $cfg['subcategory'] ?? null,
                'subcategory_detail' => $cfg['subcategory_detail'] ?? null,
                'stock' => $stock,
                'unit' => $cfg['unit'],
                'portion_unit' => $cfg['portion_unit'],
                'portions_per_unit' => $cfg['portions_per_unit'],
                'reorder_level' => $reorder,
                'price' => (float) $cfg['price'],
                'date_placed' => $placed,
                'expiry_date' => $expiry,
                'status' => $status,
            ]);

            $batch = $item->batches()->create([
                'batch_no' => $batchNo,
                'stock' => $stock,
                'initial_stock' => $stock,
                'date_placed' => $placed,
                'expiry_date' => $expiry,
                'status' => InventoryBatch::deriveBatchStatus($stock, $expiry),
            ]);

            InventoryLog::query()->create([
                'inventory_item_id' => $item->id,
                'inventory_batch_id' => $batch->id,
                'item_name' => $item->name,
                'category' => $item->category,
                'stock_level' => $stock.' '.$item->unit,
                'quantity' => $stock,
                'previous_stock' => 0,
                'unit' => $item->unit,
                'reason' => 'Initial inventory setup (Kitchen Portion Tools)',
                'action_label' => 'Initial Stock',
                'notes' => $item->hasPortionTool()
                    ? "Configured kitchen tool: 1 {$item->unit} = {$item->portions_per_unit} {$item->portion_unit}s."
                    : 'Direct stock tracking.',
                'batch_no' => $batchNo,
                'date_placed' => $placed,
                'expiry_date' => $expiry,
                'log_type' => 'Added',
                'status' => $status,
            ]);

            $map[$key] = $item;
        }

        return $map;
    }

    /**
     * @param  array<string, InventoryItem>  $inv
     */
    private function seedMenuItems(array $inv): void
    {
        // Reuse existing valid photos in storage/app/public/menu where items match
        $existingImages = [
            'Supreme Pizza' => '/storage/menu/KbIJpTGIj0zurIwIiYk7bXHswnabBBOEkZEfJ34d.jpg',
            'Full House' => '/storage/menu/69tGVRllyINDYBCSwkzAKJ1WHhRLg9PlyZC4loa0.jpg',
            'Beef Pepperoni' => '/storage/menu/F6rZAw2BXHht89hXYE93rSJ1kwPY64DEA3F4FZ0V.jpg',
            'Hawaiian Overload' => '/storage/menu/PsVZz5x35ADlv2zPYQFriznfADXYmeNBliGDlVp2.jpg',
            'Heavenly Ube' => '/storage/menu/wnemjDKHz5Kcp1y5OIFqpHcJmLxY5AleBlTSPQVD.jpg',
            'Cheesy Ube' => '/storage/menu/0PlwHymsYXxhmQdDw9kDpf3TDF6UrbKyDA2Tm5VU.jpg',
            'Coke 1.5L' => '/storage/menu/po3Su9LN3RMlZEFmPqPHXGnpZcdtpqvupDpZoTcq.jpg',
            'Sprite 1.5L' => '/storage/menu/p972uztOcdQMwwWJ5M4EfOGljF3aEMYzbwphpo5F.jpg',
            'Flavored Wings (2 pcs / 4 Slices)' => '/storage/menu/chicken_wing.jpg',
            '6 pcs Flavored Wings / Tenders + Fries' => '/storage/menu/fries.jpg',
            'Solo Chicken Wings / Tenders (3pcs) + Rice' => '/storage/menu/chicken_thigh_rice_meal.jpg',
        ];

        $sizeNames = ['Medium 9"', 'Large 12"', 'XL 15"', 'Jumbo 18"', 'Mega 22"'];

        // Standard dough / sauce / cheese portion scaling across [M, L, XL, Jumbo, Mega]
        // Calibrated directly to the PDF's surface-area scaling (1.0x, 1.75x, 2.75x, 4.0x, 6.0x)
        $stdDough = [1.0, 1.75, 2.75, 4.0, 6.0];      // portion (~180g each)
        $stdSauce = [1.0, 1.75, 2.75, 4.0, 6.0];      // ladle (~50g each)
        $stdQuickmelt = [1.0, 1.75, 2.75, 4.0, 6.0];  // cup (~80g each)
        $stdMozza = [1.0, 1.75, 2.75, 4.0, 6.0];      // cup (~60g each)

        // =========================================================================
        // 1. PREMIUM PIZZA (All 7 Main Branch flavors x 5 sizes — PDF calibrated)
        // =========================================================================
        $premiumPizzas = [
            [
                'name' => 'Ham and Cheese',
                'description' => 'Pizza sauce, ground beef, chicken ham, extra quickmelt cheese, and mozzarella cheese.',
                'prices' => [195, 265, 395, 685, 865],
                'per_size' => [
                    'pizza_dough' => [$stdDough, 'portion'],
                    'pizza_sauce' => [$stdSauce, 'ladle'],
                    'ground_beef' => [[1.0, 1.5, 2.5, 3.5, 5.5], 'scoop'],          // PDF: 45/80/125/180/270g
                    'chicken_ham' => [[1.0, 1.5, 2.5, 3.5, 5.5], 'scoop'],          // PDF: 45/80/125/180/270g
                    'quickmelt_cheese' => [[1.25, 2.25, 3.5, 5.0, 7.5], 'cup'],     // PDF (+25%): 100/180/280/400/600g
                    'mozzarella_cheese' => [[1.25, 2.25, 3.5, 5.0, 7.5], 'cup'],    // PDF (+25%): 75/135/210/300/450g
                ],
            ],
            [
                'name' => 'Beef and Mushroom',
                'description' => 'Pizza sauce, seasoned ground beef, sliced mushrooms, quickmelt cheese, and mozzarella cheese.',
                'prices' => [235, 345, 585, 795, 925],
                'per_size' => [
                    'pizza_dough' => [$stdDough, 'portion'],
                    'pizza_sauce' => [$stdSauce, 'ladle'],
                    'ground_beef' => [[2.0, 3.5, 5.5, 8.0, 12.0], 'scoop'],         // PDF: 100/180/280/400/600g
                    'mushrooms' => [[1.5, 3.0, 4.5, 6.5, 9.5], 'scoop'],            // PDF: 40/72/112/160/240g
                    'quickmelt_cheese' => [$stdQuickmelt, 'cup'],
                    'mozzarella_cheese' => [$stdMozza, 'cup'],
                ],
            ],
            [
                'name' => 'Vegetarian Pizza',
                'description' => 'Meatless build with pizza sauce, sliced mushrooms, sweet pineapple tidbits, quickmelt cheese, and mozzarella cheese.',
                'prices' => [235, 345, 585, 795, 925],
                'per_size' => [
                    'pizza_dough' => [$stdDough, 'portion'],
                    'pizza_sauce' => [[1.0, 2.0, 3.0, 4.5, 6.5], 'ladle'],          // PDF: 55/100/155/220/330g
                    'mushrooms' => [[2.5, 4.5, 7.25, 10.5, 15.5], 'scoop'],         // PDF: 65/115/180/260/390g
                    'pineapple' => [[2.5, 4.5, 7.25, 10.5, 15.5], 'scoop'],         // PDF: 65/115/180/260/390g
                    'quickmelt_cheese' => [[1.0, 2.0, 3.0, 4.25, 6.5], 'cup'],      // PDF: 85/150/235/340/510g
                    'mozzarella_cheese' => [[1.0, 2.0, 3.0, 4.25, 6.5], 'cup'],     // PDF: 65/115/180/260/390g
                ],
            ],
            [
                'name' => 'Hawaiian Overload',
                'description' => 'Pizza sauce, ground beef, chicken ham, juicy pineapple tidbits, quickmelt cheese, and mozzarella cheese.',
                'prices' => [235, 345, 585, 795, 925],
                'per_size' => [
                    'pizza_dough' => [$stdDough, 'portion'],
                    'pizza_sauce' => [$stdSauce, 'ladle'],
                    'ground_beef' => [[1.0, 1.75, 2.75, 4.0, 6.0], 'scoop'],        // PDF: 50/90/140/200/300g
                    'chicken_ham' => [[1.25, 2.25, 3.5, 5.25, 7.75], 'scoop'],      // PDF: 65/115/180/260/390g
                    'pineapple' => [[2.5, 4.5, 6.75, 9.5, 14.5], 'scoop'],          // PDF: 60/110/170/240/360g
                    'quickmelt_cheese' => [$stdQuickmelt, 'cup'],
                    'mozzarella_cheese' => [$stdMozza, 'cup'],
                ],
            ],
            [
                'name' => 'Beef Pepperoni',
                'description' => 'Pizza sauce, ground beef, sliced beef pepperoni, mushrooms, quickmelt cheese, and mozzarella cheese.',
                'prices' => [245, 355, 595, 825, 945],
                'per_size' => [
                    'pizza_dough' => [$stdDough, 'portion'],
                    'pizza_sauce' => [$stdSauce, 'ladle'],
                    'ground_beef' => [[1.0, 2.0, 3.0, 4.5, 6.5], 'scoop'],          // PDF: 55/100/155/220/330g
                    'beef_pepperoni' => [[16, 30, 46, 66, 100], 'slice'],           // PDF (~3g/slice): 50/90/140/200/300g
                    'mushrooms' => [[1.5, 2.5, 4.0, 5.5, 8.5], 'scoop'],            // PDF: 35/65/100/140/210g
                    'quickmelt_cheese' => [$stdQuickmelt, 'cup'],
                    'mozzarella_cheese' => [$stdMozza, 'cup'],
                ],
            ],
            [
                'name' => 'Supreme Pizza',
                'description' => 'Pizza sauce, ground beef, beef pepperoni, mushrooms, sweet kernel corn, quickmelt cheese, and mozzarella cheese.',
                'prices' => [275, 385, 685, 925, 1095],
                'per_size' => [
                    'pizza_dough' => [$stdDough, 'portion'],
                    'pizza_sauce' => [$stdSauce, 'ladle'],
                    'ground_beef' => [[1.0, 1.75, 2.75, 4.0, 6.0], 'scoop'],        // PDF: 50/90/140/200/300g
                    'beef_pepperoni' => [[14, 24, 38, 54, 80], 'slice'],            // PDF (~3g/slice): 40/72/112/160/240g
                    'mushrooms' => [[1.25, 2.25, 3.5, 4.75, 7.25], 'scoop'],        // PDF: 30/55/85/120/180g
                    'kernel_corn' => [[1.25, 2.25, 3.5, 4.75, 7.25], 'scoop'],      // PDF: 30/55/85/120/180g
                    'quickmelt_cheese' => [$stdQuickmelt, 'cup'],
                    'mozzarella_cheese' => [$stdMozza, 'cup'],
                ],
            ],
            [
                'name' => 'Full House',
                'description' => 'Loaded with pizza sauce, ground beef, chicken ham, beef pepperoni, pineapples, mushrooms, kernel corn, quickmelt, and mozzarella cheese.',
                'prices' => [285, 395, 725, 985, 1185],
                'per_size' => [
                    'pizza_dough' => [$stdDough, 'portion'],
                    'pizza_sauce' => [$stdSauce, 'ladle'],
                    'ground_beef' => [[0.75, 1.5, 2.25, 3.25, 4.75], 'scoop'],      // PDF: 40/72/112/160/240g
                    'chicken_ham' => [[0.75, 1.25, 2.0, 2.75, 4.25], 'scoop'],      // PDF: 35/65/100/140/210g
                    'beef_pepperoni' => [[10, 18, 28, 40, 60], 'slice'],            // PDF (~3g/slice): 30/55/85/120/180g
                    'mushrooms' => [[1.0, 1.75, 2.75, 4.0, 6.0], 'scoop'],          // PDF: 25/45/70/100/150g
                    'pineapple' => [[1.25, 2.25, 3.5, 4.75, 7.25], 'scoop'],        // PDF: 30/55/85/120/180g
                    'kernel_corn' => [[1.0, 1.75, 2.75, 4.0, 6.0], 'scoop'],        // PDF: 25/45/70/100/150g
                    'quickmelt_cheese' => [$stdQuickmelt, 'cup'],
                    'mozzarella_cheese' => [$stdMozza, 'cup'],
                ],
            ],
        ];

        foreach ($premiumPizzas as $p) {
            $menu = MenuItem::query()->create([
                'name' => $p['name'],
                'description' => $p['description'],
                'category' => 'Pizza',
                'subcategory' => 'Premium Pizza',
                'image' => $existingImages[$p['name']] ?? null,
                'has_sizes' => true,
                'price' => 0,
                'available' => true,
                'archived' => false,
            ]);

            foreach ($sizeNames as $sIdx => $sizeName) {
                $sizeModel = MenuItemSize::query()->create([
                    'menu_item_id' => $menu->id,
                    'name' => $sizeName,
                    'price' => $p['prices'][$sIdx],
                ]);

                foreach ($p['per_size'] as $invKey => [$qtys, $unit]) {
                    $this->attachIngredient($menu, $inv[$invKey], $qtys[$sIdx], $unit, $sizeModel->id, $invKey);
                }
            }
        }

        // =========================================================================
        // 2. PIZZADILLA (All 6 flavors, 9" / 8 slices — PDF calibrated)
        // =========================================================================
        $pizzadillas = [
            [
                'name' => 'Pizzadilla All Cheese',
                'description' => '9" folded pizzadilla (8 slices) with pizza sauce, quickmelt cheese, and mozzarella cheese.',
                'price' => 215,
                'recipe' => [
                    ['pizzadilla_base', 2, 'pcs'],
                    ['pizza_sauce', 1, 'ladle'],
                    ['quickmelt_cheese', 1.25, 'cup'],   // PDF: 105g
                    ['mozzarella_cheese', 1.25, 'cup'],  // PDF: 80g
                ],
            ],
            [
                'name' => 'Pizzadilla Beef N Mushrooms',
                'description' => '9" folded pizzadilla (8 slices) with pizza sauce, ground beef, mushrooms, quickmelt, and mozzarella cheese.',
                'price' => 245,
                'recipe' => [
                    ['pizzadilla_base', 2, 'pcs'],
                    ['pizza_sauce', 1, 'ladle'],
                    ['ground_beef', 1.5, 'scoop'],       // PDF: 80g
                    ['mushrooms', 1.5, 'scoop'],         // PDF: 35g
                    ['quickmelt_cheese', 1, 'cup'],      // PDF: 75g
                    ['mozzarella_cheese', 1, 'cup'],     // PDF: 55g
                ],
            ],
            [
                'name' => 'Pizzadilla Hawaiian',
                'description' => '9" folded pizzadilla (8 slices) with pizza sauce, ground beef, chicken ham, pineapples, quickmelt, and mozzarella cheese.',
                'price' => 255,
                'recipe' => [
                    ['pizzadilla_base', 2, 'pcs'],
                    ['pizza_sauce', 1, 'ladle'],
                    ['ground_beef', 0.75, 'scoop'],      // PDF: 40g
                    ['chicken_ham', 1, 'scoop'],         // PDF: 50g
                    ['pineapple', 1.75, 'scoop'],        // PDF: 45g
                    ['quickmelt_cheese', 1, 'cup'],
                    ['mozzarella_cheese', 1, 'cup'],
                ],
            ],
            [
                'name' => 'Pizzadilla Garden Fresh',
                'description' => '9" folded pizzadilla (8 slices) with pizza sauce, mushrooms, pineapples, kernel corn, quickmelt, and mozzarella cheese.',
                'price' => 265,
                'recipe' => [
                    ['pizzadilla_base', 2, 'pcs'],
                    ['pizza_sauce', 1, 'ladle'],
                    ['mushrooms', 1.75, 'scoop'],        // PDF: 45g
                    ['pineapple', 1.75, 'scoop'],        // PDF: 45g
                    ['kernel_corn', 1.5, 'scoop'],       // PDF: 35g
                    ['quickmelt_cheese', 1, 'cup'],      // PDF: 80g
                    ['mozzarella_cheese', 1, 'cup'],     // PDF: 60g
                ],
            ],
            [
                'name' => 'Pizzadilla Pepperoni',
                'description' => '9" folded pizzadilla (8 slices) with pizza sauce, ground beef, beef pepperoni, mushrooms, quickmelt, and mozzarella cheese.',
                'price' => 275,
                'recipe' => [
                    ['pizzadilla_base', 2, 'pcs'],
                    ['pizza_sauce', 1, 'ladle'],
                    ['ground_beef', 1, 'scoop'],         // PDF: 45g
                    ['beef_pepperoni', 14, 'slice'],     // PDF: 40g (~14 slices)
                    ['mushrooms', 1.25, 'scoop'],        // PDF: 30g
                    ['quickmelt_cheese', 1, 'cup'],
                    ['mozzarella_cheese', 1, 'cup'],
                ],
            ],
            [
                'name' => 'Pizzadilla Grande',
                'description' => '9" loaded pizzadilla (8 slices) with pizza sauce, ground beef, chicken ham, beef pepperoni, pineapples, mushrooms, kernel corn, quickmelt, and mozzarella.',
                'price' => 325,
                'recipe' => [
                    ['pizzadilla_base', 2, 'pcs'],
                    ['pizza_sauce', 1, 'ladle'],
                    ['ground_beef', 0.75, 'scoop'],      // PDF: 35g
                    ['chicken_ham', 0.75, 'scoop'],      // PDF: 30g
                    ['beef_pepperoni', 9, 'slice'],      // PDF: 25g (~9 slices)
                    ['mushrooms', 1, 'scoop'],           // PDF: 20g
                    ['pineapple', 1, 'scoop'],           // PDF: 25g
                    ['kernel_corn', 1, 'scoop'],         // PDF: 20g
                    ['quickmelt_cheese', 1, 'cup'],
                    ['mozzarella_cheese', 1, 'cup'],
                ],
            ],
        ];

        foreach ($pizzadillas as $item) {
            $this->createSingleMenuItem('Pizza', 'Pizzadilla', $item, $inv, $existingImages);
        }

        // =========================================================================
        // 3. THIN-CRUST PIZZA (5 flavors from Main Branch Menu Board)
        // =========================================================================
        $thinCrusts = [
            [
                'name' => 'Thin All Cheese',
                'description' => 'Crispy thin-crust pizza topped with pizza sauce, quickmelt cheese, and mozzarella cheese.',
                'price' => 195,
                'recipe' => [
                    ['thin_crust_base', 1, 'pcs'],
                    ['pizza_sauce', 1, 'ladle'],
                    ['quickmelt_cheese', 1.25, 'cup'],
                    ['mozzarella_cheese', 1.25, 'cup'],
                ],
            ],
            [
                'name' => 'Thin Beef N Mushrooms',
                'description' => 'Crispy thin-crust pizza with pizza sauce, ground beef, mushrooms, quickmelt cheese, and mozzarella cheese.',
                'price' => 225,
                'recipe' => [
                    ['thin_crust_base', 1, 'pcs'],
                    ['pizza_sauce', 1, 'ladle'],
                    ['ground_beef', 1.5, 'scoop'],
                    ['mushrooms', 1.5, 'scoop'],
                    ['quickmelt_cheese', 1, 'cup'],
                    ['mozzarella_cheese', 1, 'cup'],
                ],
            ],
            [
                'name' => 'Thin Hawaiian Delight',
                'description' => 'Crispy thin-crust pizza with pizza sauce, ground beef, chicken ham, pineapples, quickmelt cheese, and mozzarella cheese.',
                'price' => 255,
                'recipe' => [
                    ['thin_crust_base', 1, 'pcs'],
                    ['pizza_sauce', 1, 'ladle'],
                    ['ground_beef', 1, 'scoop'],
                    ['chicken_ham', 1, 'scoop'],
                    ['pineapple', 1.75, 'scoop'],
                    ['quickmelt_cheese', 1, 'cup'],
                    ['mozzarella_cheese', 1, 'cup'],
                ],
            ],
            [
                'name' => 'Thin Garden Harvest',
                'description' => 'Crispy thin-crust pizza with pizza sauce, pineapples, mushrooms, kernel corn, quickmelt cheese, and mozzarella cheese.',
                'price' => 265,
                'recipe' => [
                    ['thin_crust_base', 1, 'pcs'],
                    ['pizza_sauce', 1, 'ladle'],
                    ['pineapple', 1.75, 'scoop'],
                    ['mushrooms', 1.75, 'scoop'],
                    ['kernel_corn', 1.5, 'scoop'],
                    ['quickmelt_cheese', 1, 'cup'],
                    ['mozzarella_cheese', 1, 'cup'],
                ],
            ],
            [
                'name' => 'Thin Fully Loaded',
                'description' => 'Crispy thin-crust pizza loaded with pizza sauce, ground beef, chicken ham, beef pepperoni, pineapples, mushrooms, kernel corn, quickmelt, and mozzarella.',
                'price' => 295,
                'recipe' => [
                    ['thin_crust_base', 1, 'pcs'],
                    ['pizza_sauce', 1, 'ladle'],
                    ['ground_beef', 0.75, 'scoop'],
                    ['chicken_ham', 0.75, 'scoop'],
                    ['beef_pepperoni', 10, 'slice'],
                    ['pineapple', 1, 'scoop'],
                    ['mushrooms', 1, 'scoop'],
                    ['kernel_corn', 1, 'scoop'],
                    ['quickmelt_cheese', 1, 'cup'],
                    ['mozzarella_cheese', 1, 'cup'],
                ],
            ],
        ];

        foreach ($thinCrusts as $item) {
            $this->createSingleMenuItem('Pizza', 'Thin-Crust Pizza', $item, $inv, $existingImages);
        }

        // =========================================================================
        // 4. QUESADILLA (6 flavors from Main Branch Menu Board)
        // =========================================================================
        $quesadillas = [
            [
                'name' => 'Quesa All Cheese',
                'description' => 'Toasted quesadilla filled with pizza sauce, quickmelt cheese, and mozzarella cheese.',
                'price' => 195,
                'recipe' => [
                    ['pizzadilla_base', 2, 'pcs'],
                    ['pizza_sauce', 1, 'ladle'],
                    ['quickmelt_cheese', 1.25, 'cup'],
                    ['mozzarella_cheese', 1, 'cup'],
                ],
            ],
            [
                'name' => 'Quesa Beef N Mushrooms',
                'description' => 'Toasted quesadilla with pizza sauce, ground beef, mushrooms, quickmelt cheese, and mozzarella cheese.',
                'price' => 225,
                'recipe' => [
                    ['pizzadilla_base', 2, 'pcs'],
                    ['pizza_sauce', 1, 'ladle'],
                    ['ground_beef', 1.5, 'scoop'],
                    ['mushrooms', 1.5, 'scoop'],
                    ['quickmelt_cheese', 1, 'cup'],
                    ['mozzarella_cheese', 1, 'cup'],
                ],
            ],
            [
                'name' => 'Quesa Pepperoni',
                'description' => 'Toasted quesadilla with pizza sauce, ground beef, beef pepperoni, quickmelt cheese, and mozzarella cheese.',
                'price' => 245,
                'recipe' => [
                    ['pizzadilla_base', 2, 'pcs'],
                    ['pizza_sauce', 1, 'ladle'],
                    ['ground_beef', 1, 'scoop'],
                    ['beef_pepperoni', 12, 'slice'],
                    ['quickmelt_cheese', 1, 'cup'],
                    ['mozzarella_cheese', 1, 'cup'],
                ],
            ],
            [
                'name' => 'Quesa Aloha',
                'description' => 'Toasted quesadilla with pizza sauce, ground beef, chicken ham, pineapples, quickmelt cheese, and mozzarella cheese.',
                'price' => 255,
                'recipe' => [
                    ['pizzadilla_base', 2, 'pcs'],
                    ['pizza_sauce', 1, 'ladle'],
                    ['ground_beef', 0.75, 'scoop'],
                    ['chicken_ham', 1, 'scoop'],
                    ['pineapple', 1.5, 'scoop'],
                    ['quickmelt_cheese', 1, 'cup'],
                    ['mozzarella_cheese', 1, 'cup'],
                ],
            ],
            [
                'name' => 'Quesa Mexicano',
                'description' => 'Toasted quesadilla with pizza sauce, ground beef, chicken ham, beef pepperoni, kernel corn, quickmelt cheese, and mozzarella cheese.',
                'price' => 255,
                'recipe' => [
                    ['pizzadilla_base', 2, 'pcs'],
                    ['pizza_sauce', 1, 'ladle'],
                    ['ground_beef', 0.75, 'scoop'],
                    ['chicken_ham', 0.75, 'scoop'],
                    ['beef_pepperoni', 10, 'slice'],
                    ['kernel_corn', 1.25, 'scoop'],
                    ['quickmelt_cheese', 1, 'cup'],
                    ['mozzarella_cheese', 1, 'cup'],
                ],
            ],
            [
                'name' => 'Quesa Wrap',
                'description' => 'Folded quesadilla wrap with pizza sauce, ground beef, beef pepperoni, mushrooms, kernel corn, quickmelt cheese, and mozzarella cheese.',
                'price' => 265,
                'recipe' => [
                    ['pizzadilla_base', 2, 'pcs'],
                    ['pizza_sauce', 1, 'ladle'],
                    ['ground_beef', 0.75, 'scoop'],
                    ['beef_pepperoni', 10, 'slice'],
                    ['mushrooms', 1.25, 'scoop'],
                    ['kernel_corn', 1.25, 'scoop'],
                    ['quickmelt_cheese', 1, 'cup'],
                    ['mozzarella_cheese', 1, 'cup'],
                ],
            ],
        ];

        foreach ($quesadillas as $item) {
            $this->createSingleMenuItem('Pizza', 'Quesadilla', $item, $inv, $existingImages);
        }

        // =========================================================================
        // 5. RICE MEALS & CHICKEN WINGS / TENDERS (8 items from Main Branch Board)
        // =========================================================================
        $wingFlavorsNote = 'Choice of flavor: Buffalo Sauce, Honey Smoked BBQ, Honey Butter, Lemon Glazed, Sweet and Spicy, Chilimansi with Honey, or Spicy Smoked BBQ.';

        $riceMeals = [
            [
                'name' => 'Solo Chicken Wings / Tenders (3pcs) + Rice',
                'description' => '3 pcs crispy flavored chicken wings or tenders served with steamed rice. '.$wingFlavorsNote,
                'price' => 95,
                'recipe' => [
                    ['chicken_wings', 3, 'pcs'],
                    ['steamed_rice', 1, 'cup'],
                    ['wing_glaze', 1, 'ladle'],
                ],
            ],
            [
                'name' => 'Double Wings / Tenders (6pcs) + Rice',
                'description' => '6 pcs crispy flavored chicken wings or tenders served with steamed rice. '.$wingFlavorsNote,
                'price' => 155,
                'recipe' => [
                    ['chicken_wings', 6, 'pcs'],
                    ['steamed_rice', 1, 'cup'],
                    ['wing_glaze', 2, 'ladle'],
                ],
            ],
        ];

        foreach ($riceMeals as $item) {
            $this->createSingleMenuItem('Rice Meals', 'Lunch', $item, $inv, $existingImages);
        }

        $wingsAndTenders = [
            [
                'name' => 'Flavored Wings / Tenders (6pcs) + Kropek',
                'description' => '6 pcs flavored wings or tenders paired with crunchy kropek. '.$wingFlavorsNote,
                'price' => 195,
                'recipe' => [
                    ['chicken_wings', 6, 'pcs'],
                    ['kropek', 1, 'cup'],
                    ['wing_glaze', 2, 'ladle'],
                ],
            ],
            [
                'name' => '6 pcs Flavored Wings / Tenders + Fries',
                'description' => '6 pcs flavored wings or tenders paired with crispy fries. '.$wingFlavorsNote,
                'price' => 195,
                'recipe' => [
                    ['chicken_wings', 6, 'pcs'],
                    ['frozen_fries', 1, 'scoop'],
                    ['wing_glaze', 2, 'ladle'],
                ],
            ],
            [
                'name' => '12 pcs Platter of Wings / Tenders',
                'description' => '12 pcs sharing platter of flavored chicken wings or tenders. '.$wingFlavorsNote,
                'price' => 295,
                'recipe' => [
                    ['chicken_wings', 12, 'pcs'],
                    ['wing_glaze', 3, 'ladle'],
                ],
            ],
            [
                'name' => '24 pcs Box of Wings / Tenders',
                'description' => '24 pcs party box of flavored chicken wings or tenders. '.$wingFlavorsNote,
                'price' => 585,
                'recipe' => [
                    ['chicken_wings', 24, 'pcs'],
                    ['wing_glaze', 6, 'ladle'],
                ],
            ],
            [
                'name' => 'Flavored Wings (2 pcs / 4 Slices)',
                'description' => 'Crispy glazed chicken wings (2 whole / 4 slices). '.$wingFlavorsNote,
                'price' => 135,
                'recipe' => [
                    ['chicken_wings', 4, 'pcs'],
                    ['wing_glaze', 1.5, 'ladle'],
                ],
            ],
            [
                'name' => 'Flavored Boneless Tenders (6 pcs)',
                'description' => '6 pcs crispy glazed boneless chicken tenders. '.$wingFlavorsNote,
                'price' => 135,
                'recipe' => [
                    ['chicken_tenders', 6, 'pcs'],
                    ['wing_glaze', 1.5, 'ladle'],
                ],
            ],
        ];

        foreach ($wingsAndTenders as $item) {
            $this->createSingleMenuItem('Snacks', null, $item, $inv, $existingImages);
        }

        // =========================================================================
        // 6. CREAMY SPECIAL HALO-HALO (All 18 flavors from Halo-Halo Board)
        // =========================================================================
        $haloHaloItems = [
            // Row 1 — ₱95 Classics
            [
                'name' => 'Creamy Mais Con Yelo',
                'description' => 'Shaved ice with creamy milk base, sweet kernel corn, vanilla ice cream, and grated cheese.',
                'price' => 95,
                'recipe' => [
                    ['halo_ice_cup', 1, 'pcs'],
                    ['halo_milk_base', 1, 'ladle'],
                    ['kernel_corn', 2, 'scoop'],
                    ['vanilla_ice_cream', 1, 'scoop'],
                    ['cheddar_cheese', 0.5, 'scoop'],
                ],
            ],
            [
                'name' => 'Original Ube',
                'description' => 'Classic creamy shaved ice halo-halo topped with rich ube halaya and ube ice cream.',
                'price' => 95,
                'recipe' => [
                    ['halo_ice_cup', 1, 'pcs'],
                    ['halo_milk_base', 1, 'ladle'],
                    ['halo_mixins', 1, 'scoop'],
                    ['ube_halaya', 1, 'scoop'],
                ],
            ],
            [
                'name' => 'Original Vanilla',
                'description' => 'Classic creamy shaved ice halo-halo with sweet mixins and smooth vanilla ice cream.',
                'price' => 95,
                'recipe' => [
                    ['halo_ice_cup', 1, 'pcs'],
                    ['halo_milk_base', 1, 'ladle'],
                    ['halo_mixins', 1, 'scoop'],
                    ['vanilla_ice_cream', 1, 'scoop'],
                ],
            ],
            [
                'name' => 'Buko Salad',
                'description' => 'Creamy shaved ice layered with sweet shredded young buko and creamy milk.',
                'price' => 95,
                'recipe' => [
                    ['halo_ice_cup', 1, 'pcs'],
                    ['halo_milk_base', 1, 'ladle'],
                    ['shredded_buko', 1.5, 'scoop'],
                    ['vanilla_ice_cream', 1, 'scoop'],
                ],
            ],
            [
                'name' => 'Original Strawberry',
                'description' => 'Creamy shaved ice halo-halo swirled with sweet strawberry syrup and strawberry ice cream.',
                'price' => 95,
                'recipe' => [
                    ['halo_ice_cup', 1, 'pcs'],
                    ['halo_milk_base', 1, 'ladle'],
                    ['halo_mixins', 1, 'scoop'],
                    ['strawberry_topping', 1, 'scoop'],
                ],
            ],
            [
                'name' => 'Original Mango',
                'description' => 'Creamy shaved ice halo-halo topped with sweet ripe mango cubes and mango puree.',
                'price' => 95,
                'recipe' => [
                    ['halo_ice_cup', 1, 'pcs'],
                    ['halo_milk_base', 1, 'ladle'],
                    ['halo_mixins', 1, 'scoop'],
                    ['mango_puree', 1, 'scoop'],
                ],
            ],

            // Row 2 — ₱145 to ₱160 Specials
            [
                'name' => 'Uberload Express',
                'description' => 'Loaded ube halo-halo with double ube halaya, sweet mixins, and creamy milk base.',
                'price' => 145,
                'recipe' => [
                    ['halo_ice_cup', 1, 'pcs'],
                    ['halo_milk_base', 1.25, 'ladle'],
                    ['halo_mixins', 1.25, 'scoop'],
                    ['ube_halaya', 2, 'scoop'],
                ],
            ],
            [
                'name' => 'Fiesta Supreme',
                'description' => 'Festive halo-halo packed with extra sweet mixins, creamy milk, and vanilla ice cream.',
                'price' => 145,
                'recipe' => [
                    ['halo_ice_cup', 1, 'pcs'],
                    ['halo_milk_base', 1.25, 'ladle'],
                    ['halo_mixins', 1.5, 'scoop'],
                    ['vanilla_ice_cream', 1.5, 'scoop'],
                ],
            ],
            [
                'name' => 'Mango Halo2x',
                'description' => 'Creamy halo-halo topped with ripe mango cubes, sweet mixins, and vanilla ice cream.',
                'price' => 155,
                'recipe' => [
                    ['halo_ice_cup', 1, 'pcs'],
                    ['halo_milk_base', 1.25, 'ladle'],
                    ['halo_mixins', 1, 'scoop'],
                    ['mango_puree', 1.5, 'scoop'],
                    ['vanilla_ice_cream', 1, 'scoop'],
                ],
            ],
            [
                'name' => 'Morebites Delight',
                'description' => 'House signature creamy halo-halo with mango, sweet mixins, vanilla ice cream, and cherry glaze.',
                'price' => 160,
                'recipe' => [
                    ['halo_ice_cup', 1, 'pcs'],
                    ['halo_milk_base', 1.25, 'ladle'],
                    ['halo_mixins', 1.25, 'scoop'],
                    ['mango_puree', 1, 'scoop'],
                    ['vanilla_ice_cream', 1, 'scoop'],
                    ['strawberry_topping', 0.5, 'scoop'],
                ],
            ],
            [
                'name' => 'Cheesy Ube',
                'description' => 'Creamy ube halo-halo crowned with generous grated cheddar cheese and rich ube ice cream.',
                'price' => 160,
                'recipe' => [
                    ['halo_ice_cup', 1, 'pcs'],
                    ['halo_milk_base', 1.25, 'ladle'],
                    ['halo_mixins', 1, 'scoop'],
                    ['ube_halaya', 1.5, 'scoop'],
                    ['cheddar_cheese', 1.5, 'scoop'],
                ],
            ],
            [
                'name' => 'Mango Graham Special',
                'description' => 'Creamy shaved ice layered with crushed graham crackers, ripe mango cubes, and milk base.',
                'price' => 160,
                'recipe' => [
                    ['halo_ice_cup', 1, 'pcs'],
                    ['halo_milk_base', 1.25, 'ladle'],
                    ['mango_puree', 1.5, 'scoop'],
                    ['crushed_graham', 1.5, 'scoop'],
                    ['vanilla_ice_cream', 1, 'scoop'],
                ],
            ],

            // Row 3 — ₱165 to ₱185 Leche Flan Premiums
            [
                'name' => 'Halo2x De Leche',
                'description' => 'Classic creamy halo-halo topped with vanilla ice cream and a rich slice of leche flan.',
                'price' => 165,
                'recipe' => [
                    ['halo_ice_cup', 1, 'pcs'],
                    ['halo_milk_base', 1.25, 'ladle'],
                    ['halo_mixins', 1.25, 'scoop'],
                    ['vanilla_ice_cream', 1, 'scoop'],
                    ['leche_flan', 1, 'slice'],
                ],
            ],
            [
                'name' => 'Heavenly Ube',
                'description' => 'Rich ube halo-halo topped with double ube scoops and creamy leche flan.',
                'price' => 165,
                'recipe' => [
                    ['halo_ice_cup', 1, 'pcs'],
                    ['halo_milk_base', 1.25, 'ladle'],
                    ['halo_mixins', 1, 'scoop'],
                    ['ube_halaya', 1.5, 'scoop'],
                    ['leche_flan', 1, 'slice'],
                ],
            ],
            [
                'name' => 'Creamy Trio',
                'description' => 'Three-flavor delight combining ube, strawberry, and mango scoops crowned with leche flan.',
                'price' => 165,
                'recipe' => [
                    ['halo_ice_cup', 1, 'pcs'],
                    ['halo_milk_base', 1.25, 'ladle'],
                    ['ube_halaya', 0.75, 'scoop'],
                    ['strawberry_topping', 0.75, 'scoop'],
                    ['mango_puree', 0.75, 'scoop'],
                    ['leche_flan', 1, 'slice'],
                ],
            ],
            [
                'name' => 'Creamy Choco',
                'description' => 'Decadent chocolate ice cream halo-halo with chocolate fudge, sweet mixins, and leche flan.',
                'price' => 175,
                'recipe' => [
                    ['halo_ice_cup', 1, 'pcs'],
                    ['halo_milk_base', 1.25, 'ladle'],
                    ['halo_mixins', 1, 'scoop'],
                    ['choco_ice_cream', 1.5, 'scoop'],
                    ['leche_flan', 1, 'slice'],
                ],
            ],
            [
                'name' => 'Super Strawberry',
                'description' => 'Premium strawberry halo-halo with double strawberry ice cream, sweet mixins, and leche flan.',
                'price' => 185,
                'recipe' => [
                    ['halo_ice_cup', 1, 'pcs'],
                    ['halo_milk_base', 1.5, 'ladle'],
                    ['halo_mixins', 1, 'scoop'],
                    ['strawberry_topping', 2, 'scoop'],
                    ['leche_flan', 1, 'slice'],
                ],
            ],
            [
                'name' => 'Super Mango',
                'description' => 'Premium mango halo-halo packed with double ripe mango cubes, creamy milk, and leche flan.',
                'price' => 185,
                'recipe' => [
                    ['halo_ice_cup', 1, 'pcs'],
                    ['halo_milk_base', 1.5, 'ladle'],
                    ['halo_mixins', 1, 'scoop'],
                    ['mango_puree', 2, 'scoop'],
                    ['leche_flan', 1, 'slice'],
                ],
            ],
        ];

        foreach ($haloHaloItems as $item) {
            $this->createSingleMenuItem('Desserts', null, $item, $inv, $existingImages);
        }

        // =========================================================================
        // 7. BEVERAGES (Coke 1.5L & Sprite 1.5L)
        // =========================================================================
        $beverages = [
            [
                'name' => 'Coke 1.5L',
                'description' => 'Chilled Coca-Cola 1.5L bottle, perfect for sharing with pizza.',
                'price' => 67,
                'recipe' => [
                    ['coke_15l', 1, 'bottle'],
                ],
            ],
            [
                'name' => 'Sprite 1.5L',
                'description' => 'Chilled Sprite 1.5L bottle, crisp lemon-lime refreshment.',
                'price' => 67,
                'recipe' => [
                    ['sprite_15l', 1, 'bottle'],
                ],
            ],
        ];

        foreach ($beverages as $item) {
            $this->createSingleMenuItem('Beverages', null, $item, $inv, $existingImages);
        }
    }

    /**
     * @param  array<string, mixed>  $item
     * @param  array<string, InventoryItem>  $inv
     * @param  array<string, string>  $existingImages
     */
    private function createSingleMenuItem(
        string $category,
        ?string $subcategory,
        array $item,
        array $inv,
        array $existingImages
    ): void {
        $menu = MenuItem::query()->create([
            'name' => $item['name'],
            'description' => $item['description'] ?? null,
            'category' => $category,
            'subcategory' => $subcategory,
            'image' => $existingImages[$item['name']] ?? null,
            'has_sizes' => false,
            'price' => $item['price'],
            'available' => true,
            'archived' => false,
        ]);

        foreach ($item['recipe'] as [$invKey, $qty, $unit]) {
            $this->attachIngredient($menu, $inv[$invKey], $qty, $unit, null, $invKey);
        }
    }

    private function isRemovableForItem(MenuItem $menu, string $invKey): bool
    {
        if (strcasecmp(trim((string) $menu->category), 'Beverages') === 0) {
            return false;
        }

        // Core structural / primary ingredients that cannot be removed
        $alwaysMain = [
            'pizza_dough',
            'pizzadilla_base',
            'thin_crust_base',
            'pizza_sauce',
            'chicken_wings',
            'chicken_tenders',
            'steamed_rice',
            'kropek',
            'frozen_fries',
            'halo_ice_cup',
            'halo_milk_base',
            'coke_15l',
            'sprite_15l',
        ];
        if (in_array($invKey, $alwaysMain, true)) {
            return false;
        }

        // Signature core ingredients by menu item name
        $dishMainMap = [
            'Pizzadilla All Cheese' => ['quickmelt_cheese', 'mozzarella_cheese'],
            'Thin All Cheese' => ['quickmelt_cheese', 'mozzarella_cheese'],
            'Quesa All Cheese' => ['quickmelt_cheese', 'mozzarella_cheese'],
            'Creamy Mais Con Yelo' => ['kernel_corn'],
            'Original Ube' => ['ube_halaya'],
            'Uberload Express' => ['ube_halaya'],
            'Cheesy Ube' => ['ube_halaya'],
            'Heavenly Ube' => ['ube_halaya'],
            'Original Vanilla' => ['vanilla_ice_cream'],
            'Buko Salad' => ['shredded_buko'],
            'Original Strawberry' => ['strawberry_topping'],
            'Super Strawberry' => ['strawberry_topping'],
            'Original Mango' => ['mango_puree'],
            'Mango Halo2x' => ['mango_puree'],
            'Mango Graham Special' => ['mango_puree'],
            'Super Mango' => ['mango_puree'],
            'Creamy Choco' => ['choco_ice_cream'],
        ];

        $dishMains = $dishMainMap[$menu->name] ?? [];

        return ! in_array($invKey, $dishMains, true);
    }

    private function attachIngredient(
        MenuItem $menu,
        InventoryItem $inventory,
        float $qty,
        string $unit,
        ?int $sizeId,
        string $invKey = ''
    ): void {
        $normUnit = UnitConverter::normalize($unit) ?? $unit;
        $qtyInStockUnit = UnitConverter::toStockUnit(
            $qty,
            $normUnit,
            $inventory->unit,
            $inventory->portion_unit,
            $inventory->portions_per_unit !== null ? (float) $inventory->portions_per_unit : null
        );
        $price = (float) $inventory->price > 0
            ? round((float) $inventory->price * $qtyInStockUnit, 2)
            : 0.0;

        MenuItemIngredient::query()->create([
            'menu_item_id' => $menu->id,
            'menu_item_size_id' => $sizeId,
            'inventory_item_id' => $inventory->id,
            'qty_per_serving' => $qty,
            'unit' => $normUnit,
            'price' => $price,
            'is_removable' => $this->isRemovableForItem($menu, $invKey),
        ]);
    }
}
