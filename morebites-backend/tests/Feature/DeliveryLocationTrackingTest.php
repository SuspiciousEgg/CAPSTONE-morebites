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

    public function test_live_dispatch_map_receives_driver_real_gps_when_out_for_delivery_even_in_cdo(): void
    {
        $driver = User::factory()->create([
            'role' => 'driver',
            'status' => 'Active',
            'current_lat' => 8.4772,
            'current_lng' => 124.6487,
        ]);

        $order = Order::query()->create([
            'order_code' => Order::generateOrderCode(),
            'customer_name' => 'CDO Customer',
            'order_type' => 'Online Order',
            'status' => 'Out for Delivery',
            'driver_id' => $driver->id,
            'dest_lat' => 7.6150,
            'dest_lng' => 124.9950,
        ]);

        // Driver reports their real GPS coordinates (Cagayan de Oro)
        $this->actingAs($driver)->patchJson("/api/deliveries/{$order->id}/location", [
            'latitude' => 8.4772,
            'longitude' => 124.6487,
        ])->assertOk();

        $order->refresh();
        $this->assertEquals(8.4772, (float) $order->current_lat);
        $this->assertEquals(124.6487, (float) $order->current_lng);

        // Staff views dispatch live fleet
        $admin = User::factory()->create(['role' => 'superadmin', 'allowed_pages' => ['Dispatch']]);
        $dispatchRes = $this->actingAs($admin)->getJson('/api/dispatch');
        $dispatchRes->assertOk();

        $deliveries = collect($dispatchRes->json('data.deliveries'));
        $targetDelivery = $deliveries->firstWhere('id', $order->order_code);
        $this->assertNotNull($targetDelivery);

        // Web map rider coordinate matches driver real GPS, not store fallback
        $this->assertEquals(8.4772, (float) $targetDelivery['rider']['latitude']);
        $this->assertEquals(124.6487, (float) $targetDelivery['rider']['longitude']);
        $this->assertEquals(8.4772, (float) $targetDelivery['rider_lat']);
        $this->assertEquals(124.6487, (float) $targetDelivery['rider_lng']);
    }

    public function test_order_tracking_steps_and_rider_map_only_activate_on_real_backend_state_and_rider_acceptance(): void
    {
        $customerUser = User::factory()->create(['role' => 'customer']);
        $customer = Customer::query()->create([
            'user_id' => $customerUser->id,
            'full_name' => 'Tracking Customer',
            'phone' => '09171234567',
        ]);

        $driver = User::factory()->create([
            'role' => 'driver',
            'status' => 'Active',
            'current_lat' => 8.4772,
            'current_lng' => 124.6487,
            'location_updated_at' => now(),
        ]);

        // 1. Order just placed (Pending): no step is complete/active, no rider marker or route
        $order = Order::query()->create([
            'order_code' => Order::generateOrderCode(),
            'customer_id' => $customer->id,
            'customer_name' => 'Tracking Customer',
            'order_type' => 'Online Order',
            'status' => 'Pending',
            'dest_lat' => 7.6150,
            'dest_lng' => 124.9950,
            'delivery_distance_km' => 1.69,
            'delivery_minutes' => 15,
        ]);

        $pendingTrack = $this->actingAs($customerUser)->getJson("/api/customer/orders/{$order->id}/tracking");
        $pendingTrack->assertOk()
            ->assertJsonPath('data.status', 'Pending')
            ->assertJsonPath('data.rider_accepted', false)
            ->assertJsonPath('data.rider', null)
            ->assertJsonPath('data.route', [])
            ->assertJsonPath('data.eta_mins', null);

        $pendingTimeline = collect($pendingTrack->json('data.timeline'));
        $this->assertTrue($pendingTimeline->every(fn ($step) => $step['state'] === 'pending' && $step['timestamp'] === null));

        $pendingPoll = $this->actingAs($customerUser)->getJson("/api/deliveries/{$order->id}/location");
        $pendingPoll->assertOk()
            ->assertJsonPath('data.rider_accepted', false)
            ->assertJsonPath('data.latitude', null)
            ->assertJsonPath('data.longitude', null)
            ->assertJsonPath('data.eta_mins', null);

        // 2. Staff confirms / marks Preparing: Order Confirmed is complete, Preparing is active, still no rider/route
        $order->update(['status' => 'Preparing']);
        $prepTrack = $this->actingAs($customerUser)->getJson("/api/customer/orders/{$order->id}/tracking");
        $prepTimeline = collect($prepTrack->json('data.timeline'));
        $this->assertEquals('complete', $prepTimeline->firstWhere('title', 'Order Confirmed')['state']);
        $this->assertEquals('active', $prepTimeline->firstWhere('title', 'Preparing')['state']);
        $this->assertEquals('pending', $prepTimeline->firstWhere('title', 'Out For Delivery')['state']);

        // 3. Admin assigns rider (Assigned), but rider has NOT accepted yet:
        //    No rider marker or route from driver's stale CDO coords, and Out For Delivery stays pending with no timestamp
        $order->update([
            'driver_id' => $driver->id,
            'status' => 'Assigned',
            'assigned_at' => now(),
        ]);

        $assignedTrack = $this->actingAs($customerUser)->getJson("/api/customer/orders/{$order->id}/tracking");
        $assignedTrack->assertOk()
            ->assertJsonPath('data.rider_accepted', false)
            ->assertJsonPath('data.rider', null)
            ->assertJsonPath('data.route', [])
            ->assertJsonPath('data.eta_mins', null);

        $assignedTimeline = collect($assignedTrack->json('data.timeline'));
        $outStep = $assignedTimeline->firstWhere('title', 'Out For Delivery');
        $this->assertEquals('pending', $outStep['state']);
        $this->assertNull($outStep['timestamp']);

        $assignedPoll = $this->actingAs($customerUser)->getJson("/api/deliveries/{$order->id}/location");
        $assignedPoll->assertOk()
            ->assertJsonPath('data.rider_accepted', false)
            ->assertJsonPath('data.latitude', null)
            ->assertJsonPath('data.longitude', null);

        // 4. Rider explicitly accepts/picks up the delivery (Picked Up / Out for Delivery):
        //    Rider marker, route, ETA, and Out For Delivery step now activate
        $this->actingAs($driver)->patchJson("/api/driver/orders/{$order->id}/status", [
            'status' => 'Out for Delivery',
        ])->assertOk();

        $acceptedTrack = $this->actingAs($customerUser)->getJson("/api/customer/orders/{$order->id}/tracking");
        $acceptedTrack->assertOk()
            ->assertJsonPath('data.rider_accepted', true);
        $this->assertNotNull($acceptedTrack->json('data.rider'));
        $this->assertNotEmpty($acceptedTrack->json('data.route'));
        $this->assertNotNull($acceptedTrack->json('data.eta_mins'));

        $acceptedTimeline = collect($acceptedTrack->json('data.timeline'));
        $this->assertEquals('active', $acceptedTimeline->firstWhere('title', 'Out For Delivery')['state']);
        $this->assertNotNull($acceptedTimeline->firstWhere('title', 'Out For Delivery')['timestamp']);
    }
}
