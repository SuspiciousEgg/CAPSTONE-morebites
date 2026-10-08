<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\InventoryBatch;
use App\Models\InventoryItem;
use App\Models\MenuItem;
use App\Models\MenuItemIngredient;
use App\Models\MenuItemSize;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use App\Services\InventoryDeductionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WholeCartIngredientAggregationTest extends TestCase
{
    use RefreshDatabase;

    private function createCustomerUser(): User
    {
        $user = User::query()->create([
            'name' => 'John Doe',
            'email' => 'john@test.com',
            'phone' => '09123456789',
            'password' => Hash::make('password123'),
            'role' => 'customer',
            'status' => 'Active',
        ]);

        Customer::query()->create([
            'user_id' => $user->id,
            'customer_code' => 'C00001',
            'full_name' => 'John Doe',
            'phone' => '09123456789',
            'status' => 'ACTIVE',
            'registered_at' => now(),
        ]);

        return $user;
    }

    private function createAdminUser(): User
    {
        return User::query()->create([
            'name' => 'Admin Manager',
            'email' => 'admin@test.com',
            'phone' => '09998887766',
            'password' => Hash::make('password123'),
            'role' => 'admin',
            'status' => 'Active',
        ]);
    }

    public function test_pos_order_rejects_whole_cart_when_two_items_sharing_ingredient_exceed_available_stock(): void
    {
        $admin = $this->createAdminUser();
        Sanctum::actingAs($admin);

        // Mozzarella Cheese: total available = 0.3 kg in Batch 1
        $mozzarella = InventoryItem::query()->create([
            'name' => 'Mozzarella Cheese',
            'category' => 'Dairy',
            'stock' => 0.3,
            'unit' => 'kg',
            'reorder_level' => 0.1,
            'status' => 'In Stock',
            'date_placed' => now()->toDateString(),
        ]);

        InventoryBatch::query()->create([
            'inventory_item_id' => $mozzarella->id,
            'batch_no' => 'BATCH-MOZZ-001',
            'stock' => 0.3,
            'initial_stock' => 0.3,
            'expiry_date' => now()->addDays(10)->toDateString(),
            'date_placed' => now()->toDateString(),
            'status' => 'Good',
        ]);

        $pepperoniPizza = MenuItem::query()->create([
            'name' => 'Pepperoni Pizza',
            'category' => 'Pizza',
            'price' => 320,
            'available' => true,
            'archived' => false,
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $pepperoniPizza->id,
            'inventory_item_id' => $mozzarella->id,
            'qty_per_serving' => 0.2,
            'unit' => 'kg',
        ]);

        $hawaiianPizza = MenuItem::query()->create([
            'name' => 'Hawaiian Pizza',
            'category' => 'Pizza',
            'price' => 300,
            'available' => true,
            'archived' => false,
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $hawaiianPizza->id,
            'inventory_item_id' => $mozzarella->id,
            'qty_per_serving' => 0.2,
            'unit' => 'kg',
        ]);

        // Cart contains 1 Pepperoni Pizza (0.2 kg) + 1 Hawaiian Pizza (0.2 kg) = 0.4 kg needed. Available = 0.3 kg.
        $response = $this->postJson('/api/orders', [
            'customer_name' => 'POS Customer',
            'order_type' => 'Dine-in',
            'items' => [
                [
                    'menu_item_id' => $pepperoniPizza->id,
                    'name' => 'Pepperoni Pizza',
                    'qty' => 1,
                    'unit_price' => 320,
                ],
                [
                    'menu_item_id' => $hawaiianPizza->id,
                    'name' => 'Hawaiian Pizza',
                    'qty' => 1,
                    'unit_price' => 300,
                ],
            ],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['items']);
        $errorMessage = $response->json('errors.items.0');
        $this->assertStringContainsString('Insufficient stock for Mozzarella Cheese', $errorMessage);
        $this->assertStringContainsString('needed 0.4 kg', $errorMessage);
        $this->assertStringContainsString('only 0.3 kg available', $errorMessage);
        $this->assertStringContainsString('short by 0.1 kg', $errorMessage);

        // Ensure no orders were created
        $this->assertEquals(0, Order::query()->count());
    }

    public function test_customer_mobile_order_rejects_whole_cart_with_clear_shortfall_message(): void
    {
        $customerUser = $this->createCustomerUser();
        Sanctum::actingAs($customerUser);

        $cheese = InventoryItem::query()->create([
            'name' => 'Cheddar Cheese',
            'category' => 'Dairy',
            'stock' => 0.5,
            'unit' => 'kg',
            'reorder_level' => 0.1,
            'status' => 'In Stock',
            'date_placed' => now()->toDateString(),
        ]);

        InventoryBatch::query()->create([
            'inventory_item_id' => $cheese->id,
            'batch_no' => 'BATCH-CHED-001',
            'stock' => 0.5,
            'initial_stock' => 0.5,
            'expiry_date' => now()->addDays(5)->toDateString(),
            'date_placed' => now()->toDateString(),
            'status' => 'Good',
        ]);

        $burger = MenuItem::query()->create([
            'name' => 'Cheeseburger',
            'category' => 'Burgers',
            'price' => 150,
            'available' => true,
            'archived' => false,
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $burger->id,
            'inventory_item_id' => $cheese->id,
            'qty_per_serving' => 0.3, // 2 burgers = 0.6 kg needed, only 0.5 kg available
            'unit' => 'kg',
        ]);

        $response = $this->postJson('/api/customer/orders', [
            'full_name' => 'John Doe',
            'phone' => '09123456789',
            'delivery_address' => '123 Main Street',
            'latitude' => 14.5995,
            'longitude' => 120.9842,
            'items' => [
                [
                    'menu_item_id' => $burger->id,
                    'name' => 'Cheeseburger',
                    'qty' => 2,
                    'unit_price' => 150,
                ],
            ],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['items']);
        $errorMessage = $response->json('errors.items.0');
        $this->assertStringContainsString('Insufficient stock for Cheddar Cheese', $errorMessage);
        $this->assertStringContainsString('needed 0.6 kg', $errorMessage);
        $this->assertStringContainsString('only 0.5 kg available', $errorMessage);
        $this->assertStringContainsString('short by 0.1 kg', $errorMessage);

        $this->assertEquals(0, Order::query()->count());
    }

    public function test_post_lock_validation_in_deduct_for_order_rolls_back_transaction(): void
    {
        $service = app(InventoryDeductionService::class);

        $beef = InventoryItem::query()->create([
            'name' => 'Ground Beef',
            'category' => 'Meat',
            'stock' => 1.0,
            'unit' => 'kg',
            'reorder_level' => 0.2,
            'status' => 'In Stock',
            'date_placed' => now()->toDateString(),
        ]);

        $batch = InventoryBatch::query()->create([
            'inventory_item_id' => $beef->id,
            'batch_no' => 'BATCH-BEEF-001',
            'stock' => 1.0,
            'initial_stock' => 1.0,
            'expiry_date' => now()->addDays(5)->toDateString(),
            'date_placed' => now()->toDateString(),
            'status' => 'Good',
        ]);

        $pasta = MenuItem::query()->create([
            'name' => 'Beef Bolognese',
            'category' => 'Pasta',
            'price' => 220,
            'available' => true,
            'archived' => false,
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $pasta->id,
            'inventory_item_id' => $beef->id,
            'qty_per_serving' => 0.8,
            'unit' => 'kg',
        ]);

        $order = Order::query()->create([
            'order_code' => '#ORD-TEST-01',
            'customer_name' => 'Test User',
            'order_type' => 'Dine-in',
            'total' => 440,
            'status' => 'Pending',
        ]);

        OrderItem::query()->create([
            'order_id' => $order->id,
            'menu_item_id' => $pasta->id,
            'name' => 'Beef Bolognese',
            'qty' => 2, // Needs 1.6 kg, but only 1.0 kg is available
            'unit_price' => 220,
            'line_total' => 440,
        ]);

        $this->expectException(ValidationException::class);

        try {
            $service->deductForOrder($order);
        } catch (ValidationException $e) {
            $messages = $e->errors()['items'] ?? [];
            $this->assertNotEmpty($messages);
            $this->assertStringContainsString('Insufficient stock for Ground Beef', $messages[0]);
            $this->assertStringContainsString('needed 1.6 kg', $messages[0]);
            $this->assertStringContainsString('only 1 kg available', $messages[0]);
            $this->assertStringContainsString('short by 0.6 kg', $messages[0]);

            // Ensure stock was not deducted
            $this->assertEquals(1.0, (float) $batch->fresh()->stock);
            $this->assertEquals(1.0, (float) $beef->fresh()->stock);
            throw $e;
        }
    }

    public function test_size_variants_with_unit_conversion_aggregated_correctly(): void
    {
        $admin = $this->createAdminUser();
        Sanctum::actingAs($admin);

        // Tomato Sauce in kg (0.3 kg available)
        $sauce = InventoryItem::query()->create([
            'name' => 'Tomato Sauce',
            'category' => 'Sauces',
            'stock' => 0.3,
            'unit' => 'kg',
            'reorder_level' => 0.05,
            'status' => 'In Stock',
            'date_placed' => now()->toDateString(),
        ]);

        InventoryBatch::query()->create([
            'inventory_item_id' => $sauce->id,
            'batch_no' => 'BATCH-SAUCE-001',
            'stock' => 0.3,
            'initial_stock' => 0.3,
            'expiry_date' => now()->addDays(20)->toDateString(),
            'date_placed' => now()->toDateString(),
            'status' => 'Good',
        ]);

        $pizza = MenuItem::query()->create([
            'name' => 'Margherita Pizza',
            'category' => 'Pizza',
            'price' => 250,
            'has_sizes' => true,
            'available' => true,
            'archived' => false,
        ]);

        $regular = MenuItemSize::query()->create([
            'menu_item_id' => $pizza->id,
            'name' => 'Regular',
            'price' => 250,
        ]);

        $large = MenuItemSize::query()->create([
            'menu_item_id' => $pizza->id,
            'name' => 'Large',
            'price' => 350,
        ]);

        // Regular uses 100 g (= 0.1 kg)
        MenuItemIngredient::query()->create([
            'menu_item_id' => $pizza->id,
            'menu_item_size_id' => $regular->id,
            'inventory_item_id' => $sauce->id,
            'qty_per_serving' => 100,
            'unit' => 'g',
        ]);

        // Large uses 250 g (= 0.25 kg)
        MenuItemIngredient::query()->create([
            'menu_item_id' => $pizza->id,
            'menu_item_size_id' => $large->id,
            'inventory_item_id' => $sauce->id,
            'qty_per_serving' => 250,
            'unit' => 'g',
        ]);

        // Order 1 Regular (100g) + 1 Large (250g) = 350g = 0.35 kg needed. Available = 0.3 kg.
        $response = $this->postJson('/api/orders', [
            'customer_name' => 'Size Customer',
            'order_type' => 'Dine-in',
            'items' => [
                [
                    'menu_item_id' => $pizza->id,
                    'name' => 'Margherita Pizza',
                    'size' => 'Regular',
                    'qty' => 1,
                    'unit_price' => 250,
                ],
                [
                    'menu_item_id' => $pizza->id,
                    'name' => 'Margherita Pizza',
                    'size' => 'Large',
                    'qty' => 1,
                    'unit_price' => 350,
                ],
            ],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['items']);
        $errorMessage = $response->json('errors.items.0');
        $this->assertStringContainsString('Insufficient stock for Tomato Sauce', $errorMessage);
        $this->assertStringContainsString('needed 0.35 kg', $errorMessage);
        $this->assertStringContainsString('only 0.3 kg available', $errorMessage);
        $this->assertStringContainsString('short by 0.05 kg', $errorMessage);
    }

    public function test_pos_order_succeeds_when_whole_cart_demand_is_within_stock(): void
    {
        $admin = $this->createAdminUser();
        Sanctum::actingAs($admin);

        $mozzarella = InventoryItem::query()->create([
            'name' => 'Mozzarella Cheese',
            'category' => 'Dairy',
            'stock' => 0.5,
            'unit' => 'kg',
            'reorder_level' => 0.1,
            'status' => 'In Stock',
            'date_placed' => now()->toDateString(),
        ]);

        $batch = InventoryBatch::query()->create([
            'inventory_item_id' => $mozzarella->id,
            'batch_no' => 'BATCH-MOZZ-002',
            'stock' => 0.5,
            'initial_stock' => 0.5,
            'expiry_date' => now()->addDays(10)->toDateString(),
            'date_placed' => now()->toDateString(),
            'status' => 'Good',
        ]);

        $pepperoniPizza = MenuItem::query()->create([
            'name' => 'Pepperoni Pizza',
            'category' => 'Pizza',
            'price' => 320,
            'available' => true,
            'archived' => false,
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $pepperoniPizza->id,
            'inventory_item_id' => $mozzarella->id,
            'qty_per_serving' => 0.2,
            'unit' => 'kg',
        ]);

        $hawaiianPizza = MenuItem::query()->create([
            'name' => 'Hawaiian Pizza',
            'category' => 'Pizza',
            'price' => 300,
            'available' => true,
            'archived' => false,
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $hawaiianPizza->id,
            'inventory_item_id' => $mozzarella->id,
            'qty_per_serving' => 0.2,
            'unit' => 'kg',
        ]);

        // Cart needs 0.4 kg, 0.5 kg available -> Success!
        $response = $this->postJson('/api/orders', [
            'customer_name' => 'Happy Customer',
            'order_type' => 'Dine-in',
            'items' => [
                [
                    'menu_item_id' => $pepperoniPizza->id,
                    'name' => 'Pepperoni Pizza',
                    'qty' => 1,
                    'unit_price' => 320,
                ],
                [
                    'menu_item_id' => $hawaiianPizza->id,
                    'name' => 'Hawaiian Pizza',
                    'qty' => 1,
                    'unit_price' => 300,
                ],
            ],
        ]);

        $response->assertStatus(201);
        $this->assertEquals(0.1, round((float) $batch->fresh()->stock, 4));
        $this->assertEquals(0.1, round((float) $mozzarella->fresh()->stock, 4));
    }
}
