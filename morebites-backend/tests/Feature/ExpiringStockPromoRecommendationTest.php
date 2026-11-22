<?php

namespace Tests\Feature;

use App\Models\InventoryDisposition;
use App\Models\InventoryItem;
use App\Models\MenuItem;
use App\Models\MenuItemIngredient;
use App\Models\Order;
use App\Models\User;
use App\Services\InventoryDeductionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExpiringStockPromoRecommendationTest extends TestCase
{
    use RefreshDatabase;

    private function createAdmin(): User
    {
        return User::factory()->create([
            'role' => 'admin',
            'status' => 'Active',
        ]);
    }

    public function test_expiring_stock_ranks_linked_menus_by_highest_ingredient_usage_and_deduplicates_sizes(): void
    {
        $admin = $this->createAdmin();

        // 1.5 kg Mozzarella expiring in 2 days
        $mozzarella = InventoryItem::query()->create([
            'name' => 'Mozzarella Cheese',
            'category' => 'Dairy',
            'stock' => 1.5,
            'unit' => 'kg',
            'reorder_level' => 2.0,
            'status' => 'Expiring Soon',
            'expiry_date' => now()->addDays(2)->toDateString(),
            'date_placed' => now()->subDays(5)->toDateString(),
        ]);

        $batch = $mozzarella->batches()->create([
            'batch_no' => 'MOZ-001',
            'stock' => 1.5,
            'initial_stock' => 1.5,
            'date_placed' => now()->subDays(5)->toDateString(),
            'expiry_date' => now()->addDays(2)->toDateString(),
            'status' => 'Expiring Soon',
        ]);

        // Dish 1: Hawaiian Overload (Medium: 60g, Large: 105g)
        $hawaiian = MenuItem::query()->create([
            'name' => 'Hawaiian Overload',
            'category' => 'Pizza',
            'has_sizes' => true,
            'price' => 0,
            'available' => true,
            'archived' => false,
        ]);
        $hawMed = $hawaiian->sizes()->create(['name' => 'Medium', 'price' => 240]);
        $hawLrg = $hawaiian->sizes()->create(['name' => 'Large', 'price' => 360]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $hawaiian->id,
            'menu_item_size_id' => $hawMed->id,
            'inventory_item_id' => $mozzarella->id,
            'qty_per_serving' => 60,
            'unit' => 'g',
        ]);
        MenuItemIngredient::query()->create([
            'menu_item_id' => $hawaiian->id,
            'menu_item_size_id' => $hawLrg->id,
            'inventory_item_id' => $mozzarella->id,
            'qty_per_serving' => 105,
            'unit' => 'g',
        ]);

        // Dish 2: All Cheese (Medium: 75g, Large: 135g -> HIGHEST usage, must be #1 Recommended!)
        $allCheese = MenuItem::query()->create([
            'name' => 'All Cheese',
            'category' => 'Pizza',
            'has_sizes' => true,
            'price' => 0,
            'available' => true,
            'archived' => false,
        ]);
        $acMed = $allCheese->sizes()->create(['name' => 'Medium', 'price' => 220]);
        $acLrg = $allCheese->sizes()->create(['name' => 'Large', 'price' => 340]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $allCheese->id,
            'menu_item_size_id' => $acMed->id,
            'inventory_item_id' => $mozzarella->id,
            'qty_per_serving' => 75,
            'unit' => 'g',
        ]);
        MenuItemIngredient::query()->create([
            'menu_item_id' => $allCheese->id,
            'menu_item_size_id' => $acLrg->id,
            'inventory_item_id' => $mozzarella->id,
            'qty_per_serving' => 135,
            'unit' => 'g',
        ]);

        $res = $this->actingAs($admin)->getJson('/api/inventory/expiring');
        $res->assertOk();

        $row = collect($res->json('data'))->firstWhere('id', $batch->id);
        $this->assertNotNull($row);

        // Suggested urgency discount for 2 days left = 15%, label = Today's Special
        $this->assertEquals(15, $row['suggested_discount_percent']);
        $this->assertEquals("Today's Special", $row['suggested_promo_label']);

        // Deduplicated: 2 unique menus (not 4 rows!)
        $linkedMenus = $row['linked_menus'];
        $this->assertCount(2, $linkedMenus);

        // Ranked #1: All Cheese (135g > 105g)
        $this->assertEquals('All Cheese', $linkedMenus[0]['name']);
        $this->assertTrue($linkedMenus[0]['recommended']);
        // 1.5 kg / 0.135 kg = 11.11 -> ceil = 12 orders (Large); 1.5 kg / 0.075 kg = 20 orders (Medium)
        $this->assertEquals(12, $linkedMenus[0]['min_orders_to_clear']);
        $this->assertEquals(20, $linkedMenus[0]['max_orders_to_clear']);
        $this->assertEquals('~12–20 orders', $linkedMenus[0]['orders_to_clear_label']);

        // Ranked #2: Hawaiian Overload
        $this->assertEquals('Hawaiian Overload', $linkedMenus[1]['name']);
        $this->assertFalse($linkedMenus[1]['recommended']);
        // 1.5 kg / 0.105 kg = 14.28 -> ceil = 15; 1.5 kg / 0.060 kg = 25
        $this->assertEquals(15, $linkedMenus[1]['min_orders_to_clear']);
        $this->assertEquals(25, $linkedMenus[1]['max_orders_to_clear']);
    }

    public function test_promo_applies_friendly_label_discounts_customer_and_pos_menus_and_auto_clears_when_batch_depletes(): void
    {
        $admin = $this->createAdmin();
        $customer = User::factory()->create(['role' => 'customer', 'status' => 'Active']);

        $ham = InventoryItem::query()->create([
            'name' => 'Chicken Ham',
            'category' => 'Meat',
            'stock' => 2.2,
            'unit' => 'kg',
            'reorder_level' => 0.5,
            'status' => 'Sufficient',
        ]);

        // Expiring Batch A: 0.2 kg (expires today -> 2 orders of 100g will clear it!)
        $batchA = $ham->batches()->create([
            'batch_no' => 'HAM-EXP',
            'stock' => 0.2,
            'initial_stock' => 0.2,
            'date_placed' => now()->subDays(5)->toDateString(),
            'expiry_date' => now()->toDateString(),
            'status' => 'Expires Today',
        ]);

        // Fresh Batch B: 2.0 kg (expires in 20 days)
        $batchB = $ham->batches()->create([
            'batch_no' => 'HAM-FRESH',
            'stock' => 2.0,
            'initial_stock' => 2.0,
            'date_placed' => now()->toDateString(),
            'expiry_date' => now()->addDays(20)->toDateString(),
            'status' => 'Sufficient',
        ]);

        $pizza = MenuItem::query()->create([
            'name' => 'Ham Special',
            'category' => 'Pizza',
            'has_sizes' => false,
            'price' => 200,
            'available' => true,
            'archived' => false,
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $pizza->id,
            'inventory_item_id' => $ham->id,
            'qty_per_serving' => 100,
            'unit' => 'g',
        ]);

        // Activate 20% Flash Deal promo on Batch A
        $promoRes = $this->actingAs($admin)->postJson("/api/inventory/batches/{$batchA->id}/expiring/promo", [
            'menu_item_ids' => [$pizza->id],
            'discount_percent' => 20,
            'promo_label' => 'Flash Deal',
        ]);
        $promoRes->assertOk();

        $pizza->refresh();
        $this->assertTrue($pizza->promo_active);
        $this->assertEquals(20.0, $pizza->promo_discount_percent);
        $this->assertEquals('Flash Deal', $pizza->promo_label);
        $this->assertStringNotContainsString('Use It Up', (string) $pizza->promo_label);

        // Customer menu returns discounted price 160 and originalPrice 200
        $custMenu = $this->actingAs($customer)->getJson('/api/customer/menu');
        $custMenu->assertOk();
        $itemPayload = collect($custMenu->json('data'))->firstWhere('db_id', $pizza->id);
        $this->assertTrue($itemPayload['promoActive']);
        $this->assertEquals(200.0, $itemPayload['originalPrice']);
        $this->assertEquals(160.0, $itemPayload['price']);
        $this->assertEquals('Flash Deal', $itemPayload['promoLabel']);

        // POS menuOptions also returns discounted price 160 and original_price 200
        $posMenu = $this->actingAs($admin)->getJson('/api/orders/menu-options');
        $posMenu->assertOk();
        $posItem = collect($posMenu->json('data'))->firstWhere('id', $pizza->id);
        $this->assertTrue($posItem['promo_active']);
        $this->assertEquals(200.0, $posItem['original_price']);
        $this->assertEquals(160.0, $posItem['price']);

        // Place an order for 2x Ham Special -> consumes 200g = 0.2 kg -> completely depletes Batch A!
        $order = Order::query()->create([
            'order_code' => '#ORD-00991',
            'customer_name' => 'Walk-in Guest',
            'order_type' => 'Takeout',
            'total' => 320,
            'status' => 'Preparing',
        ]);
        $order->items()->create([
            'menu_item_id' => $pizza->id,
            'name' => 'Ham Special',
            'qty' => 2,
            'unit_price' => 160,
            'line_total' => 320,
        ]);

        app(InventoryDeductionService::class)->deductForOrder($order);

        $batchA->refresh();
        $batchB->refresh();
        $pizza->refresh();

        // Batch A depleted to 0, Batch B completely untouched at 2.0 kg
        $this->assertEquals(0.0, (float) $batchA->stock);
        $this->assertEquals(2.0, (float) $batchB->stock);

        // Auto-shutoff: promo is automatically cleared & disposition auto-resolved!
        $this->assertFalse($pizza->promo_active);
        $this->assertNull($pizza->promo_discount_percent);
        $this->assertNull($pizza->promo_label);

        $latestDisp = InventoryDisposition::query()
            ->where('inventory_batch_id', $batchA->id)
            ->latest('id')
            ->first();
        $this->assertEquals(InventoryDisposition::RESOLVED, $latestDisp->disposition);
        $this->assertNotNull($latestDisp->resolved_at);
    }

    public function test_expired_batch_promo_auto_clears_customer_promo_without_resolving_overdue_batch(): void
    {
        $admin = $this->createAdmin();
        $customer = User::factory()->create(['role' => 'customer', 'status' => 'Active']);

        $cheese = InventoryItem::query()->create([
            'name' => 'Quickmelt Cheese',
            'category' => 'Dairy',
            'stock' => 3.0,
            'unit' => 'kg',
            'reorder_level' => 1.0,
            'status' => 'Sufficient',
        ]);

        // Batch expired yesterday, but had an active promo set earlier
        $overdueBatch = $cheese->batches()->create([
            'batch_no' => 'QM-OLD',
            'stock' => 1.0,
            'initial_stock' => 1.0,
            'date_placed' => now()->subDays(10)->toDateString(),
            'expiry_date' => now()->subDay()->toDateString(),
            'status' => 'Expired',
        ]);

        $cheese->batches()->create([
            'batch_no' => 'QM-FRESH',
            'stock' => 2.0,
            'initial_stock' => 2.0,
            'date_placed' => now()->toDateString(),
            'expiry_date' => now()->addDays(20)->toDateString(),
            'status' => 'Sufficient',
        ]);

        $pizza = MenuItem::query()->create([
            'name' => 'Cheesy Melt',
            'category' => 'Pizza',
            'price' => 300,
            'available' => true,
            'archived' => false,
            'promo_active' => true,
            'promo_discount_percent' => 25,
            'promo_label' => 'Flash Deal',
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $pizza->id,
            'inventory_item_id' => $cheese->id,
            'qty_per_serving' => 100,
            'unit' => 'g',
        ]);

        InventoryDisposition::query()->create([
            'inventory_item_id' => $cheese->id,
            'inventory_batch_id' => $overdueBatch->id,
            'disposition' => InventoryDisposition::PROMO,
            'promo_menu_item_id' => $pizza->id,
            'promo_discount_percent' => 25,
            'user_id' => $admin->id,
        ]);

        // Fetching customer menu auto-clears the stale promo so fresh stock isn't sold at 25% off
        $res = $this->actingAs($customer)->getJson('/api/customer/menu');
        $res->assertOk();

        $pizza->refresh();
        $this->assertFalse($pizza->promo_active);
        $itemPayload = collect($res->json('data'))->firstWhere('db_id', $pizza->id);
        $this->assertFalse($itemPayload['promoActive']);
        $this->assertEquals(300.0, $itemPayload['price']);

        // Overdue batch disposition remains unresolved until staff explicitly mark it as Waste
        $disp = InventoryDisposition::query()->where('inventory_batch_id', $overdueBatch->id)->first();
        $this->assertNull($disp->resolved_at);
    }
}
