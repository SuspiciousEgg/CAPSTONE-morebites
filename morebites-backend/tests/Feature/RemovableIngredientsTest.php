<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\InventoryBatch;
use App\Models\InventoryItem;
use App\Models\MenuItem;
use App\Models\User;
use App\Services\InventoryDeductionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RemovableIngredientsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $customerUser;
    private Customer $customer;
    private InventoryItem $dough;
    private InventoryItem $cheese;
    private InventoryItem $pepperoni;
    private MenuItem $pizza;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create([
            'role' => 'admin',
            'allowed_pages' => ['Menu', 'Inventory', 'Orders'],
        ]);

        $this->customerUser = User::factory()->create([
            'role' => 'customer',
            'phone' => '+63 912 345 6789',
        ]);

        $this->customer = Customer::create([
            'user_id' => $this->customerUser->id,
            'full_name' => 'Pizza Lover',
            'phone' => '09123456789',
            'delivery_address' => 'Poblacion, Dangcagan',
        ]);

        // Create inventory items with initial batches
        $this->dough = InventoryItem::create([
            'name' => 'Pizza Dough',
            'category' => 'Ingredients',
            'stock' => 10,
            'unit' => 'pcs',
        ]);
        InventoryBatch::create([
            'inventory_item_id' => $this->dough->id,
            'batch_no' => 'DOUGH-001',
            'stock' => 10,
            'initial_stock' => 10,
            'date_placed' => now()->toDateString(),
            'expiry_date' => now()->addDays(30)->toDateString(),
            'status' => 'Sufficient',
        ]);

        $this->cheese = InventoryItem::create([
            'name' => 'Mozzarella Cheese',
            'category' => 'Dairy',
            'stock' => 1000,
            'unit' => 'g',
        ]);
        InventoryBatch::create([
            'inventory_item_id' => $this->cheese->id,
            'batch_no' => 'CHEESE-001',
            'stock' => 1000,
            'initial_stock' => 1000,
            'date_placed' => now()->toDateString(),
            'expiry_date' => now()->addDays(20)->toDateString(),
            'status' => 'Sufficient',
        ]);

        $this->pepperoni = InventoryItem::create([
            'name' => 'Pepperoni Slices',
            'category' => 'Meat',
            'stock' => 500,
            'unit' => 'g',
        ]);
        InventoryBatch::create([
            'inventory_item_id' => $this->pepperoni->id,
            'batch_no' => 'PEP-001',
            'stock' => 500,
            'initial_stock' => 500,
            'date_placed' => now()->toDateString(),
            'expiry_date' => now()->addDays(15)->toDateString(),
            'status' => 'Sufficient',
        ]);

        // Create menu item with linked ingredients and per-ingredient deduction pricing
        $this->pizza = MenuItem::create([
            'name' => 'Pepperoni Classic Pizza',
            'category' => 'Pizza',
            'price' => 300.00,
            'has_sizes' => false,
            'available' => true,
        ]);

        // Dough: 1 pc, deduction price: 0
        $this->pizza->ingredients()->create([
            'inventory_item_id' => $this->dough->id,
            'qty_per_serving' => 1,
            'unit' => 'pcs',
            'price' => 0.00,
        ]);

        // Cheese: 100 g, deduction price: 20.00
        $this->pizza->ingredients()->create([
            'inventory_item_id' => $this->cheese->id,
            'qty_per_serving' => 100,
            'unit' => 'g',
            'price' => 20.00,
        ]);

        // Pepperoni: 50 g, deduction price: 30.00
        $this->pizza->ingredients()->create([
            'inventory_item_id' => $this->pepperoni->id,
            'qty_per_serving' => 50,
            'unit' => 'g',
            'price' => 30.00,
        ]);
    }

    public function test_menu_endpoint_returns_ingredient_prices_for_customization(): void
    {
        Sanctum::actingAs($this->customerUser);

        $res = $this->getJson('/api/customer/menu');
        $res->assertStatus(200);

        $item = collect($res->json('data'))->firstWhere('name', 'Pepperoni Classic Pizza');
        $this->assertNotNull($item);
        $this->assertNotEmpty($item['ingredients']);

        $cheeseIng = collect($item['ingredients'])->firstWhere('name', 'Mozzarella Cheese');
        $this->assertNotNull($cheeseIng);
        $this->assertEquals(20.00, (float) $cheeseIng['price']);

        $pepIng = collect($item['ingredients'])->firstWhere('name', 'Pepperoni Slices');
        $this->assertNotNull($pepIng);
        $this->assertEquals(30.00, (float) $pepIng['price']);
    }

    public function test_customer_order_with_removed_ingredient_skips_inventory_deduction(): void
    {
        Sanctum::actingAs($this->customerUser);

        // Customer orders pizza without Pepperoni (removes Pepperoni, saving ₱30)
        // Base price = 300, effective unit price = 270
        $response = $this->postJson('/api/customer/orders', [
            'full_name' => 'Pizza Lover',
            'phone' => '09123456789',
            'delivery_address' => 'Poblacion, Dangcagan',
            'payment_method' => 'COD',
            'latitude' => 7.6100,
            'longitude' => 124.9900,
            'items' => [
                [
                    'menu_item_id' => $this->pizza->id,
                    'name' => 'Pepperoni Classic Pizza (No Pepperoni)',
                    'qty' => 1,
                    'unit_price' => 270.00,
                    'removed_ingredients' => [
                        [
                            'inventory_item_id' => $this->pepperoni->id,
                            'name' => 'Pepperoni Slices',
                            'price' => 30.00,
                        ],
                    ],
                ],
            ],
        ]);

        $response->assertStatus(201);

        // Verify Pepperoni stock was NOT deducted (stays at 500g)
        $this->pepperoni->refresh();
        $this->assertEquals(500.0, (float) $this->pepperoni->stock);

        // Verify Dough and Cheese WERE deducted
        $this->dough->refresh();
        $this->assertEquals(9.0, (float) $this->dough->stock); // 10 - 1

        $this->cheese->refresh();
        $this->assertEquals(900.0, (float) $this->cheese->stock); // 1000 - 100
    }

    public function test_pos_order_with_removed_ingredient_skips_inventory_deduction(): void
    {
        Sanctum::actingAs($this->admin);

        // POS orders pizza without Cheese (removes Cheese, saving ₱20)
        // Base price = 300, effective unit price = 280
        $response = $this->postJson('/api/orders', [
            'customer_name' => 'Walkin Customer',
            'order_type' => 'Dine-in',
            'items' => [
                [
                    'menu_item_id' => $this->pizza->id,
                    'name' => 'Pepperoni Classic Pizza',
                    'qty' => 2,
                    'unit_price' => 280.00,
                    'removed_ingredients' => [
                        $this->cheese->id, // by raw inventory_item_id integer
                    ],
                ],
            ],
        ]);

        $response->assertStatus(201);

        // Verify Cheese stock was NOT deducted (stays at 1000g)
        $this->cheese->refresh();
        $this->assertEquals(1000.0, (float) $this->cheese->stock);

        // Verify Dough and Pepperoni were deducted for qty = 2
        $this->dough->refresh();
        $this->assertEquals(8.0, (float) $this->dough->stock); // 10 - (2 * 1)

        $this->pepperoni->refresh();
        $this->assertEquals(400.0, (float) $this->pepperoni->stock); // 500 - (2 * 50)
    }
}

