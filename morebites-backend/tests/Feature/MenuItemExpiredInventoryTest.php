<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\InventoryItem;
use App\Models\MenuItem;
use App\Models\MenuItemIngredient;
use App\Models\User;
use App\Services\InventoryDeductionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MenuItemExpiredInventoryTest extends TestCase
{
    use RefreshDatabase;

    private function createCustomerUser(): User
    {
        $user = User::query()->create([
            'name' => 'Customer Test',
            'email' => 'customer@test.com',
            'phone' => '09123456789',
            'password' => Hash::make('password123'),
            'role' => 'customer',
            'status' => 'Active',
        ]);

        Customer::query()->create([
            'user_id' => $user->id,
            'customer_code' => 'C00001',
            'full_name' => 'Customer Test',
            'phone' => '09123456789',
            'status' => 'ACTIVE',
            'registered_at' => now(),
        ]);

        return $user;
    }

    public function test_menu_item_with_expired_inventory_is_not_serviceable(): void
    {
        $service = app(InventoryDeductionService::class);

        $inventory = InventoryItem::query()->create([
            'name' => 'Expired Milk',
            'category' => 'Dairy',
            'stock' => 50,
            'unit' => 'L',
            'reorder_level' => 5,
            'status' => 'Expired',
            'expiry_date' => now()->subDays(3)->toDateString(),
            'date_placed' => now()->subDays(10)->toDateString(),
        ]);

        $menu = MenuItem::query()->create([
            'name' => 'Milk Tea',
            'category' => 'Beverages',
            'price' => 120,
            'available' => true,
            'archived' => false,
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $menu->id,
            'inventory_item_id' => $inventory->id,
            'qty_per_serving' => 1,
        ]);

        $this->assertFalse($service->canServe($menu));
        $this->assertEquals('expired', $service->unserviceableReason($menu));

        $service->syncMenuAvailability();
        $this->assertFalse($menu->fresh()->available);
    }

    public function test_customer_menu_marks_menu_item_with_expired_inventory_as_unavailable(): void
    {
        $inventory = InventoryItem::query()->create([
            'name' => 'Expired Syrup',
            'category' => 'Flavoring',
            'stock' => 20,
            'unit' => 'bottles',
            'reorder_level' => 2,
            'status' => 'Expired',
            'expiry_date' => now()->subDays(1)->toDateString(),
            'date_placed' => now()->subDays(15)->toDateString(),
        ]);

        $menu = MenuItem::query()->create([
            'name' => 'Caramel Macchiato',
            'category' => 'Beverages',
            'price' => 150,
            'available' => true,
            'archived' => false,
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $menu->id,
            'inventory_item_id' => $inventory->id,
            'qty_per_serving' => 1,
        ]);

        $response = $this->getJson('/api/customer/menu');
        $response->assertStatus(200);

        $item = collect($response->json('data'))->firstWhere('name', 'Caramel Macchiato');
        $this->assertNotNull($item);
        $this->assertFalse($item['available']);
        $this->assertFalse($item['availability']);
    }

    public function test_customer_order_rejects_expired_ingredient(): void
    {
        $user = $this->createCustomerUser();
        Sanctum::actingAs($user);

        $inventory = InventoryItem::query()->create([
            'name' => 'Old Cheese',
            'category' => 'Dairy',
            'stock' => 10,
            'unit' => 'packs',
            'reorder_level' => 2,
            'status' => 'Expired',
            'expiry_date' => now()->subDay()->toDateString(),
            'date_placed' => now()->subDays(14)->toDateString(),
        ]);

        $menu = MenuItem::query()->create([
            'name' => 'Cheesy Pizza',
            'category' => 'Food',
            'price' => 300,
            'available' => true,
            'archived' => false,
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $menu->id,
            'inventory_item_id' => $inventory->id,
            'qty_per_serving' => 1,
        ]);

        $response = $this->postJson('/api/customer/orders', [
            'full_name' => 'Customer Test',
            'phone' => '09123456789',
            'delivery_address' => '123 Test Street, Manila',
            'items' => [
                [
                    'menu_item_id' => $menu->id,
                    'name' => 'Cheesy Pizza',
                    'qty' => 1,
                    'unit_price' => 300,
                ],
            ],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['items']);
    }

    public function test_admin_toggle_rejects_menu_item_with_expired_inventory(): void
    {
        $admin = User::query()->create([
            'name' => 'Admin User',
            'email' => 'admin@test.com',
            'phone' => '09998887766',
            'password' => Hash::make('password123'),
            'role' => 'admin',
            'status' => 'Active',
        ]);
        Sanctum::actingAs($admin);

        $inventory = InventoryItem::query()->create([
            'name' => 'Expired Butter',
            'category' => 'Dairy',
            'stock' => 25,
            'unit' => 'blocks',
            'reorder_level' => 2,
            'status' => 'Expired',
            'expiry_date' => now()->subDays(5)->toDateString(),
            'date_placed' => now()->subDays(20)->toDateString(),
        ]);

        $menu = MenuItem::query()->create([
            'name' => 'Garlic Bread',
            'category' => 'Appetizers',
            'price' => 80,
            'available' => false,
            'archived' => false,
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $menu->id,
            'inventory_item_id' => $inventory->id,
            'qty_per_serving' => 1,
        ]);

        $response = $this->patchJson("/api/menu/{$menu->id}/availability");
        $response->assertStatus(422);
        $this->assertStringContainsString('expired', strtolower($response->json('message')));
        $this->assertFalse($menu->fresh()->available);
    }

    public function test_updating_expiry_date_to_future_restores_serviceability(): void
    {
        $service = app(InventoryDeductionService::class);

        $inventory = InventoryItem::query()->create([
            'name' => 'Coffee Beans',
            'category' => 'Coffee',
            'stock' => 10,
            'unit' => 'kg',
            'reorder_level' => 2,
            'status' => 'Expired',
            'expiry_date' => now()->subDays(2)->toDateString(),
            'date_placed' => now()->subDays(30)->toDateString(),
        ]);

        $menu = MenuItem::query()->create([
            'name' => 'Espresso',
            'category' => 'Coffee',
            'price' => 90,
            'available' => true,
            'archived' => false,
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $menu->id,
            'inventory_item_id' => $inventory->id,
            'qty_per_serving' => 0.05,
        ]);

        $service->syncMenuAvailability();
        $this->assertFalse($menu->fresh()->available);

        // Update expiry date to next month
        $inventory->update([
            'expiry_date' => now()->addDays(30)->toDateString(),
            'status' => 'Sufficient',
        ]);

        $service->syncMenusUsingInventory($inventory->id);
        $this->assertTrue($service->canServe($menu));
        $this->assertTrue($menu->fresh()->available);
    }
}
