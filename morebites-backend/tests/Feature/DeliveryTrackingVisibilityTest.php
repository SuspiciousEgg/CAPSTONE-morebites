<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\MenuItem;
use App\Models\Notification;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use App\Services\TrackingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DeliveryTrackingVisibilityTest extends TestCase
{
    use RefreshDatabase;

    private User $driver;
    private User $admin;
    private User $customerUser;
    private Customer $customer;
    private Order $order;
    private MenuItem $menuItem;

    protected function setUp(): void
    {
        parent::setUp();

        $this->driver = User::factory()->create([
            'name' => 'Speedy Rider',
            'role' => 'driver',
            'phone' => '+63 912 345 6789',
            'photo' => 'avatars/rider_speedy.jpg',
            'status' => 'Active',
            'current_lat' => 7.6100,
            'current_lng' => 124.9900,
        ]);

        $this->admin = User::factory()->create([
            'name' => 'Admin Staff',
            'role' => 'superadmin',
            'allowed_pages' => ['Dispatch', 'Orders'],
        ]);

        $this->customerUser = User::factory()->create([
            'name' => 'Maria Santos',
            'role' => 'customer',
            'phone' => '+63 999 888 7777',
        ]);

        $this->customer = Customer::create([
            'user_id' => $this->customerUser->id,
            'full_name' => 'Maria Santos',
            'first_name' => 'Maria',
            'last_name' => 'Santos',
            'email' => $this->customerUser->email,
            'phone' => '+63 999 888 7777',
            'delivery_address' => '456 Rizal St, Davao City',
        ]);

        $this->menuItem = MenuItem::create([
            'name' => 'Spicy Wings',
            'price' => 180,
            'image' => 'menu/spicy_wings.jpg',
            'category' => 'Chicken',
            'available' => true,
            'archived' => false,
        ]);

        $this->order = Order::create([
            'order_code' => '#ORD-11201',
            'driver_id' => $this->driver->id,
            'customer_name' => 'Maria Santos',
            'customer_id' => $this->customer->id,
            'order_type' => 'Online Order',
            'total' => 220,
            'status' => 'Out for Delivery',
            'payment_method' => 'COD',
            'payment_status' => 'Unpaid',
            'delivery_address' => '456 Rizal St, Davao City',
            'dest_lat' => 7.6150,
            'dest_lng' => 124.9950,
        ]);

        OrderItem::create([
            'order_id' => $this->order->id,
            'menu_item_id' => $this->menuItem->id,
            'name' => 'Spicy Wings',
            'qty' => 1,
            'unit_price' => 180,
            'line_total' => 180,
        ]);
    }

    public function test_driver_can_report_expanded_issue_types_and_staff_sees_timestamped_log(): void
    {
        Sanctum::actingAs($this->driver);

        $response = $this->postJson("/api/driver/orders/{$this->order->id}/report", [
            'issue' => 'Vehicle Breakdown / Flat Tire',
            'notes' => 'Rear tire punctured near crossing',
        ]);
        $response->assertStatus(200);

        // Verify issue in Order model
        $issues = $this->order->reportedIssues();
        $this->assertCount(1, $issues);
        $this->assertEquals('Vehicle Breakdown / Flat Tire', $issues[0]['issue']);
        $this->assertEquals('Rear tire punctured near crossing', $issues[0]['notes']);
        $this->assertEquals('Speedy Rider', $issues[0]['driver_name']);
        $this->assertNotNull($issues[0]['time_label']);

        // Verify dispatch monitoring endpoint returns reported_issues and rider_photo
        Sanctum::actingAs($this->admin);
        $dispatchRes = $this->getJson('/api/dispatch');
        $dispatchRes->assertStatus(200);

        $monitoring = collect($dispatchRes->json('data.monitoring'));
        $target = $monitoring->firstWhere('id', '#ORD-11201');
        $this->assertNotNull($target);
        $this->assertNotEmpty($target['reported_issues']);
        $this->assertEquals('Vehicle Breakdown / Flat Tire', $target['reported_issues'][0]['issue']);
        $this->assertStringContainsString('rider_speedy.jpg', $target['driver_photo']);
    }

    public function test_customer_order_payload_includes_item_real_photo_and_rider_photo(): void
    {
        Sanctum::actingAs($this->customerUser);

        $res = $this->getJson("/api/customer/orders");
        $res->assertStatus(200);

        $orders = $res->json('data');
        $this->assertNotEmpty($orders);
        $orderData = $orders[0];

        // Item photo check
        $this->assertNotEmpty($orderData['items']);
        $this->assertStringContainsString('spicy_wings.jpg', $orderData['items'][0]['image']);

        // Rider photo check
        $this->assertNotNull($orderData['driver_photo']);
        $this->assertStringContainsString('rider_speedy.jpg', $orderData['driver_photo']);
        $this->assertEquals($orderData['driver_photo'], $orderData['rider_photo']);
    }
}
