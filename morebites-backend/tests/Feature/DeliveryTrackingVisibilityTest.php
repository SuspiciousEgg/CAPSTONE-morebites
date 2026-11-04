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
            'allowed_pages' => ['Dispatch', 'Orders', 'Reports'],
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

        // Verify Admin notification created for Dispatch
        $adminNotif = Notification::query()
            ->whereNull('user_id')
            ->where('type', 'rider_issue')
            ->latest('id')
            ->first();
        $this->assertNotNull($adminNotif);
        $this->assertEquals('Dispatch', $adminNotif->nav);
        $this->assertEquals($this->order->id, $adminNotif->data['order_id']);
        $this->assertEquals('Rear tire punctured near crossing', $adminNotif->data['notes']);

        // Verify Customer notification created with non-alarming copy and NO internal issue/notes exposed
        $customerNotif = Notification::query()
            ->where('user_id', $this->customerUser->id)
            ->where('type', 'customer_order_status')
            ->latest('id')
            ->first();
        $this->assertNotNull($customerNotif);
        $this->assertStringContainsString('There’s a delivery update for your order #ORD-11201 — our team is looking into it.', $customerNotif->message);
        $this->assertStringNotContainsString('Vehicle Breakdown', $customerNotif->message);
        $this->assertStringNotContainsString('punctured', $customerNotif->message);
        $this->assertArrayNotHasKey('issue', $customerNotif->data ?? []);
        $this->assertArrayNotHasKey('notes', $customerNotif->data ?? []);
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

    public function test_delivery_transaction_report_includes_address_time_and_incident_or_delivered_remarks(): void
    {
        // Order without incident -> "Delivered successfully"
        Sanctum::actingAs($this->admin);
        $reportRes1 = $this->getJson('/api/reports');
        $reportRes1->assertStatus(200);
        $deliv1 = collect($reportRes1->json('data.delivery_records'))->firstWhere('id', '#ORD-11201');
        $this->assertNotNull($deliv1);
        $this->assertEquals('456 Rizal St, Davao City', $deliv1['address']);
        $this->assertEquals('Delivery completed successfully without any incidents.', $deliv1['remarks']);
        $this->assertNotEmpty($deliv1['delivery_date']);
        $this->assertNotEmpty($deliv1['delivery_time']);

        // Rider reports an "Other" issue with custom notes -> Remarks reflects the specific incident
        Sanctum::actingAs($this->driver);
        $this->postJson("/api/driver/orders/{$this->order->id}/report", [
            'issue' => 'Other',
            'notes' => 'Detour due to bridge maintenance',
        ])->assertStatus(200);

        Sanctum::actingAs($this->admin);
        $reportRes2 = $this->getJson('/api/reports');
        $reportRes2->assertStatus(200);
        $deliv2 = collect($reportRes2->json('data.delivery_records'))->firstWhere('id', '#ORD-11201');
        $this->assertNotNull($deliv2);
        $this->assertEquals('Other: Detour due to bridge maintenance', $deliv2['remarks']);
    }

    public function test_late_delivery_discount_applies_10_percent_per_10_minutes_late_on_food_subtotal_capped_at_50_percent(): void
    {
        // Case 1: 25 minutes late (2 full 10-min blocks -> 20% off food subtotal, coexisting with loyalty points discount)
        $lateOrder = Order::create([
            'order_code' => '#ORD-12201',
            'driver_id' => $this->driver->id,
            'customer_name' => 'Maria Santos',
            'customer_id' => $this->customer->id,
            'order_type' => 'Online Order',
            'total' => 254.00, // 200 subtotal - 10 points_discount + 59 delivery_fee + 5 service_fee
            'points_used' => 10,
            'points_discount' => 10.00,
            'delivery_fee' => 59.00,
            'service_fee' => 5.00,
            'status' => 'Out for Delivery',
            'payment_method' => 'COD',
            'payment_status' => 'Unpaid',
            'delivery_address' => '456 Rizal St, Davao City',
            'estimated_delivery_minutes' => 15,
            'delivery_minutes' => 15,
            'assigned_at' => now()->subMinutes(40), // 40 actual mins vs 15 estimated -> 25 mins late
        ]);

        OrderItem::create([
            'order_id' => $lateOrder->id,
            'menu_item_id' => $this->menuItem->id,
            'name' => 'Signature Pizza',
            'qty' => 1,
            'unit_price' => 200.00,
            'line_total' => 200.00,
        ]);

        Sanctum::actingAs($this->driver);
        $res = $this->patchJson("/api/driver/orders/{$lateOrder->id}/status", [
            'status' => 'Completed',
        ]);
        $res->assertStatus(200);

        $lateOrder->refresh();
        $this->assertEquals(15, $lateOrder->estimated_delivery_minutes);
        $this->assertEquals(25, $lateOrder->late_minutes);
        $this->assertEquals(20, $lateOrder->late_discount_percent);
        $this->assertEquals(40.00, (float) $lateOrder->late_discount); // 20% of 200 food subtotal
        $this->assertEquals(10.00, (float) $lateOrder->points_discount); // loyalty discount preserved
        // New total: (200 - 10 - 40) + 59 + 5 = 214.00
        $this->assertEquals(214.00, (float) $lateOrder->total);

        // Verify customer orders endpoint exposes both independent discount lines for the receipt
        Sanctum::actingAs($this->customerUser);
        $custOrdersRes = $this->getJson('/api/customer/orders');
        $custOrdersRes->assertStatus(200);
        $custOrder = collect($custOrdersRes->json('data'))->firstWhere('id', '#ORD-12201');
        $this->assertNotNull($custOrder);
        $this->assertEquals(10, $custOrder['points_used']);
        $this->assertEquals(10.00, (float) $custOrder['points_discount']);
        $this->assertEquals(25, $custOrder['late_minutes']);
        $this->assertEquals(20, $custOrder['late_discount_percent']);
        $this->assertEquals(40.00, (float) $custOrder['late_discount']);
        $this->assertEquals(214.00, (float) $custOrder['total']);

        // Case 2: 75 minutes late (7 blocks -> capped at 50% max ceiling)
        $veryLateOrder = Order::create([
            'order_code' => '#ORD-12202',
            'driver_id' => $this->driver->id,
            'customer_name' => 'Maria Santos',
            'customer_id' => $this->customer->id,
            'order_type' => 'Online Order',
            'total' => 364.00, // 300 subtotal + 59 delivery_fee + 5 service_fee
            'delivery_fee' => 59.00,
            'service_fee' => 5.00,
            'status' => 'Out for Delivery',
            'payment_method' => 'COD',
            'payment_status' => 'Unpaid',
            'delivery_address' => '456 Rizal St, Davao City',
            'estimated_delivery_minutes' => 15,
            'delivery_minutes' => 15,
            'assigned_at' => now()->subMinutes(90), // 90 actual mins vs 15 estimated -> 75 mins late
        ]);

        OrderItem::create([
            'order_id' => $veryLateOrder->id,
            'menu_item_id' => $this->menuItem->id,
            'name' => 'Family Bundle',
            'qty' => 1,
            'unit_price' => 300.00,
            'line_total' => 300.00,
        ]);

        Sanctum::actingAs($this->driver);
        $this->patchJson("/api/driver/orders/{$veryLateOrder->id}/status", [
            'status' => 'Completed',
        ])->assertStatus(200);

        $veryLateOrder->refresh();
        $this->assertEquals(75, $veryLateOrder->late_minutes);
        $this->assertEquals(50, $veryLateOrder->late_discount_percent); // Capped at 50%
        $this->assertEquals(150.00, (float) $veryLateOrder->late_discount); // 50% of 300 food subtotal
        $this->assertEquals(214.00, (float) $veryLateOrder->total); // (300 - 150) + 59 + 5
    }

    public function test_driver_order_payload_includes_reported_issues_and_allows_completion_after_incident(): void
    {
        Sanctum::actingAs($this->driver);

        // Before report: no reported issue
        $initialRes = $this->getJson("/api/driver/orders/{$this->order->id}");
        $initialRes->assertStatus(200);
        $this->assertFalse($initialRes->json('data.has_reported_issue'));
        $this->assertEmpty($initialRes->json('data.reported_issues'));

        // Driver reports an issue
        $reportRes = $this->postJson("/api/driver/orders/{$this->order->id}/report", [
            'issue' => 'Customer Unreachable',
            'notes' => 'Called 3 times at the gate, no response',
        ]);
        $reportRes->assertStatus(200)
            ->assertJson([
                'has_reported_issue' => true,
            ]);

        // After report: driver order payload reflects the incident flag & details
        $updatedRes = $this->getJson("/api/driver/orders/{$this->order->id}");
        $updatedRes->assertStatus(200);
        $this->assertTrue($updatedRes->json('data.has_reported_issue'));
        $this->assertCount(1, $updatedRes->json('data.reported_issues'));
        $this->assertEquals('Customer Unreachable', $updatedRes->json('data.reported_issues.0.issue'));

        // Delivery can still be completed without hard blocks (Prompt 123 soft acknowledgment principle)
        $completeRes = $this->patchJson("/api/driver/orders/{$this->order->id}/status", [
            'status' => 'Completed',
        ]);
        $completeRes->assertStatus(200);

        $this->order->refresh();
        $this->assertEquals('Completed', $this->order->status);
    }
}
