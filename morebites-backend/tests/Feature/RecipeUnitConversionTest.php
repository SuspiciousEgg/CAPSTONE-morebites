<?php

namespace Tests\Feature;

use App\Models\InventoryItem;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use App\Services\InventoryDeductionService;
use App\Support\UnitConverter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RecipeUnitConversionTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private InventoryDeductionService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::query()->create([
            'name' => 'Admin User',
            'email' => 'admin@test.com',
            'phone' => '09123456780',
            'password' => bcrypt('password123'),
            'role' => 'super_admin',
            'status' => 'Active',
        ]);

        $this->service = app(InventoryDeductionService::class);
    }

    public function test_unit_converter_accurately_converts_mass_volume_and_count(): void
    {
        // Mass conversions
        $this->assertEquals(0.2, UnitConverter::convert(200, 'g', 'kg'));
        $this->assertEquals(500.0, UnitConverter::convert(0.5, 'kg', 'g'));
        $this->assertEquals(1.0, UnitConverter::convert(1, 'kg', 'kg'));
        $this->assertEquals(100.0, UnitConverter::convert(100, 'g', 'g'));

        // Volume conversions
        $this->assertEquals(0.25, UnitConverter::convert(250, 'ml', 'L'));
        $this->assertEquals(1500.0, UnitConverter::convert(1.5, 'L', 'ml'));

        // Count conversions
        $this->assertEquals(3.0, UnitConverter::convert(3, 'pcs', 'pcs'));

        // Compatibility
        $this->assertTrue(UnitConverter::isCompatible('g', 'kg'));
        $this->assertTrue(UnitConverter::isCompatible('ml', 'L'));
        $this->assertTrue(UnitConverter::isCompatible('pcs', 'pcs'));
        $this->assertFalse(UnitConverter::isCompatible('g', 'pcs'));
        $this->assertFalse(UnitConverter::isCompatible('kg', 'L'));
        $this->assertFalse(UnitConverter::isCompatible('pcs', 'ml'));
    }

    public function test_store_menu_item_accepts_compatible_unit(): void
    {
        $cheese = InventoryItem::query()->create([
            'name' => 'Mozzarella Cheese',
            'category' => 'Dairy',
            'unit' => 'kg',
            'stock' => 10.0,
            'reorder_level' => 1.0,
            'status' => 'In Stock',
        ]);

        $response = $this->actingAs($this->admin)->postJson('/api/menu', [
            'name' => 'Cheese Pizza',
            'category' => 'Pizza',
            'has_sizes' => false,
            'price' => 250,
            'ingredients' => [
                [
                    'inventory_item_id' => $cheese->id,
                    'qty_per_serving' => 200, // 200 grams
                    'unit' => 'g',
                ],
            ],
        ]);

        $response->assertStatus(201);
        $data = $response->json('data');
        $this->assertEquals('g', $data['ingredients'][0]['unit']);
        $this->assertEquals('kg', $data['ingredients'][0]['inventory_unit']);
        $this->assertEquals(200.0, $data['ingredients'][0]['qty_per_serving']);
    }

    public function test_store_menu_item_rejects_incompatible_unit(): void
    {
        $cheese = InventoryItem::query()->create([
            'name' => 'Mozzarella Cheese',
            'category' => 'Dairy',
            'unit' => 'kg',
            'stock' => 10.0,
            'reorder_level' => 1.0,
            'status' => 'In Stock',
        ]);

        $response = $this->actingAs($this->admin)->postJson('/api/menu', [
            'name' => 'Invalid Unit Pizza',
            'category' => 'Pizza',
            'has_sizes' => false,
            'price' => 250,
            'ingredients' => [
                [
                    'inventory_item_id' => $cheese->id,
                    'qty_per_serving' => 2,
                    'unit' => 'pcs', // Incompatible: pcs vs kg
                ],
            ],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('ingredients');
    }

    public function test_inventory_deduction_converts_recipe_unit_to_inventory_stock_unit(): void
    {
        $flour = InventoryItem::query()->create([
            'name' => 'Flour',
            'category' => 'Ingredients',
            'unit' => 'kg',
            'stock' => 5.0,
            'reorder_level' => 1.0,
            'status' => 'In Stock',
        ]);

        $menu = MenuItem::query()->create([
            'name' => 'Garlic Bread',
            'category' => 'Bread',
            'has_sizes' => false,
            'price' => 120,
            'available' => true,
            'archived' => false,
        ]);

        $menu->ingredients()->create([
            'inventory_item_id' => $flour->id,
            'qty_per_serving' => 250, // 250 grams per serving
            'unit' => 'g',
        ]);

        $order = Order::query()->create([
            'order_code' => '#ORD-00099',
            'customer_name' => 'Customer Test',
            'order_type' => 'Dine-in',
            'status' => 'Preparing',
            'total' => 240,
        ]);

        $order->items()->create([
            'menu_item_id' => $menu->id,
            'name' => 'Garlic Bread',
            'qty' => 2, // 2 * 250g = 500g = 0.5 kg
            'unit_price' => 120,
            'line_total' => 240,
        ]);

        // Deduct for order
        $this->service->deductForOrder($order);

        // 5.0 kg - 0.5 kg = 4.5 kg
        $this->assertEquals(4.5, (float) $flour->fresh()->stock);

        // Reverse / Restock order
        $this->service->restockForOrder($order);
        $this->assertEquals(5.0, (float) $flour->fresh()->stock);
    }

    public function test_can_serve_evaluates_converted_units_against_stock(): void
    {
        $sauce = InventoryItem::query()->create([
            'name' => 'Tomato Sauce',
            'category' => 'Sauces',
            'unit' => 'L',
            'stock' => 0.1, // 0.1 L = 100 ml in stock
            'reorder_level' => 0.05,
            'status' => 'In Stock',
        ]);

        $menu = MenuItem::query()->create([
            'name' => 'Spaghetti',
            'category' => 'Pasta',
            'has_sizes' => false,
            'price' => 150,
            'available' => true,
            'archived' => false,
        ]);

        $menu->ingredients()->create([
            'inventory_item_id' => $sauce->id,
            'qty_per_serving' => 200, // 200 ml required per serving (0.2 L > 0.1 L)
            'unit' => 'ml',
        ]);

        $this->assertFalse($this->service->canServe($menu));
        $this->assertEquals('insufficient', $this->service->unserviceableReason($menu));

        // Add stock to 0.5 L (500 ml)
        $sauce->update(['stock' => 0.5]);
        $menu->refresh();
        $this->assertTrue($this->service->canServe($menu));
        $this->assertNull($this->service->unserviceableReason($menu));
    }
}
