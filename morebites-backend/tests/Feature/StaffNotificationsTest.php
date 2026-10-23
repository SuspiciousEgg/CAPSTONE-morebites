<?php

namespace Tests\Feature;

use App\Models\InventoryBatch;
use App\Models\InventoryItem;
use App\Models\MenuItem;
use App\Models\MenuItemIngredient;
use App\Models\Notification;
use App\Models\Order;
use App\Models\User;
use App\Services\InventoryDeductionService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StaffNotificationsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $driver;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::query()->create([
            'name' => 'Admin Staff',
            'email' => 'admin@test.com',
            'password' => Hash::make('password'),
            'role' => 'admin',
            'status' => 'Active',
        ]);

        $this->driver = User::query()->create([
            'name' => 'Speedy Rider',
            'first_name' => 'Speedy',
            'last_name' => 'Rider',
            'email' => 'rider@test.com',
            'username' => '09123456789',
            'phone' => '09123456789',
            'password' => Hash::make('password'),
            'role' => 'driver',
            'status' => 'Active',
        ]);
    }

    public function test_rider_issue_report_creates_broadcast_notification_and_deduplicates(): void
    {
        $order = Order::query()->create([
            'order_code' => '#ORD-83001',
            'driver_id' => $this->driver->id,
            'customer_name' => 'Juan Dela Cruz',
            'order_type' => 'Online Order',
            'total' => 350,
            'status' => 'Out for Delivery',
            'payment_method' => 'COD',
            'payment_status' => 'Unpaid',
            'delivery_address' => '123 Main St, Manila',
        ]);

        Sanctum::actingAs($this->driver);

        $response = $this->postJson("/api/driver/orders/{$order->id}/report", [
            'issue' => 'Vehicle Breakdown',
            'notes' => 'Flat tire on highway, will be delayed 20 mins',
        ]);

        $response->assertStatus(200);

        // Verify broadcast notification created for web staff
        $notifs = Notification::query()->where('type', 'rider_issue')->get();
        $this->assertCount(1, $notifs);

        $notif = $notifs->first();
        $this->assertNull($notif->user_id);
        $this->assertEquals('Dispatch', $notif->tab);
        $this->assertEquals('Dispatch', $notif->nav);
        $this->assertStringContainsString('Speedy Rider', $notif->title);
        $this->assertStringContainsString('#ORD-83001', $notif->title);
        $this->assertStringContainsString('Vehicle Breakdown', $notif->message);
        $this->assertStringContainsString('Flat tire', $notif->message);

        // Submitting same report again must be idempotent and not create duplicate rows
        $responseDuplicate = $this->postJson("/api/driver/orders/{$order->id}/report", [
            'issue' => 'Vehicle Breakdown',
            'notes' => 'Flat tire on highway, will be delayed 20 mins',
        ]);
        $responseDuplicate->assertStatus(200);

        $this->assertEquals(1, Notification::query()->where('type', 'rider_issue')->count());

        // Verify web staff (admin) receives it in notification bell
        Sanctum::actingAs($this->admin);
        $bellResponse = $this->getJson('/api/notifications');
        $bellResponse->assertStatus(200);
        $data = $bellResponse->json('data');
        $this->assertTrue(collect($data)->contains(fn ($n) => $n['type'] === 'rider_issue' && $n['tab'] === 'Dispatch'));
    }

    public function test_menu_item_auto_marked_unavailable_fires_only_on_transition(): void
    {
        $inventory = InventoryItem::query()->create([
            'name' => 'Beef Patty',
            'category' => 'Meat',
            'stock' => 0,
            'unit' => 'pcs',
            'reorder_level' => 10,
            'status' => 'Out of Stock',
        ]);

        $menuItem = MenuItem::query()->create([
            'name' => 'Classic Burger',
            'price' => 120,
            'available' => true, // currently active
            'category' => 'Burgers',
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $menuItem->id,
            'inventory_item_id' => $inventory->id,
            'qty_per_serving' => 1,
            'unit' => 'pcs',
        ]);

        // Run syncMenuAvailability when stock is zero
        app(InventoryDeductionService::class)->syncMenuAvailability();

        $this->assertFalse((bool) $menuItem->fresh()->available);

        // Should have created exactly 1 menu_unavailable notification
        $notifs = Notification::query()->where('type', 'menu_unavailable')->get();
        $this->assertCount(1, $notifs);

        $notif = $notifs->first();
        $this->assertNull($notif->user_id);
        $this->assertEquals('Menu', $notif->tab);
        $this->assertEquals('Menu', $notif->nav);
        $this->assertStringContainsString('Classic Burger', $notif->title);
        $this->assertStringContainsString('Beef Patty', $notif->message);

        // Run syncMenuAvailability again while already unavailable
        app(InventoryDeductionService::class)->syncMenuAvailability();

        // Must still be exactly 1 notification (no duplicates on subsequent runs)
        $this->assertEquals(1, Notification::query()->where('type', 'menu_unavailable')->count());
    }

    public function test_low_stock_notification_triggered_on_waste_action(): void
    {
        $inventory = InventoryItem::query()->create([
            'name' => 'Fresh Milk',
            'category' => 'Dairy',
            'stock' => 10,
            'unit' => 'L',
            'reorder_level' => 5,
            'status' => 'Normal',
            'expiry_date' => now()->addDays(5)->toDateString(),
            'date_placed' => now()->subDays(2)->toDateString(),
        ]);

        $batch1 = InventoryBatch::query()->create([
            'inventory_item_id' => $inventory->id,
            'batch_no' => 'BATCH-MILK-1',
            'stock' => 6,
            'original_stock' => 6,
            'unit' => 'L',
            'expiry_date' => now()->addDays(1)->toDateString(),
            'status' => 'Normal',
        ]);

        $batch2 = InventoryBatch::query()->create([
            'inventory_item_id' => $inventory->id,
            'batch_no' => 'BATCH-MILK-2',
            'stock' => 4,
            'original_stock' => 4,
            'unit' => 'L',
            'expiry_date' => now()->addDays(10)->toDateString(),
            'status' => 'Normal',
        ]);

        Sanctum::actingAs($this->admin);

        // Waste batch 1 (6 liters), dropping total inventory stock to 4 (<= reorder_level 5)
        $response = $this->postJson("/api/inventory/batches/{$batch1->id}/expiring/waste", [
            'notes' => 'Sour batch',
        ]);

        $response->assertStatus(200);
        $this->assertEquals(4, (float) $inventory->fresh()->stock);

        $notifs = Notification::query()->where('type', 'low_stock')->get();
        $this->assertCount(1, $notifs);
        $this->assertNull($notifs->first()->user_id);
        $this->assertEquals('Inventory', $notifs->first()->tab);
        $this->assertStringContainsString('Fresh Milk', $notifs->first()->title);
    }

    public function test_low_stock_notification_triggered_on_manual_inventory_adjustment(): void
    {
        $inventory = InventoryItem::query()->create([
            'name' => 'Tomato Sauce',
            'category' => 'Sauces',
            'stock' => 20,
            'unit' => 'cans',
            'reorder_level' => 8,
            'status' => 'Normal',
        ]);

        Sanctum::actingAs($this->admin);

        // Update stock directly to 5 (<= reorder_level 8)
        $response = $this->putJson("/api/inventory/{$inventory->id}", [
            'name' => 'Tomato Sauce',
            'category' => 'Sauces',
            'stock' => 5,
            'unit' => 'cans',
            'reorder_level' => 8,
        ]);

        $response->assertStatus(200);
        $this->assertEquals(5, (float) $inventory->fresh()->stock);

        $notifs = Notification::query()->where('type', 'low_stock')->get();
        $this->assertCount(1, $notifs);
        $this->assertNull($notifs->first()->user_id);
        $this->assertEquals('Inventory', $notifs->first()->tab);
        $this->assertStringContainsString('Tomato Sauce', $notifs->first()->title);
    }

    public function test_low_stock_notification_respects_12_hour_throttle(): void
    {
        Carbon::setTestNow(now());

        $inventory = InventoryItem::query()->create([
            'name' => 'Cooking Oil',
            'category' => 'Oils',
            'stock' => 15,
            'unit' => 'L',
            'reorder_level' => 6,
            'status' => 'Normal',
        ]);

        Sanctum::actingAs($this->admin);

        // Drop stock to 4 (triggers first low-stock alert)
        $this->putJson("/api/inventory/{$inventory->id}", [
            'name' => 'Cooking Oil',
            'category' => 'Oils',
            'stock' => 4,
            'unit' => 'L',
            'reorder_level' => 6,
        ])->assertStatus(200);

        $this->assertEquals(1, Notification::query()->where('type', 'low_stock')->count());

        // Another adjustment 2 hours later (still below reorder_level)
        Carbon::setTestNow(now()->addHours(2));

        $this->putJson("/api/inventory/{$inventory->id}", [
            'name' => 'Cooking Oil',
            'category' => 'Oils',
            'stock' => 3,
            'unit' => 'L',
            'reorder_level' => 6,
        ])->assertStatus(200);

        // Must still be 1 because it's within the 12-hour throttle window
        $this->assertEquals(1, Notification::query()->where('type', 'low_stock')->count());

        // Fast forward 13 hours later (total 15 hours after initial notification)
        Carbon::setTestNow(now()->addHours(13));

        $this->putJson("/api/inventory/{$inventory->id}", [
            'name' => 'Cooking Oil',
            'category' => 'Oils',
            'stock' => 2,
            'unit' => 'L',
            'reorder_level' => 6,
        ])->assertStatus(200);

        // Now throttled window has passed, so a 2nd notification is created
        $this->assertEquals(2, Notification::query()->where('type', 'low_stock')->count());

        Carbon::setTestNow(null);
    }
}
