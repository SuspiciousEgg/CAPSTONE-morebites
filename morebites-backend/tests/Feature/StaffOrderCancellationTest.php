<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\InventoryBatch;
use App\Models\InventoryItem;
use App\Models\MenuItem;
use App\Models\MenuItemIngredient;
use App\Models\Notification;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use App\Services\InventoryDeductionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StaffOrderCancellationTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;
    private User $driverUser;
    private User $customerUser;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->staff = User::query()->create([
            'name' => 'Admin User',
            'first_name' => 'Admin',
            'last_name' => 'Staff',
            'email' => 'admin@test.com',
            'phone' => '09110000001',
            'password' => Hash::make('password'),
            'role' => 'admin',
            'status' => 'Active',
        ]);

        $this->driverUser = User::query()->create([
            'name' => 'Driver Rider',
            'first_name' => 'Driver',
            'last_name' => 'Rider',
            'email' => 'driver@test.com',
            'phone' => '09110000002',
            'password' => Hash::make('password'),
            'role' => 'driver',
            'status' => 'Active',
        ]);

        $this->customerUser = User::query()->create([
            'name' => 'Customer Juan',
            'first_name' => 'Customer',
            'last_name' => 'Juan',
            'email' => 'customer@test.com',
            'phone' => '09110000003',
            'password' => Hash::make('password'),
            'role' => 'customer',
            'status' => 'Active',
        ]);

        $this->customer = Customer::query()->create([
            'user_id' => $this->customerUser->id,
            'full_name' => 'Customer Juan',
            'phone' => '09110000003',
        ]);
    }

    public function test_staff_can_cancel_order_with_reason_and_restocks_inventory(): void
    {
        $cheese = InventoryItem::query()->create([
            'name' => 'Mozzarella',
            'category' => 'Dairy',
            'stock' => 1.0,
            'unit' => 'kg',
            'reorder_level' => 0.2,
            'status' => 'In Stock',
            'date_placed' => now()->toDateString(),
        ]);

        $batch = InventoryBatch::query()->create([
            'inventory_item_id' => $cheese->id,
            'batch_no' => 'BATCH-MOZZ-01',
            'stock' => 1.0,
            'initial_stock' => 1.0,
            'expiry_date' => now()->addDays(10)->toDateString(),
            'date_placed' => now()->toDateString(),
            'status' => 'Good',
        ]);

        $pizza = MenuItem::query()->create([
            'name' => 'Cheese Pizza',
            'category' => 'Pizza',
            'price' => 200,
            'available' => true,
            'archived' => false,
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $pizza->id,
            'inventory_item_id' => $cheese->id,
            'qty_per_serving' => 0.2,
            'unit' => 'kg',
        ]);

        $order = Order::query()->create([
            'order_code' => '#ORD-CANC-001',
            'customer_id' => $this->customer->id,
            'customer_name' => 'Customer Juan',
            'driver_id' => $this->driverUser->id,
            'order_type' => 'Online Order',
            'total' => 200,
            'status' => 'Preparing',
            'payment_status' => 'Unpaid',
            'inventory_deducted' => false,
        ]);

        OrderItem::query()->create([
            'order_id' => $order->id,
            'menu_item_id' => $pizza->id,
            'name' => 'Cheese Pizza',
            'qty' => 1,
            'unit_price' => 200,
            'line_total' => 200,
        ]);

        // Deduct inventory first
        $service = app(InventoryDeductionService::class);
        $service->deductForOrder($order);

        $order->refresh();
        $this->assertTrue((bool) $order->inventory_deducted);
        $this->assertEquals(0.8, $batch->fresh()->stock);

        // Staff cancels order
        Sanctum::actingAs($this->staff);

        $response = $this->patchJson("/api/orders/{$order->id}/status", [
            'status' => 'Cancelled',
            'cancellation_reason' => 'Bad weather',
        ]);

        $response->assertStatus(200);
        $order->refresh();

        $this->assertEquals('Cancelled', $order->status);
        $this->assertEquals('Bad weather', $order->cancellation_reason);
        $this->assertFalse((bool) $order->inventory_deducted);
        $this->assertEquals(1.0, $batch->fresh()->stock);

        // Verify notifications sent to admin, customer, and driver containing reason
        $this->assertDatabaseHas('notifications', [
            'user_id' => null,
            'type' => 'order_cancelled',
        ]);

        $custNotif = Notification::query()
            ->where('user_id', $this->customerUser->id)
            ->latest('id')
            ->first();
        $this->assertNotNull($custNotif);
        $this->assertStringContainsString('Bad weather', $custNotif->message);

        $driverNotif = Notification::query()
            ->where('user_id', $this->driverUser->id)
            ->latest('id')
            ->first();
        $this->assertNotNull($driverNotif);
        $this->assertStringContainsString('Bad weather', $driverNotif->message);
    }

    public function test_driver_cannot_cancel_order_via_order_controller(): void
    {
        $order = Order::query()->create([
            'order_code' => '#ORD-CANC-002',
            'customer_name' => 'Customer Juan',
            'driver_id' => $this->driverUser->id,
            'order_type' => 'Online Order',
            'total' => 200,
            'status' => 'Preparing',
        ]);

        Sanctum::actingAs($this->driverUser);

        $response = $this->patchJson("/api/orders/{$order->id}/status", [
            'status' => 'Cancelled',
            'cancellation_reason' => 'Customer request',
        ]);

        $response->assertStatus(403);
        $response->assertJson([
            'message' => 'Only staff can cancel orders.',
        ]);
        $this->assertEquals('Preparing', $order->fresh()->status);
    }

    public function test_driver_cannot_cancel_order_via_driver_app_endpoint(): void
    {
        $order = Order::query()->create([
            'order_code' => '#ORD-CANC-003',
            'customer_name' => 'Customer Juan',
            'driver_id' => $this->driverUser->id,
            'order_type' => 'Online Order',
            'total' => 200,
            'status' => 'Assigned',
        ]);

        Sanctum::actingAs($this->driverUser);

        $response = $this->postJson("/api/driver/orders/{$order->id}/status", [
            'status' => 'Cancelled',
        ]);

        $response->assertStatus(403);
        $response->assertJson([
            'message' => 'Only staff can cancel orders.',
        ]);
        $this->assertEquals('Assigned', $order->fresh()->status);
    }

    public function test_customer_cannot_cancel_order(): void
    {
        $order = Order::query()->create([
            'order_code' => '#ORD-CANC-004',
            'customer_name' => 'Customer Juan',
            'order_type' => 'Online Order',
            'total' => 200,
            'status' => 'Preparing',
        ]);

        Sanctum::actingAs($this->customerUser);

        $response = $this->patchJson("/api/orders/{$order->id}/status", [
            'status' => 'Cancelled',
            'cancellation_reason' => 'Customer request',
        ]);

        $response->assertStatus(403);
        $response->assertJson([
            'message' => 'Only staff can cancel orders.',
        ]);
        $this->assertEquals('Preparing', $order->fresh()->status);
    }

    public function test_cancelling_twice_is_idempotent_no_op(): void
    {
        $cheese = InventoryItem::query()->create([
            'name' => 'Mozzarella',
            'category' => 'Dairy',
            'stock' => 1.0,
            'unit' => 'kg',
            'reorder_level' => 0.2,
            'status' => 'In Stock',
            'date_placed' => now()->toDateString(),
        ]);

        $batch = InventoryBatch::query()->create([
            'inventory_item_id' => $cheese->id,
            'batch_no' => 'BATCH-MOZZ-02',
            'stock' => 1.0,
            'initial_stock' => 1.0,
            'expiry_date' => now()->addDays(10)->toDateString(),
            'date_placed' => now()->toDateString(),
            'status' => 'Good',
        ]);

        $pizza = MenuItem::query()->create([
            'name' => 'Cheese Pizza',
            'category' => 'Pizza',
            'price' => 200,
            'available' => true,
            'archived' => false,
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $pizza->id,
            'inventory_item_id' => $cheese->id,
            'qty_per_serving' => 0.2,
            'unit' => 'kg',
        ]);

        $order = Order::query()->create([
            'order_code' => '#ORD-CANC-005',
            'customer_name' => 'Customer Juan',
            'order_type' => 'Dine-in',
            'total' => 200,
            'status' => 'Pending',
            'inventory_deducted' => false,
        ]);

        OrderItem::query()->create([
            'order_id' => $order->id,
            'menu_item_id' => $pizza->id,
            'name' => 'Cheese Pizza',
            'qty' => 1,
            'unit_price' => 200,
            'line_total' => 200,
        ]);

        app(InventoryDeductionService::class)->deductForOrder($order);
        $this->assertEquals(0.8, $batch->fresh()->stock);

        Sanctum::actingAs($this->staff);

        // First cancellation
        $res1 = $this->patchJson("/api/orders/{$order->id}/status", [
            'status' => 'Cancelled',
            'cancellation_reason' => 'Out of stock',
        ]);
        $res1->assertStatus(200);
        $this->assertEquals(1.0, $batch->fresh()->stock);

        // Second cancellation (no-op)
        $res2 = $this->patchJson("/api/orders/{$order->id}/status", [
            'status' => 'Cancelled',
            'cancellation_reason' => 'Out of stock',
        ]);
        $res2->assertStatus(200);
        // Stock should still be 1.0, not double-restocked to 1.2
        $this->assertEquals(1.0, $batch->fresh()->stock);
    }
}
