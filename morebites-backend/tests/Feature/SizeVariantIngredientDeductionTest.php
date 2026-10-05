<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\InventoryItem;
use App\Models\InventoryLog;
use App\Models\MenuItem;
use App\Models\MenuItemIngredient;
use App\Models\MenuItemSize;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use App\Services\InventoryDeductionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SizeVariantIngredientDeductionTest extends TestCase
{
    use RefreshDatabase;

    private function createAdminUser(): User
    {
        return User::query()->create([
            'name' => 'Admin User',
            'email' => 'admin@test.com',
            'phone' => '09123456780',
            'password' => Hash::make('password123'),
            'role' => 'admin',
            'status' => 'Active',
        ]);
    }

    public function test_store_sized_menu_item_with_independent_ingredients_per_size(): void
    {
        $admin = $this->createAdminUser();
        Sanctum::actingAs($admin);

        $dough = InventoryItem::query()->create([
            'name' => 'Pizza Dough',
            'category' => 'Ingredients',
            'stock' => 10.0,
            'unit' => 'kg',
            'reorder_level' => 2.0,
            'status' => 'In Stock',
        ]);

        $cheese = InventoryItem::query()->create([
            'name' => 'Mozzarella Cheese',
            'category' => 'Dairy',
            'stock' => 5.0,
            'unit' => 'kg',
            'reorder_level' => 1.0,
            'status' => 'In Stock',
        ]);

        $payload = [
            'name' => 'Garlic Pizza',
            'category' => 'Pizza',
            'has_sizes' => true,
            'sizes' => [
                [
                    'name' => 'Medium 9"',
                    'price' => 220,
                    'ingredients' => [
                        ['inventory_item_id' => $dough->id, 'qty_per_serving' => 0.25],
                        ['inventory_item_id' => $cheese->id, 'qty_per_serving' => 0.15],
                    ],
                ],
                [
                    'name' => 'Large 12"',
                    'price' => 340,
                    'ingredients' => [
                        ['inventory_item_id' => $dough->id, 'qty_per_serving' => 0.40],
                        ['inventory_item_id' => $cheese->id, 'qty_per_serving' => 0.28],
                    ],
                ],
            ],
        ];

        $response = $this->postJson('/api/menu', $payload);
        $response->assertCreated();

        $menu = MenuItem::query()->where('name', 'Garlic Pizza')->first();
        $this->assertNotNull($menu);
        $this->assertTrue($menu->has_sizes);
        $this->assertCount(2, $menu->sizes);

        $mediumSize = $menu->sizes()->where('name', 'Medium 9"')->first();
        $largeSize = $menu->sizes()->where('name', 'Large 12"')->first();
        $this->assertNotNull($mediumSize);
        $this->assertNotNull($largeSize);

        $mediumDough = MenuItemIngredient::query()
            ->where('menu_item_id', $menu->id)
            ->where('menu_item_size_id', $mediumSize->id)
            ->where('inventory_item_id', $dough->id)
            ->first();
        $this->assertNotNull($mediumDough);
        $this->assertEquals(0.25, (float) $mediumDough->qty_per_serving);

        $largeDough = MenuItemIngredient::query()
            ->where('menu_item_id', $menu->id)
            ->where('menu_item_size_id', $largeSize->id)
            ->where('inventory_item_id', $dough->id)
            ->first();
        $this->assertNotNull($largeDough);
        $this->assertEquals(0.40, (float) $largeDough->qty_per_serving);

        // Verify API response contains size-specific ingredients
        $data = $response->json('data');
        $this->assertCount(2, $data['sizes']);
        $this->assertEquals(0.25, $data['sizes'][0]['ingredients'][0]['qty_per_serving']);
        $this->assertEquals(0.40, $data['sizes'][1]['ingredients'][0]['qty_per_serving']);
    }

    public function test_inventory_deduction_uses_size_specific_recipe_not_fixed_multiplier(): void
    {
        $dough = InventoryItem::query()->create([
            'name' => 'Pizza Dough',
            'category' => 'Ingredients',
            'stock' => 10.0,
            'unit' => 'kg',
            'reorder_level' => 1.0,
            'status' => 'In Stock',
        ]);

        $menu = MenuItem::query()->create([
            'name' => 'Pepperoni Special',
            'category' => 'Pizza',
            'has_sizes' => true,
            'price' => 0,
            'available' => true,
            'archived' => false,
        ]);

        $medium = $menu->sizes()->create(['name' => 'Medium 9"', 'price' => 200]);
        $large = $menu->sizes()->create(['name' => 'Large 12"', 'price' => 320]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $menu->id,
            'menu_item_size_id' => $medium->id,
            'inventory_item_id' => $dough->id,
            'qty_per_serving' => 0.25,
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $menu->id,
            'menu_item_size_id' => $large->id,
            'inventory_item_id' => $dough->id,
            'qty_per_serving' => 0.40,
        ]);

        $service = app(InventoryDeductionService::class);

        // 1. Order 2 Medium pizzas -> should deduct 2 * 0.25 = 0.50kg
        $orderMedium = Order::query()->create([
            'order_code' => '#ORD-00001',
            'customer_name' => 'Customer A',
            'order_type' => 'Dine-in',
            'total' => 400,
            'status' => 'Preparing',
        ]);

        $orderMedium->items()->create([
            'menu_item_id' => $menu->id,
            'name' => 'Pepperoni Special (Medium 9")',
            'size' => 'Medium 9"',
            'qty' => 2,
            'unit_price' => 200,
            'line_total' => 400,
        ]);

        $service->deductForOrder($orderMedium);
        $dough->refresh();
        $this->assertEquals(9.5, (float) $dough->stock);

        // 2. Order 3 Large pizzas -> should deduct 3 * 0.40 = 1.20kg
        $orderLarge = Order::query()->create([
            'order_code' => '#ORD-00002',
            'customer_name' => 'Customer B',
            'order_type' => 'Takeout',
            'total' => 960,
            'status' => 'Preparing',
        ]);

        $orderLarge->items()->create([
            'menu_item_id' => $menu->id,
            'name' => 'Pepperoni Special (Large 12")',
            'size' => 'Large 12"',
            'qty' => 3,
            'unit_price' => 320,
            'line_total' => 960,
        ]);

        $service->deductForOrder($orderLarge);
        $dough->refresh();
        $this->assertEquals(8.3, (float) $dough->stock);

        // 3. Reversal / restock for orderLarge -> should restore exactly 1.20kg
        $service->restockForOrder($orderLarge);
        $dough->refresh();
        $this->assertEquals(9.5, (float) $dough->stock);
    }

    public function test_fallback_to_base_ingredients_when_item_has_no_sizes(): void
    {
        $coffeeBeans = InventoryItem::query()->create([
            'name' => 'Coffee Beans',
            'category' => 'Beverage',
            'stock' => 5.0,
            'unit' => 'kg',
            'reorder_level' => 1.0,
            'status' => 'In Stock',
        ]);

        $item = MenuItem::query()->create([
            'name' => 'Espresso Shot',
            'category' => 'Drinks',
            'has_sizes' => false,
            'price' => 80,
            'available' => true,
            'archived' => false,
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $item->id,
            'menu_item_size_id' => null,
            'inventory_item_id' => $coffeeBeans->id,
            'qty_per_serving' => 0.02,
        ]);

        $service = app(InventoryDeductionService::class);

        $order = Order::query()->create([
            'order_code' => '#ORD-00003',
            'customer_name' => 'Customer C',
            'order_type' => 'Dine-in',
            'total' => 160,
            'status' => 'Preparing',
        ]);

        $order->items()->create([
            'menu_item_id' => $item->id,
            'name' => 'Espresso Shot',
            'size' => null,
            'qty' => 2,
            'unit_price' => 80,
            'line_total' => 160,
        ]);

        $service->deductForOrder($order);
        $coffeeBeans->refresh();
        $this->assertEquals(4.96, (float) $coffeeBeans->stock);
    }

    public function test_can_serve_evaluates_specific_size_stock(): void
    {
        $dough = InventoryItem::query()->create([
            'name' => 'Special Crust Dough',
            'category' => 'Ingredients',
            'stock' => 0.30, // Enough for Medium (0.25), but not enough for Large (0.40)
            'unit' => 'kg',
            'reorder_level' => 0.1,
            'status' => 'In Stock',
        ]);

        $menu = MenuItem::query()->create([
            'name' => 'Thin Crust Pizza',
            'category' => 'Pizza',
            'has_sizes' => true,
            'price' => 0,
            'available' => true,
            'archived' => false,
        ]);

        $medium = $menu->sizes()->create(['name' => 'Medium 9"', 'price' => 200]);
        $large = $menu->sizes()->create(['name' => 'Large 12"', 'price' => 300]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $menu->id,
            'menu_item_size_id' => $medium->id,
            'inventory_item_id' => $dough->id,
            'qty_per_serving' => 0.25,
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $menu->id,
            'menu_item_size_id' => $large->id,
            'inventory_item_id' => $dough->id,
            'qty_per_serving' => 0.40,
        ]);

        $service = app(InventoryDeductionService::class);

        // Medium only needs 0.25kg -> can be served!
        $this->assertTrue($service->canServe($menu, 1, 'Medium 9"'));
        $this->assertNull($service->unserviceableReason($menu, 1, 'Medium 9"'));

        // Large needs 0.40kg -> cannot be served!
        $this->assertFalse($service->canServe($menu, 1, 'Large 12"'));
        $this->assertEquals('insufficient', $service->unserviceableReason($menu, 1, 'Large 12"'));
    }
}
