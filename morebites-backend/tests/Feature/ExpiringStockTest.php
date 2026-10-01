<?php

namespace Tests\Feature;

use App\Models\InventoryDisposition;
use App\Models\InventoryItem;
use App\Models\MenuItem;
use App\Models\MenuItemIngredient;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExpiringStockTest extends TestCase
{
    use RefreshDatabase;

    private function createAdminUser(): User
    {
        return User::factory()->create([
            'role' => 'admin',
            'status' => 'Active',
        ]);
    }

    public function test_overdue_inventory_rejects_kitchen_priority_with_422(): void
    {
        $admin = $this->createAdminUser();

        $inventory = InventoryItem::query()->create([
            'name' => 'Expired Ground Beef',
            'category' => 'Meat',
            'stock' => 15,
            'unit' => 'kg',
            'reorder_level' => 5,
            'status' => 'Expired',
            'expiry_date' => now()->subDays(3)->toDateString(),
            'date_placed' => now()->subDays(10)->toDateString(),
        ]);

        $response = $this->actingAs($admin)->postJson("/api/inventory/{$inventory->id}/expiring/kitchen-priority", [
            'notes' => 'Attempting kitchen use on overdue batch',
        ]);

        $response->assertStatus(422);
        $this->assertEquals(
            'This item is expired and can only be marked as Waste.',
            $response->json('message')
        );
    }

    public function test_overdue_inventory_rejects_promo_with_422(): void
    {
        $admin = $this->createAdminUser();

        $inventory = InventoryItem::query()->create([
            'name' => 'Expired Cheese',
            'category' => 'Dairy',
            'stock' => 20,
            'unit' => 'kg',
            'reorder_level' => 5,
            'status' => 'Expired',
            'expiry_date' => now()->subDays(2)->toDateString(),
            'date_placed' => now()->subDays(10)->toDateString(),
        ]);

        $menu = MenuItem::query()->create([
            'name' => 'Cheese Pizza',
            'category' => 'Pizza',
            'price' => 250,
            'available' => true,
            'archived' => false,
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $menu->id,
            'inventory_item_id' => $inventory->id,
            'qty_per_serving' => 0.2,
        ]);

        $response = $this->actingAs($admin)->postJson("/api/inventory/{$inventory->id}/expiring/promo", [
            'menu_item_id' => $menu->id,
            'discount_percent' => 20,
        ]);

        $response->assertStatus(422);
        $this->assertEquals(
            'This item is expired and can only be marked as Waste.',
            $response->json('message')
        );
    }

    public function test_overdue_inventory_allows_waste(): void
    {
        $admin = $this->createAdminUser();

        $inventory = InventoryItem::query()->create([
            'name' => 'Expired Cream',
            'category' => 'Dairy',
            'stock' => 8,
            'unit' => 'L',
            'reorder_level' => 2,
            'status' => 'Expired',
            'expiry_date' => now()->subDays(4)->toDateString(),
            'date_placed' => now()->subDays(12)->toDateString(),
        ]);

        $response = $this->actingAs($admin)->postJson("/api/inventory/{$inventory->id}/expiring/waste", [
            'notes' => 'Disposed overdue stock.',
        ]);

        $response->assertStatus(200);
        $this->assertEquals(0, (float) $inventory->fresh()->stock);
        $this->assertEquals('Expired', $inventory->fresh()->status);
        $this->assertEquals(
            InventoryDisposition::WASTE,
            $inventory->fresh()->dispositions()->latest('id')->first()?->disposition
        );
    }

    public function test_overdue_inventory_allows_resolve(): void
    {
        $admin = $this->createAdminUser();

        $inventory = InventoryItem::query()->create([
            'name' => 'Discarded Tomatoes',
            'category' => 'Vegetables',
            'stock' => 5,
            'unit' => 'kg',
            'reorder_level' => 2,
            'status' => 'Expired',
            'expiry_date' => now()->subDays(1)->toDateString(),
            'date_placed' => now()->subDays(7)->toDateString(),
        ]);

        $response = $this->actingAs($admin)->postJson("/api/inventory/{$inventory->id}/expiring/resolve");

        $response->assertStatus(200);
        $this->assertEquals(
            InventoryDisposition::RESOLVED,
            $inventory->fresh()->dispositions()->latest('id')->first()?->disposition
        );
    }

    public function test_non_overdue_inventory_allows_kitchen_priority_and_promo(): void
    {
        $admin = $this->createAdminUser();

        $inventory = InventoryItem::query()->create([
            'name' => 'Fresh Mozzarella',
            'category' => 'Dairy',
            'stock' => 12,
            'unit' => 'kg',
            'reorder_level' => 3,
            'status' => 'Expiring Soon',
            'expiry_date' => now()->addDays(2)->toDateString(),
            'date_placed' => now()->subDays(5)->toDateString(),
        ]);

        $menu = MenuItem::query()->create([
            'name' => 'Margherita Pizza',
            'category' => 'Pizza',
            'price' => 280,
            'available' => true,
            'archived' => false,
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $menu->id,
            'inventory_item_id' => $inventory->id,
            'qty_per_serving' => 0.25,
        ]);

        // Kitchen priority allowed
        $kitchenRes = $this->actingAs($admin)->postJson("/api/inventory/{$inventory->id}/expiring/kitchen-priority", [
            'notes' => 'Prioritize for dinner rush',
        ]);
        $kitchenRes->assertStatus(200);
        $this->assertEquals(
            InventoryDisposition::KITCHEN_PRIORITY,
            $inventory->fresh()->dispositions()->latest('id')->first()?->disposition
        );

        // Promo allowed
        $promoRes = $this->actingAs($admin)->postJson("/api/inventory/{$inventory->id}/expiring/promo", [
            'menu_item_id' => $menu->id,
            'discount_percent' => 15,
        ]);
        $promoRes->assertStatus(200);
        $this->assertEquals(
            InventoryDisposition::PROMO,
            $inventory->fresh()->dispositions()->latest('id')->first()?->disposition
        );
    }
}
