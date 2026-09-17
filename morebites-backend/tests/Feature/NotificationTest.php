<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NotificationTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $admin2;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::query()->create([
            'name' => 'Admin User',
            'email' => 'admin@test.com',
            'password' => Hash::make('password'),
            'role' => 'admin',
            'status' => 'Active',
        ]);

        $this->admin2 = User::query()->create([
            'name' => 'Admin User 2',
            'email' => 'admin2@test.com',
            'password' => Hash::make('password'),
            'role' => 'admin',
            'status' => 'Active',
        ]);
    }

    public function test_unread_count_endpoint_returns_zero_initially(): void
    {
        Sanctum::actingAs($this->admin);

        $response = $this->getJson('/api/notifications/unread-count');

        $response->assertStatus(200);
        $response->assertJson(['count' => 0]);
    }

    public function test_creating_order_generates_unread_notification(): void
    {
        Sanctum::actingAs($this->admin);

        $order = Order::query()->create([
            'order_code' => '#ORD-00001',
            'customer_name' => 'John Doe',
            'order_type' => 'Dine-in',
            'total' => 150,
            'status' => 'Preparing',
        ]);

        Notification::createOrderNotification($order);

        $countResponse = $this->getJson('/api/notifications/unread-count');
        $countResponse->assertStatus(200);
        $countResponse->assertJson(['count' => 1]);

        $listResponse = $this->getJson('/api/notifications');
        $listResponse->assertStatus(200);
        $listResponse->assertJsonCount(1, 'data');
        $this->assertTrue($listResponse->json('data.0.unread'));
        $this->assertFalse($listResponse->json('data.0.is_read'));
    }

    public function test_mark_as_read_persists_and_decrements_count(): void
    {
        Sanctum::actingAs($this->admin);

        $notification = Notification::query()->create([
            'title' => 'Test Notification',
            'message' => 'Test Message Body',
            'type' => 'system',
            'tab' => 'System',
            'is_read' => false,
        ]);

        $this->getJson('/api/notifications/unread-count')->assertJson(['count' => 1]);

        $patchResponse = $this->patchJson("/api/notifications/{$notification->id}/read");
        $patchResponse->assertStatus(200);
        $patchResponse->assertJson(['success' => true]);

        $this->getJson('/api/notifications/unread-count')->assertJson(['count' => 0]);
    }

    public function test_read_state_is_isolated_per_user(): void
    {
        $notification = Notification::query()->create([
            'title' => 'Shared Announcement',
            'message' => 'System wide update',
            'type' => 'system',
            'tab' => 'System',
            'user_id' => null,
            'is_read' => false,
        ]);

        // Both admins start with 1 unread notification
        Sanctum::actingAs($this->admin);
        $this->getJson('/api/notifications/unread-count')->assertJson(['count' => 1]);

        Sanctum::actingAs($this->admin2);
        $this->getJson('/api/notifications/unread-count')->assertJson(['count' => 1]);

        // Admin 1 marks the notification as read
        Sanctum::actingAs($this->admin);
        $patch = $this->patchJson("/api/notifications/{$notification->id}/read");
        $patch->assertStatus(200);
        $this->getJson('/api/notifications/unread-count')->assertJson(['count' => 0]);

        $listAdmin1 = $this->getJson('/api/notifications');
        $this->assertTrue($listAdmin1->json('data.0.is_read'));
        $this->assertFalse($listAdmin1->json('data.0.unread'));

        // The shared row on the notifications table MUST NOT be mutated to true
        $this->assertFalse($notification->fresh()->is_read);

        // Admin 2 MUST still see the notification as UNREAD!
        Sanctum::actingAs($this->admin2);
        $this->getJson('/api/notifications/unread-count')->assertJson(['count' => 1]);

        $listAdmin2 = $this->getJson('/api/notifications');
        $this->assertFalse($listAdmin2->json('data.0.is_read'));
        $this->assertTrue($listAdmin2->json('data.0.unread'));

        // Admin 2 now marks it as read
        $this->patchJson("/api/notifications/{$notification->id}/read")->assertStatus(200);
        $this->getJson('/api/notifications/unread-count')->assertJson(['count' => 0]);
    }

    public function test_mark_all_as_read_is_isolated_per_user(): void
    {
        Notification::query()->create([
            'title' => 'Notification 1',
            'message' => 'Body 1',
            'type' => 'order_new',
            'user_id' => null,
            'is_read' => false,
        ]);

        Notification::query()->create([
            'title' => 'Notification 2',
            'message' => 'Body 2',
            'type' => 'low_stock',
            'user_id' => null,
            'is_read' => false,
        ]);

        // Both start with 2
        Sanctum::actingAs($this->admin);
        $this->getJson('/api/notifications/unread-count')->assertJson(['count' => 2]);

        Sanctum::actingAs($this->admin2);
        $this->getJson('/api/notifications/unread-count')->assertJson(['count' => 2]);

        // Admin 1 marks all as read
        Sanctum::actingAs($this->admin);
        $response = $this->postJson('/api/notifications/mark-all-read');
        $response->assertStatus(200);
        $this->getJson('/api/notifications/unread-count')->assertJson(['count' => 0]);

        // Admin 2 STILL has 2 unread!
        Sanctum::actingAs($this->admin2);
        $this->getJson('/api/notifications/unread-count')->assertJson(['count' => 2]);
    }

    public function test_order_notification_has_exactly_one_hash(): void
    {
        $orderWithHash = Order::query()->create([
            'order_code' => '#ORD-00027',
            'customer_name' => 'Alice',
            'order_type' => 'Online Order',
            'total' => 300,
            'status' => 'Preparing',
        ]);

        $notif1 = Notification::createOrderNotification($orderWithHash);
        $this->assertEquals('New order #ORD-00027 received', $notif1->title);
        $this->assertStringNotContainsString('##', $notif1->title);

        $orderWithoutHash = Order::query()->create([
            'order_code' => 'ORD-00028',
            'customer_name' => 'Bob',
            'order_type' => 'Online Order',
            'total' => 200,
            'status' => 'Out for Delivery',
        ]);

        $notif2 = Notification::createOrderNotification($orderWithoutHash);
        $this->assertEquals('Order #ORD-00028 out for delivery', $notif2->title);
        $this->assertStringNotContainsString('##', $notif2->title);
    }

    public function test_customer_order_notification_isolation_and_unread_count(): void
    {
        $customerUser = User::query()->create([
            'name' => 'Jane Customer',
            'email' => 'jane@customer.test',
            'phone' => '09190002222',
            'password' => Hash::make('password'),
            'role' => 'customer',
            'status' => 'Active',
        ]);

        $customer = \App\Models\Customer::query()->create([
            'user_id' => $customerUser->id,
            'customer_code' => 'C-9999',
            'full_name' => 'Jane Customer',
            'phone' => '09190002222',
            'status' => 'ACTIVE',
        ]);

        $order = Order::query()->create([
            'order_code' => '#ORD-00035',
            'customer_id' => $customer->id,
            'customer_name' => 'Jane Customer',
            'order_type' => 'Online Order',
            'total' => 500,
            'status' => 'Out for Delivery',
        ]);

        Notification::createOrderNotification($order);

        // Check customer gets unread count of 1
        Sanctum::actingAs($customerUser);
        $res = $this->getJson('/api/notifications/unread-count');
        $res->assertStatus(200);
        $res->assertJson(['count' => 1]);

        $listRes = $this->getJson('/api/notifications');
        $listRes->assertStatus(200);
        $listRes->assertJsonCount(1, 'data');
        $listRes->assertJsonPath('data.0.message', 'Order #ORD-00035 is out for delivery. Track your rider live.');
        $listRes->assertJsonPath('data.0.unread', true);

        $notifId = $listRes->json('data.0.id');

        // Mark as read by customer
        $readRes = $this->patchJson("/api/notifications/{$notifId}/read");
        $readRes->assertStatus(200);

        // Customer unread count becomes 0
        $resAfter = $this->getJson('/api/notifications/unread-count');
        $resAfter->assertStatus(200);
        $resAfter->assertJson(['count' => 0]);

        // Admin unread count is independent
        Sanctum::actingAs($this->admin);
        $adminRes = $this->getJson('/api/notifications/unread-count');
        $adminRes->assertStatus(200);
        $this->assertGreaterThanOrEqual(1, $adminRes->json('count'));
    }

    public function test_order_notification_idempotency_prevents_duplicate_rows(): void
    {
        $customerUser = User::query()->create([
            'name' => 'Idempotent Customer',
            'email' => 'idempotent@customer.test',
            'password' => Hash::make('password'),
            'role' => 'customer',
            'status' => 'Active',
        ]);

        $customer = \App\Models\Customer::query()->create([
            'user_id' => $customerUser->id,
            'customer_code' => 'C-IDEM',
            'full_name' => 'Idempotent Customer',
            'phone' => '09190003333',
            'status' => 'ACTIVE',
        ]);

        $order = Order::query()->create([
            'order_code' => '#ORD-00099',
            'customer_id' => $customer->id,
            'customer_name' => 'Idempotent Customer',
            'order_type' => 'Online Order',
            'total' => 450,
            'status' => 'Pending',
        ]);

        // Call twice for Pending
        $notif1 = Notification::createOrderNotification($order);
        $notif2 = Notification::createOrderNotification($order);

        $this->assertEquals($notif1->id, $notif2->id);
        $this->assertEquals(1, Notification::query()->whereNull('user_id')->where('data->order_code', '#ORD-00099')->count());
        $this->assertEquals(1, Notification::query()->where('user_id', $customerUser->id)->where('data->order_code', '#ORD-00099')->count());

        // Update to Preparing and call twice
        $order->update(['status' => 'Preparing']);
        $notif3 = Notification::createOrderNotification($order);
        $notif4 = Notification::createOrderNotification($order);

        $this->assertEquals($notif3->id, $notif4->id);
        $this->assertNotEquals($notif1->id, $notif3->id);

        // Total admin notifs for this order should be exactly 2 (Pending + Preparing)
        $this->assertEquals(2, Notification::query()->whereNull('user_id')->where('data->order_code', '#ORD-00099')->count());
        // Total customer notifs for this order should be exactly 2
        $this->assertEquals(2, Notification::query()->where('user_id', $customerUser->id)->where('data->order_code', '#ORD-00099')->count());
    }

    public function test_order_status_transitions_produce_distinct_notifications_for_admin_and_customer(): void
    {
        $customerUser = User::query()->create([
            'name' => 'Flow Customer',
            'email' => 'flow@customer.test',
            'password' => Hash::make('password'),
            'role' => 'customer',
            'status' => 'Active',
        ]);

        $customer = \App\Models\Customer::query()->create([
            'user_id' => $customerUser->id,
            'customer_code' => 'C-FLOW',
            'full_name' => 'Flow Customer',
            'phone' => '09190004444',
            'status' => 'ACTIVE',
        ]);

        $order = Order::query()->create([
            'order_code' => '#ORD-00088',
            'customer_id' => $customer->id,
            'customer_name' => 'Flow Customer',
            'order_type' => 'Online Order',
            'total' => 600,
            'status' => 'Pending',
        ]);

        $statuses = ['Pending', 'Preparing', 'Ready', 'Out for Delivery', 'Completed'];
        foreach ($statuses as $status) {
            $order->update(['status' => $status]);
            Notification::createOrderNotification($order);
        }

        $adminTitles = Notification::query()
            ->whereNull('user_id')
            ->where('data->order_code', '#ORD-00088')
            ->orderBy('id')
            ->pluck('title')
            ->all();

        $this->assertEquals([
            'New order #ORD-00088 received',
            'Order #ORD-00088 is being prepared',
            'Order #ORD-00088 ready for delivery',
            'Order #ORD-00088 out for delivery',
            'Order #ORD-00088 completed',
        ], $adminTitles);

        $customerTitles = Notification::query()
            ->where('user_id', $customerUser->id)
            ->where('data->order_code', '#ORD-00088')
            ->orderBy('id')
            ->pluck('title')
            ->all();

        $this->assertEquals([
            'Order #ORD-00088 placed',
            'Order #ORD-00088 is being prepared',
            'Order #ORD-00088 is ready',
            'Order #ORD-00088 out for delivery',
            'Order #ORD-00088 delivered',
        ], $customerTitles);
    }
}

