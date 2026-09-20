<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DeliveryLocationTrackingTest extends TestCase
{
    use RefreshDatabase;

    public function test_assigned_driver_can_update_delivery_location(): void
    {
        $driver = User::factory()->create([
            'role' => 'driver',
            'status' => 'Active',
        ]);

        $order = Order::query()->create([
            'order_code' => Order::generateOrderCode(),
            'customer_name' => 'Alice Test',
            'order_type' => 'Online Order',
            'status' => 'Out for Delivery',
            'driver_id' => $driver->id,
            'dest_lat' => 7.6100,
            'dest_lng' => 125.0000,
        ]);

        $response = $this->actingAs($driver)->patchJson("/api/deliveries/{$order->id}/location", [
            'latitude' => 7.6150,
            'longitude' => 124.9950,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.latitude', 7.615)
            ->assertJsonPath('data.longitude', 124.995);

        $order->refresh();
        $this->assertEquals(7.615, (float) $order->current_lat);
        $this->assertEquals(124.995, (float) $order->current_lng);

        $driver->refresh();
        $this->assertEquals(7.615, (float) $driver->current_lat);
        $this->assertEquals(124.995, (float) $driver->current_lng);
        $this->assertNotNull($driver->location_updated_at);
    }

    public function test_unassigned_driver_cannot_update_delivery_location(): void
    {
        $driver = User::factory()->create(['role' => 'driver', 'status' => 'Active']);
        $otherDriver = User::factory()->create(['role' => 'driver', 'status' => 'Active']);

        $order = Order::query()->create([
            'order_code' => Order::generateOrderCode(),
            'customer_name' => 'Bob Test',
            'order_type' => 'Online Order',
            'status' => 'Out for Delivery',
            'driver_id' => $driver->id,
        ]);

        $response = $this->actingAs($otherDriver)->patchJson("/api/deliveries/{$order->id}/location", [
            'latitude' => 7.6150,
            'longitude' => 124.9950,
        ]);

        $response->assertStatus(403);
    }

    public function test_customer_can_poll_delivery_location(): void
    {
        $customerUser = User::factory()->create(['role' => 'customer']);
        $customer = Customer::query()->create([
            'user_id' => $customerUser->id,
            'full_name' => 'Charlie Customer',
            'phone' => '09123456789',
        ]);

        $driver = User::factory()->create([
            'role' => 'driver',
            'status' => 'Active',
            'current_lat' => 7.6120,
            'current_lng' => 124.9920,
            'location_updated_at' => now(),
        ]);

        $order = Order::query()->create([
            'order_code' => Order::generateOrderCode(),
            'customer_id' => $customer->id,
            'customer_name' => 'Charlie Customer',
            'order_type' => 'Online Order',
            'status' => 'Out for Delivery',
            'driver_id' => $driver->id,
            'current_lat' => 7.6135,
            'current_lng' => 124.9945,
        ]);

        $response = $this->actingAs($customerUser)->getJson("/api/deliveries/{$order->id}/location");

        $response->assertOk()
            ->assertJsonPath('data.delivery_id', $order->id)
            ->assertJsonPath('data.status', 'Out for Delivery')
            ->assertJsonPath('data.latitude', 7.6135)
            ->assertJsonPath('data.longitude', 124.9945);
    }

    public function test_unauthorized_customer_cannot_poll_another_customers_delivery_location(): void
    {
        $customerUserA = User::factory()->create(['role' => 'customer']);
        $customerUserB = User::factory()->create(['role' => 'customer']);

        $customerA = Customer::query()->create([
            'user_id' => $customerUserA->id,
            'full_name' => 'User A',
            'phone' => '09123456781',
        ]);

        $order = Order::query()->create([
            'order_code' => Order::generateOrderCode(),
            'customer_id' => $customerA->id,
            'customer_name' => 'User A',
            'order_type' => 'Online Order',
            'status' => 'Out for Delivery',
        ]);

        $response = $this->actingAs($customerUserB)->getJson("/api/deliveries/{$order->id}/location");

        $response->assertStatus(403);
    }
}
