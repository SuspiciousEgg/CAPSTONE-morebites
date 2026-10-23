<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RiderCustomerRatingTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private User $admin;
    private User $cashierWithCustomers;
    private User $driver;
    private User $otherDriver;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');

        $this->owner = User::query()->create([
            'name' => 'Owner User',
            'email' => 'owner@test.com',
            'password' => Hash::make('password'),
            'role' => 'super_admin',
            'status' => 'Active',
        ]);

        $this->admin = User::query()->create([
            'name' => 'Admin User',
            'email' => 'admin@test.com',
            'password' => Hash::make('password'),
            'role' => 'admin',
            'status' => 'Active',
        ]);

        $this->cashierWithCustomers = User::query()->create([
            'name' => 'Cashier User',
            'email' => 'cashier@test.com',
            'password' => Hash::make('password'),
            'role' => 'cashier',
            'status' => 'Active',
            'allowed_pages' => ['Dashboard', 'Orders', 'Customers'],
        ]);

        $this->driver = User::query()->create([
            'name' => 'Assigned Driver',
            'email' => 'driver@test.com',
            'username' => '09111111111',
            'phone' => '09111111111',
            'password' => Hash::make('password'),
            'role' => 'driver',
            'status' => 'Active',
        ]);

        $this->otherDriver = User::query()->create([
            'name' => 'Other Driver',
            'email' => 'other_driver@test.com',
            'username' => '09222222222',
            'phone' => '09222222222',
            'password' => Hash::make('password'),
            'role' => 'driver',
            'status' => 'Active',
        ]);

        $customerUser = User::query()->create([
            'name' => 'Customer Juan',
            'email' => 'juan@test.com',
            'password' => Hash::make('password'),
            'role' => 'customer',
            'status' => 'Active',
        ]);

        $this->customer = Customer::query()->create([
            'user_id' => $customerUser->id,
            'customer_code' => 'CUST-001',
            'full_name' => 'Customer Juan',
            'email' => 'juan@test.com',
            'phone' => '09333333333',
            'status' => 'ACTIVE',
            'registered_at' => now()->subMonths(2),
        ]);
    }

    public function test_driver_can_confirm_delivery_with_optional_customer_rating(): void
    {
        $order = Order::query()->create([
            'order_code' => '#ORD-84001',
            'driver_id' => $this->driver->id,
            'customer_id' => $this->customer->id,
            'customer_name' => $this->customer->full_name,
            'order_type' => 'Online Order',
            'total' => 450,
            'status' => 'Out for Delivery',
            'payment_method' => 'COD',
            'payment_status' => 'Unpaid',
            'delivery_address' => '123 Test St',
        ]);

        Sanctum::actingAs($this->driver);
        $file = UploadedFile::fake()->create('proof.jpg', 100, 'image/jpeg');

        $response = $this->postJson("/api/driver/orders/{$order->id}/status", [
            'status' => 'Delivered',
            'proof_of_delivery' => $file,
            'customer_rating' => 4,
        ]);

        $response->assertStatus(200);
        $this->assertEquals('Completed', $order->fresh()->status);
        $this->assertEquals(4, $order->fresh()->customer_rating);
    }

    public function test_customer_rating_is_optional_and_rider_can_skip_it(): void
    {
        $order = Order::query()->create([
            'order_code' => '#ORD-84002',
            'driver_id' => $this->driver->id,
            'customer_id' => $this->customer->id,
            'customer_name' => $this->customer->full_name,
            'order_type' => 'Online Order',
            'total' => 300,
            'status' => 'Out for Delivery',
            'payment_method' => 'COD',
            'payment_status' => 'Unpaid',
            'delivery_address' => '123 Test St',
        ]);

        Sanctum::actingAs($this->driver);
        $file = UploadedFile::fake()->create('proof.jpg', 100, 'image/jpeg');

        // Confirm delivery without customer_rating
        $response = $this->postJson("/api/driver/orders/{$order->id}/status", [
            'status' => 'Delivered',
            'proof_of_delivery' => $file,
        ]);

        $response->assertStatus(200);
        $this->assertEquals('Completed', $order->fresh()->status);
        $this->assertNull($order->fresh()->customer_rating);
    }

    public function test_only_assigned_driver_can_submit_delivery_confirmation_and_rating(): void
    {
        $order = Order::query()->create([
            'order_code' => '#ORD-84003',
            'driver_id' => $this->driver->id,
            'customer_id' => $this->customer->id,
            'customer_name' => $this->customer->full_name,
            'order_type' => 'Online Order',
            'total' => 500,
            'status' => 'Out for Delivery',
        ]);

        Sanctum::actingAs($this->otherDriver);

        $response = $this->postJson("/api/driver/orders/{$order->id}/status", [
            'status' => 'Delivered',
            'customer_rating' => 5,
        ]);

        $response->assertStatus(403);
    }

    public function test_customer_rating_rejected_if_not_delivered_status(): void
    {
        $order = Order::query()->create([
            'order_code' => '#ORD-84004',
            'driver_id' => $this->driver->id,
            'customer_id' => $this->customer->id,
            'customer_name' => $this->customer->full_name,
            'order_type' => 'Online Order',
            'total' => 500,
            'status' => 'Assigned',
        ]);

        Sanctum::actingAs($this->driver);

        $response = $this->postJson("/api/driver/orders/{$order->id}/status", [
            'status' => 'Picked up',
            'customer_rating' => 4,
        ]);

        $response->assertStatus(422);
    }

    public function test_customer_rating_must_be_whole_number_from_1_to_5(): void
    {
        $order = Order::query()->create([
            'order_code' => '#ORD-84005',
            'driver_id' => $this->driver->id,
            'customer_id' => $this->customer->id,
            'customer_name' => $this->customer->full_name,
            'order_type' => 'Online Order',
            'total' => 500,
            'status' => 'Out for Delivery',
        ]);

        Sanctum::actingAs($this->driver);

        // Rating 0 should fail
        $this->postJson("/api/driver/orders/{$order->id}/status", [
            'status' => 'Delivered',
            'customer_rating' => 0,
        ])->assertStatus(422);

        // Rating 6 should fail
        $this->postJson("/api/driver/orders/{$order->id}/status", [
            'status' => 'Delivered',
            'customer_rating' => 6,
        ])->assertStatus(422);
    }

    public function test_rating_cannot_be_changed_after_order_is_completed(): void
    {
        $order = Order::query()->create([
            'order_code' => '#ORD-84006',
            'driver_id' => $this->driver->id,
            'customer_id' => $this->customer->id,
            'customer_name' => $this->customer->full_name,
            'order_type' => 'Online Order',
            'total' => 500,
            'status' => 'Completed',
            'customer_rating' => 3,
        ]);

        Sanctum::actingAs($this->driver);

        $response = $this->postJson("/api/driver/orders/{$order->id}/status", [
            'status' => 'Delivered',
            'customer_rating' => 5,
        ]);

        $response->assertStatus(422);
        $this->assertEquals(3, $order->fresh()->customer_rating);
    }

    public function test_customer_details_modal_shows_rider_rating_average_and_count(): void
    {
        // Create 2 rated orders (e.g. 5 and 4 -> 4.5 avg from 2 deliveries)
        Order::query()->create([
            'order_code' => '#ORD-84007',
            'driver_id' => $this->driver->id,
            'customer_id' => $this->customer->id,
            'customer_name' => $this->customer->full_name,
            'order_type' => 'Online Order',
            'total' => 400,
            'status' => 'Completed',
            'customer_rating' => 5,
        ]);

        Order::query()->create([
            'order_code' => '#ORD-84008',
            'driver_id' => $this->driver->id,
            'customer_id' => $this->customer->id,
            'customer_name' => $this->customer->full_name,
            'order_type' => 'Online Order',
            'total' => 600,
            'status' => 'Completed',
            'customer_rating' => 4,
        ]);

        // Unrated order should not skew the count or average
        Order::query()->create([
            'order_code' => '#ORD-84009',
            'driver_id' => $this->driver->id,
            'customer_id' => $this->customer->id,
            'customer_name' => $this->customer->full_name,
            'order_type' => 'Online Order',
            'total' => 200,
            'status' => 'Completed',
            'customer_rating' => null,
        ]);

        // Walk-in order must be ignored
        Order::query()->create([
            'order_code' => '#ORD-84010',
            'customer_id' => $this->customer->id,
            'customer_name' => $this->customer->full_name,
            'order_type' => 'Dine-in',
            'total' => 150,
            'status' => 'Completed',
        ]);

        // Owner can view details
        Sanctum::actingAs($this->owner);
        $resOwner = $this->getJson("/api/customers/{$this->customer->id}");
        $resOwner->assertStatus(200);
        $this->assertEquals(4.5, $resOwner->json('data.rider_rating_avg'));
        $this->assertEquals(2, $resOwner->json('data.rider_rating_count'));
        $this->assertEquals('Rider rating: 4.5 average from 2 deliveries', $resOwner->json('data.rider_rating_text'));

        // Admin can view details
        Sanctum::actingAs($this->admin);
        $resAdmin = $this->getJson("/api/customers/{$this->customer->id}");
        $resAdmin->assertStatus(200);
        $this->assertEquals('Rider rating: 4.5 average from 2 deliveries', $resAdmin->json('data.rider_rating_text'));

        // Cashier with Customers page access can view details
        Sanctum::actingAs($this->cashierWithCustomers);
        $resCashier = $this->getJson("/api/customers/{$this->customer->id}");
        $resCashier->assertStatus(200);
        $this->assertEquals('Rider rating: 4.5 average from 2 deliveries', $resCashier->json('data.rider_rating_text'));
    }

    public function test_customer_details_shows_no_ratings_yet_when_empty(): void
    {
        Sanctum::actingAs($this->owner);
        $res = $this->getJson("/api/customers/{$this->customer->id}");
        $res->assertStatus(200);
        $this->assertEquals(0, $res->json('data.rider_rating_count'));
        $this->assertNull($res->json('data.rider_rating_avg'));
        $this->assertEquals('No ratings yet', $res->json('data.rider_rating_text'));
    }

    public function test_customer_app_never_exposes_customer_rating(): void
    {
        $order = Order::query()->create([
            'order_code' => '#ORD-84011',
            'driver_id' => $this->driver->id,
            'customer_id' => $this->customer->id,
            'customer_name' => $this->customer->full_name,
            'order_type' => 'Online Order',
            'total' => 500,
            'status' => 'Completed',
            'customer_rating' => 2,
        ]);

        $customerUser = User::query()->find($this->customer->user_id);
        Sanctum::actingAs($customerUser);

        $res = $this->getJson('/api/customer/orders');
        $res->assertStatus(200);

        $orderJson = collect($res->json('data'))->firstWhere('id', '#ORD-84011');
        $this->assertNotNull($orderJson);
        $this->assertArrayNotHasKey('customer_rating', $orderJson);

        $meRes = $this->getJson('/api/customer/me');
        $meRes->assertStatus(200);
        $this->assertArrayNotHasKey('customer_rating', $meRes->json('user'));
        $this->assertArrayNotHasKey('rider_rating_text', $meRes->json('user'));
    }
}

