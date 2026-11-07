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

    public function test_inventory_price_computes_proportionally_per_size_and_snapshots_at_order_time(): void
    {
        Sanctum::actingAs($this->admin);

        // 1. Create an inventory item with unit price = 15.00 per kg
        $spinach = InventoryItem::create([
            'name' => 'Fresh Spinach',
            'category' => 'Vegetables',
            'stock' => 50,
            'unit' => 'kg',
            'price' => 15.00,
        ]);

        $this->assertEquals(15.00, (float) $spinach->price);

        // 2. Create menu item with 10" (500 g), 12" (1 kg), and 15" (2 kg) sizes
        $spinachPizza = MenuItem::create([
            'name' => 'Spinach Special Pizza',
            'category' => 'Pizza',
            'price' => 250.00,
            'available' => true,
        ]);

        $size10 = $spinachPizza->sizes()->create([
            'name' => '10"',
            'price' => 180.00,
        ]);

        $size12 = $spinachPizza->sizes()->create([
            'name' => '12"',
            'price' => 250.00,
        ]);

        $size15 = $spinachPizza->sizes()->create([
            'name' => '15"',
            'price' => 350.00,
        ]);

        // 10" uses 500 g (0.5 kg) -> 15.00 * 0.5 = 7.50
        $size10->ingredients()->create([
            'menu_item_id' => $spinachPizza->id,
            'inventory_item_id' => $spinach->id,
            'qty_per_serving' => 500,
            'unit' => 'g',
            'price' => 0.00,
        ]);

        // 12" uses 1 kg -> 15.00 * 1 = 15.00
        $size12->ingredients()->create([
            'menu_item_id' => $spinachPizza->id,
            'inventory_item_id' => $spinach->id,
            'qty_per_serving' => 1,
            'unit' => 'kg',
            'price' => 0.00,
        ]);

        // 15" uses 2 kg -> 15.00 * 2 = 30.00
        $size15->ingredients()->create([
            'menu_item_id' => $spinachPizza->id,
            'inventory_item_id' => $spinach->id,
            'qty_per_serving' => 2,
            'unit' => 'kg',
            'price' => 0.00,
        ]);

        // 3. Verify proportional computed prices in Admin Menu API
        $response = $this->getJson('/api/menu');
        $response->assertStatus(200);

        $menuItem = collect($response->json('data'))->firstWhere('id', $spinachPizza->id);
        $this->assertNotNull($menuItem);

        $size10Data = collect($menuItem['sizes'])->firstWhere('name', '10"');
        $this->assertEquals(7.50, (float) $size10Data['ingredients'][0]['price']);
        $this->assertEquals(15.00, (float) $size10Data['ingredients'][0]['inventory_price']);

        $size12Data = collect($menuItem['sizes'])->firstWhere('name', '12"');
        $this->assertEquals(15.00, (float) $size12Data['ingredients'][0]['price']);
        $this->assertEquals(15.00, (float) $size12Data['ingredients'][0]['inventory_price']);

        $size15Data = collect($menuItem['sizes'])->firstWhere('name', '15"');
        $this->assertEquals(30.00, (float) $size15Data['ingredients'][0]['price']);
        $this->assertEquals(15.00, (float) $size15Data['ingredients'][0]['inventory_price']);

        // 4. Verify in Customer App API
        Sanctum::actingAs($this->customerUser);
        $customerResponse = $this->getJson('/api/customer/menu');
        $customerResponse->assertStatus(200);

        $custItem = collect($customerResponse->json('data'))->firstWhere('name', 'Spinach Special Pizza');
        $this->assertNotNull($custItem);

        $custSizes = $custItem['sizes'];
        $cust10 = collect($custSizes)->firstWhere('sizeName', '10"');
        $this->assertEquals(7.50, (float) $cust10['ingredients'][0]['price']);

        $cust12 = collect($custSizes)->firstWhere('sizeName', '12"');
        $this->assertEquals(15.00, (float) $cust12['ingredients'][0]['price']);

        $cust15 = collect($custSizes)->firstWhere('sizeName', '15"');
        $this->assertEquals(30.00, (float) $cust15['ingredients'][0]['price']);

        // 5. Place an order for 15" Spinach Special Pizza with Fresh Spinach removed (350 - 30 = 320)
        $orderResp = $this->postJson('/api/customer/orders', [
            'full_name' => 'Pizza Lover',
            'phone' => '09123456789',
            'delivery_address' => 'Poblacion, Dangcagan',
            'payment_method' => 'COD',
            'latitude' => 7.6100,
            'longitude' => 124.9900,
            'items' => [
                [
                    'menu_item_id' => $spinachPizza->id,
                    'name' => 'Spinach Special Pizza (15")',
                    'size' => '15"',
                    'qty' => 1,
                    'unit_price' => 320.00,
                    'removed_ingredients' => [
                        ['inventory_item_id' => $spinach->id, 'name' => 'Fresh Spinach', 'price' => 30.00],
                    ],
                ],
            ],
            'delivery_fee' => 20,
            'service_fee' => 10,
            'total' => 350.00,
        ]);
        $orderResp->assertStatus(201);
        $orderId = $orderResp->json('data.id');

        // 6. Update Inventory unit price for Fresh Spinach from 15.00/kg to 40.00/kg
        $spinach->update(['price' => 40.00]);

        // Live menu reflects the updated inventory price (15" uses 2 kg * 40.00 = 80.00)
        $updatedMenuResp = $this->getJson('/api/customer/menu');
        $updatedCustItem = collect($updatedMenuResp->json('data'))->firstWhere('name', 'Spinach Special Pizza');
        $updatedCust15 = collect($updatedCustItem['sizes'])->firstWhere('sizeName', '15"');
        $this->assertEquals(80.00, (float) $updatedCust15['ingredients'][0]['price']);

        // Past order receipt and Admin order records retain the snapshotted price (320.00 item price, 30.00 deduction)
        $historyResp = $this->getJson('/api/customer/orders');
        $historyResp->assertStatus(200);
        $pastOrder = collect($historyResp->json('data'))->firstWhere('id', (string) $orderId);
        $this->assertNotNull($pastOrder);
        $this->assertEquals(320.00, (float) $pastOrder['items'][0]['price']);
        $this->assertEquals(30.00, (float) $pastOrder['items'][0]['removed_ingredients'][0]['price']);
        $this->assertEquals(15.00, (float) $pastOrder['items'][0]['removed_ingredients'][0]['unit_price']);
    }
}

