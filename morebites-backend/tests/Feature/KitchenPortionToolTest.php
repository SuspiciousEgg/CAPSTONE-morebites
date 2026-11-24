<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\InventoryBatch;
use App\Models\InventoryItem;
use App\Models\MenuItem;
use App\Models\User;
use App\Services\InventoryDeductionService;
use App\Support\UnitConverter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class KitchenPortionToolTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $customerUser;
    private InventoryDeductionService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create([
            'role' => 'super_admin',
            'status' => 'Active',
        ]);

        $this->customerUser = User::factory()->create([
            'role' => 'customer',
            'phone' => '09171234567',
            'status' => 'Active',
        ]);

        Customer::create([
            'user_id' => $this->customerUser->id,
            'full_name' => 'Test Customer',
            'phone' => '09171234567',
            'delivery_address' => 'Poblacion, Dangcagan',
        ]);

        $this->service = app(InventoryDeductionService::class);
    }

    public function test_unit_converter_supports_kitchen_portion_tools_and_packaging_units(): void
    {
        $this->assertEquals('scoop', UnitConverter::normalize('scoops'));
        $this->assertEquals('ladle', UnitConverter::normalize('Ladles'));
        $this->assertEquals('slice', UnitConverter::normalize('slices'));
        $this->assertEquals('pack', UnitConverter::normalize('packs'));
        $this->assertEquals('portion', UnitConverter::normalize('servings'));

        // Same custom/kitchen unit is compatible 1:1
        $this->assertTrue(UnitConverter::isCompatible('scoop', 'scoop'));
        $this->assertTrue(UnitConverter::isCompatible('pack', 'packs'));
        $this->assertFalse(UnitConverter::isCompatible('scoop', 'pack'));

        // Inventory-aware compatibility and conversion: 1 pack = 8 scoops
        $this->assertTrue(UnitConverter::isCompatibleWithInventory('scoop', 'pack', 'scoop', 8.0));
        $this->assertFalse(UnitConverter::isCompatibleWithInventory('ladle', 'pack', 'scoop', 8.0));
        $this->assertEquals(0.1875, UnitConverter::toStockUnit(1.5, 'scoop', 'pack', 'scoop', 8.0));
        $this->assertEquals(0.25, UnitConverter::toStockUnit(3, 'ladle', 'L', 'ladle', 12.0));
    }

    public function test_inventory_api_saves_portion_tool_and_computes_per_portion_metrics(): void
    {
        Sanctum::actingAs($this->admin);

        // Reject portion_unit without portions_per_unit
        $bad = $this->postJson('/api/inventory', [
            'name' => 'Mozzarella Cheese',
            'category' => 'Ingredients',
            'stock' => 5,
            'unit' => 'pack',
            'portion_unit' => 'scoop',
            'reorder_level' => 1,
            'price' => 320,
        ]);
        $bad->assertStatus(422)->assertJsonValidationErrors('portions_per_unit');

        // Valid portion tool configuration: 1 pack = 8 scoops, ₱320/pack -> ₱40/scoop, 5 packs -> 40 scoops
        $res = $this->postJson('/api/inventory', [
            'name' => 'Mozzarella Cheese',
            'category' => 'Ingredients',
            'stock' => 5,
            'unit' => 'pack',
            'portion_unit' => 'scoops',
            'portions_per_unit' => 8,
            'reorder_level' => 1,
            'price' => 320,
        ]);

        $res->assertStatus(201);
        $data = $res->json('data');
        $this->assertEquals('pack', $data['unit']);
        $this->assertEquals('scoop', $data['portion_unit']);
        $this->assertEquals(8.0, $data['portions_per_unit']);
        $this->assertEquals(40.0, $data['price_per_portion']);
        $this->assertEquals(40.0, $data['stock_in_portions']);
    }

    public function test_menu_recipe_with_kitchen_portion_tools_prices_deducts_and_reverses_accurately(): void
    {
        Sanctum::actingAs($this->admin);

        $cheese = InventoryItem::create([
            'name' => 'Mozzarella Cheese',
            'category' => 'Ingredients',
            'unit' => 'pack',
            'portion_unit' => 'scoop',
            'portions_per_unit' => 8,
            'stock' => 2.0,
            'reorder_level' => 0.5,
            'price' => 320.0,
            'status' => 'Sufficient',
        ]);
        InventoryBatch::create([
            'inventory_item_id' => $cheese->id,
            'batch_no' => 'MO-01',
            'stock' => 2.0,
            'initial_stock' => 2.0,
            'date_placed' => now()->toDateString(),
            'expiry_date' => now()->addDays(14)->toDateString(),
            'status' => 'Sufficient',
        ]);

        $sauce = InventoryItem::create([
            'name' => 'Pizza Sauce',
            'category' => 'Ingredients',
            'unit' => 'L',
            'portion_unit' => 'ladle',
            'portions_per_unit' => 10,
            'stock' => 1.0,
            'reorder_level' => 0.2,
            'price' => 150.0,
            'status' => 'Sufficient',
        ]);
        InventoryBatch::create([
            'inventory_item_id' => $sauce->id,
            'batch_no' => 'PS-01',
            'stock' => 1.0,
            'initial_stock' => 1.0,
            'date_placed' => now()->toDateString(),
            'expiry_date' => now()->addDays(14)->toDateString(),
            'status' => 'Sufficient',
        ]);

        // Direct kitchen-unit inventory (no secondary multiplier needed)
        $dough = InventoryItem::create([
            'name' => 'Pizza Dough Ball',
            'category' => 'Ingredients',
            'unit' => 'portion',
            'stock' => 10,
            'reorder_level' => 2,
            'price' => 25.0,
            'status' => 'Sufficient',
        ]);
        InventoryBatch::create([
            'inventory_item_id' => $dough->id,
            'batch_no' => 'PD-01',
            'stock' => 10,
            'initial_stock' => 10,
            'date_placed' => now()->toDateString(),
            'expiry_date' => now()->addDays(7)->toDateString(),
            'status' => 'Sufficient',
        ]);

        // Reject mismatched kitchen tool (ladle on cheese which uses scoop)
        $badMenu = $this->postJson('/api/menu', [
            'name' => 'Bad Tool Pizza',
            'category' => 'Pizza',
            'has_sizes' => false,
            'price' => 250,
            'ingredients' => [
                ['inventory_item_id' => $cheese->id, 'qty_per_serving' => 1, 'unit' => 'ladle'],
            ],
        ]);
        $badMenu->assertStatus(422)->assertJsonValidationErrors('ingredients');

        // Create sized pizza using kitchen portion tools
        $menuRes = $this->postJson('/api/menu', [
            'name' => 'Margherita Pizza',
            'category' => 'Pizza',
            'has_sizes' => true,
            'sizes' => [
                [
                    'name' => 'Medium',
                    'price' => 220,
                    'ingredients' => [
                        ['inventory_item_id' => $cheese->id, 'qty_per_serving' => 1, 'unit' => 'scoop'],
                        ['inventory_item_id' => $sauce->id, 'qty_per_serving' => 1, 'unit' => 'ladle'],
                        ['inventory_item_id' => $dough->id, 'qty_per_serving' => 1, 'unit' => 'portion'],
                    ],
                ],
                [
                    'name' => 'Large',
                    'price' => 320,
                    'ingredients' => [
                        ['inventory_item_id' => $cheese->id, 'qty_per_serving' => 1.5, 'unit' => 'scoop'],
                        ['inventory_item_id' => $sauce->id, 'qty_per_serving' => 2, 'unit' => 'ladle'],
                        ['inventory_item_id' => $dough->id, 'qty_per_serving' => 1, 'unit' => 'portion'],
                    ],
                ],
            ],
        ]);

        $menuRes->assertStatus(201);
        $menuData = $menuRes->json('data');
        $largeSize = collect($menuData['sizes'])->firstWhere('name', 'Large');
        $largeCheese = collect($largeSize['ingredients'])->firstWhere('name', 'Mozzarella Cheese');
        $largeSauce = collect($largeSize['ingredients'])->firstWhere('name', 'Pizza Sauce');

        // 1.5 scoops @ ₱320/pack (8 scoops/pack) = ₱60.00; 2 ladles @ ₱150/L (10 ladles/L) = ₱30.00
        $this->assertEquals(60.0, (float) $largeCheese['price']);
        $this->assertEquals(30.0, (float) $largeSauce['price']);
        $this->assertEquals('scoop', $largeCheese['unit']);

        // Place customer order: 2 Large pizzas, removing Pizza Sauce on both
        // Price per Large: 320 - 30 = 290; total = 580
        // Cheese deducted: 2 * (1.5 / 8) = 0.375 pack -> 2.0 - 0.375 = 1.625 pack
        // Sauce deducted: 0 (removed) -> stays 1.0 L
        // Dough deducted: 2 portions -> 10 - 2 = 8 portions
        Sanctum::actingAs($this->customerUser);
        $orderRes = $this->postJson('/api/customer/orders', [
            'full_name' => 'Test Customer',
            'phone' => '09171234567',
            'delivery_address' => 'Poblacion, Dangcagan',
            'payment_method' => 'COD',
            'latitude' => 7.61,
            'longitude' => 124.99,
            'items' => [
                [
                    'menu_item_id' => $menuData['id'],
                    'name' => 'Margherita Pizza (Large)',
                    'size' => 'Large',
                    'qty' => 2,
                    'unit_price' => 290.0,
                    'removed_ingredients' => [
                        ['inventory_item_id' => $sauce->id, 'name' => 'Pizza Sauce'],
                    ],
                ],
            ],
        ]);

        $orderRes->assertStatus(201);
        $this->assertEquals(1.625, round((float) $cheese->fresh()->stock, 4));
        $this->assertEquals(1.0, round((float) $sauce->fresh()->stock, 4));
        $this->assertEquals(8.0, round((float) $dough->fresh()->stock, 4));

        // Updating portions_per_unit (e.g. from 8 to 10 scoops/pack) automatically recalculates linked recipe prices
        Sanctum::actingAs($this->admin);
        $updateRes = $this->putJson("/api/inventory/{$cheese->id}", [
            'portions_per_unit' => 10,
        ]);
        $updateRes->assertStatus(200);
        $this->assertEquals(32.0, $updateRes->json('data.price_per_portion'));

        // Large cheese (1.5 scoops @ ₱32/scoop) should now be ₱48.00
        $menuModel = MenuItem::with('ingredients')->find($menuData['id']);
        $updatedLargeCheese = $menuModel->ingredients
            ->where('inventory_item_id', $cheese->id)
            ->firstWhere('qty_per_serving', 1.5);
        $this->assertEquals(48.0, (float) $updatedLargeCheese->price);

        // Availability check: if cheese drops to 0.1 pack (= 1 scoop at 10/pack),
        // Medium (1 scoop) is serviceable, Large (1.5 scoops) is NOT serviceable!
        $cheese->batches()->update(['stock' => 0.1]);
        $cheese->recalculateStockFromBatches();
        $menuModel->refresh();

        $this->assertTrue($this->service->canServe($menuModel, 1, 'Medium'));
        $this->assertFalse($this->service->canServe($menuModel, 1, 'Large'));
    }

    public function test_main_ingredients_and_beverages_cannot_be_displayed_or_removed(): void
    {
        Sanctum::actingAs($this->admin);

        $wingsInv = InventoryItem::create([
            'name' => 'Chicken Wings',
            'category' => 'Meat',
            'unit' => 'pack',
            'portion_unit' => 'pcs',
            'portions_per_unit' => 24,
            'stock' => 5,
            'reorder_level' => 1,
            'price' => 360.0,
            'status' => 'Sufficient',
        ]);
        InventoryBatch::create([
            'inventory_item_id' => $wingsInv->id,
            'batch_no' => 'CW-01',
            'stock' => 5,
            'initial_stock' => 5,
            'date_placed' => now()->toDateString(),
            'expiry_date' => now()->addDays(20)->toDateString(),
            'status' => 'Sufficient',
        ]);

        $glazeInv = InventoryItem::create([
            'name' => 'Wing Glaze',
            'category' => 'Ingredients',
            'unit' => 'bottle',
            'portion_unit' => 'ladle',
            'portions_per_unit' => 25,
            'stock' => 5,
            'reorder_level' => 1,
            'price' => 200.0,
            'status' => 'Sufficient',
        ]);
        InventoryBatch::create([
            'inventory_item_id' => $glazeInv->id,
            'batch_no' => 'WG-01',
            'stock' => 5,
            'initial_stock' => 5,
            'date_placed' => now()->toDateString(),
            'expiry_date' => now()->addDays(20)->toDateString(),
            'status' => 'Sufficient',
        ]);

        $cokeInv = InventoryItem::create([
            'name' => 'Coke 1.5L Bottle',
            'category' => 'Beverages',
            'unit' => 'bottle',
            'stock' => 10,
            'reorder_level' => 2,
            'price' => 55.0,
            'status' => 'Sufficient',
        ]);
        InventoryBatch::create([
            'inventory_item_id' => $cokeInv->id,
            'batch_no' => 'CK-01',
            'stock' => 10,
            'initial_stock' => 10,
            'date_placed' => now()->toDateString(),
            'expiry_date' => now()->addDays(60)->toDateString(),
            'status' => 'Sufficient',
        ]);

        $wingsMenu = $this->postJson('/api/menu', [
            'name' => '24 pcs Box of Wings',
            'category' => 'Snacks',
            'has_sizes' => false,
            'price' => 585,
            'ingredients' => [
                ['inventory_item_id' => $wingsInv->id, 'qty_per_serving' => 24, 'unit' => 'pcs', 'is_removable' => false],
                ['inventory_item_id' => $glazeInv->id, 'qty_per_serving' => 6, 'unit' => 'ladle', 'is_removable' => true],
            ],
        ])->assertStatus(201)->json('data');

        $cokeMenu = $this->postJson('/api/menu', [
            'name' => 'Coke 1.5L',
            'category' => 'Beverages',
            'has_sizes' => false,
            'price' => 67,
            'ingredients' => [
                ['inventory_item_id' => $cokeInv->id, 'qty_per_serving' => 1, 'unit' => 'bottle', 'is_removable' => true],
            ],
        ])->assertStatus(201)->json('data');

        // POS menu-options hides main Chicken Wings (shows only Wing Glaze) and hides all Beverage ingredients
        $posOptions = $this->getJson('/api/orders/menu-options')->assertStatus(200)->json('data');
        $posWings = collect($posOptions)->firstWhere('id', $wingsMenu['id']);
        $posCoke = collect($posOptions)->firstWhere('id', $cokeMenu['id']);
        $this->assertCount(1, $posWings['ingredients']);
        $this->assertEquals('Wing Glaze', $posWings['ingredients'][0]['name']);
        $this->assertCount(0, $posCoke['ingredients']);

        // Customer mobile menu also hides main Chicken Wings and all Beverage ingredients
        Sanctum::actingAs($this->customerUser);
        $custMenu = $this->getJson('/api/customer/menu')->assertStatus(200)->json('data');
        $custWings = collect($custMenu)->firstWhere('db_id', $wingsMenu['id']);
        $custCoke = collect($custMenu)->firstWhere('db_id', $cokeMenu['id']);
        $this->assertCount(1, $custWings['ingredients']);
        $this->assertEquals('Wing Glaze', $custWings['ingredients'][0]['name']);
        $this->assertCount(0, $custCoke['ingredients']);

        // Attempting to remove main Chicken Wings or Coke bottle via API is ignored (full price charged & stock still deducted!)
        $orderRes = $this->postJson('/api/customer/orders', [
            'full_name' => 'Test Customer',
            'phone' => '09171234567',
            'delivery_address' => 'Poblacion, Dangcagan',
            'payment_method' => 'COD',
            'latitude' => 7.61,
            'longitude' => 124.99,
            'items' => [
                [
                    'menu_item_id' => $wingsMenu['id'],
                    'name' => '24 pcs Box of Wings',
                    'qty' => 1,
                    'unit_price' => 225.0,
                    'removed_ingredients' => [
                        ['inventory_item_id' => $wingsInv->id, 'name' => 'Chicken Wings'],
                    ],
                ],
                [
                    'menu_item_id' => $cokeMenu['id'],
                    'name' => 'Coke 1.5L',
                    'qty' => 1,
                    'unit_price' => 12.0,
                    'removed_ingredients' => [
                        ['inventory_item_id' => $cokeInv->id, 'name' => 'Coke 1.5L Bottle'],
                    ],
                ],
            ],
        ])->assertStatus(201);

        // Authoritative backend pricing must charge full 585 + 67 = 652 (ignoring both forged removals)
        $order = \App\Models\Order::with('items')->latest('id')->first();
        $this->assertNotNull($order);
        $this->assertEquals(652.0, round((float) $order->items->sum('line_total'), 2));
        foreach ($order->items as $oi) {
            $this->assertEmpty($oi->removed_ingredients);
        }
        // Stock for Chicken Wings (5 - 1 pack = 4) and Coke (10 - 1 bottle = 9) MUST still be deducted
        $this->assertEquals(4.0, round((float) $wingsInv->fresh()->stock, 4));
        $this->assertEquals(9.0, round((float) $cokeInv->fresh()->stock, 4));
    }
}

