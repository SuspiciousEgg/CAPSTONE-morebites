<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Order;
use App\Models\StoreSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class StoreSettingPrepTimeTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected User $cashier;
    protected User $customer;
    protected User $driver;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::query()->create([
            'name' => 'Owner Admin',
            'email' => 'owner@morebites.test',
            'phone' => '+639171112233',
            'password' => Hash::make('password'),
            'role' => 'super_admin',
            'status' => 'Active',
        ]);

        $this->cashier = User::query()->create([
            'name' => 'Store Cashier',
            'email' => 'cashier@morebites.test',
            'phone' => '+639172223344',
            'password' => Hash::make('password'),
            'role' => 'cashier',
            'status' => 'Active',
        ]);

        $this->customer = User::query()->create([
            'name' => 'Customer User',
            'email' => 'customer@morebites.test',
            'phone' => '+639173334455',
            'password' => Hash::make('password'),
            'role' => 'customer',
            'status' => 'Active',
        ]);

        $this->driver = User::query()->create([
            'name' => 'Driver User',
            'email' => 'driver@morebites.test',
            'phone' => '+639174445566',
            'password' => Hash::make('password'),
            'role' => 'driver',
            'status' => 'Active',
            'current_lat' => 7.6094,
            'current_lng' => 124.9883,
        ]);
    }

    public function test_default_prep_time_is_15_to_20_minutes(): void
    {
        $response = $this->actingAs($this->owner, 'sanctum')
            ->getJson('/api/store-settings/prep-time');

        $response->assertStatus(200)
            ->assertJsonPath('data.min_prep_time', 15)
            ->assertJsonPath('data.max_prep_time', 20)
            ->assertJsonPath('data.prep_time_label', 'about 15–20 mins')
            ->assertJsonPath('data.prep_estimate_text', 'Preparing — ready in about 15–20 mins');
    }

    public function test_owner_can_update_prep_time_and_activity_is_logged(): void
    {
        $response = $this->actingAs($this->owner, 'sanctum')
            ->putJson('/api/store-settings/prep-time', [
                'min_prep_time' => 20,
                'max_prep_time' => 25,
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.min_prep_time', 20)
            ->assertJsonPath('data.max_prep_time', 25)
            ->assertJsonPath('data.prep_time_label', 'about 20–25 mins')
            ->assertJsonPath('data.prep_estimate_text', 'Preparing — ready in about 20–25 mins');

        $this->assertDatabaseHas('store_settings', [
            'min_prep_time' => 20,
            'max_prep_time' => 25,
        ]);

        $this->assertDatabaseHas('activity_logs', [
            'actor' => 'Owner Admin',
        ]);
    }

    public function test_prep_time_validates_min_and_max_relationship(): void
    {
        // max less than min
        $response = $this->actingAs($this->owner, 'sanctum')
            ->putJson('/api/store-settings/prep-time', [
                'min_prep_time' => 30,
                'max_prep_time' => 15,
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['max_prep_time']);
    }

    public function test_cashier_cannot_update_prep_time(): void
    {
        $response = $this->actingAs($this->cashier, 'sanctum')
            ->putJson('/api/store-settings/prep-time', [
                'min_prep_time' => 20,
                'max_prep_time' => 25,
            ]);

        $response->assertStatus(403);
    }

    public function test_tracking_payload_surfaces_prep_time_during_preparing_and_swaps_on_out_for_delivery(): void
    {
        StoreSetting::current()->update([
            'min_prep_time' => 15,
            'max_prep_time' => 20,
        ]);

        $custRecord = \App\Models\Customer::query()->create([
            'customer_code' => 'C-0001',
            'user_id' => $this->customer->id,
            'full_name' => 'Juan Dela Cruz',
            'phone' => '+639173334455',
        ]);

        $order = Order::query()->create([
            'order_code' => '#ORD-00055',
            'customer_id' => $custRecord->id,
            'customer_name' => 'Juan Dela Cruz',
            'order_type' => 'Online Order',
            'status' => 'Preparing',
            'total' => 350.00,
            'delivery_address' => 'Dangcagan, Bukidnon',
            'created_at' => Carbon::now(),
        ]);

        // In Preparing status
        $response = $this->actingAs($this->customer, 'sanctum')
            ->getJson("/api/customer/orders/{$order->id}/tracking");

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'Preparing')
            ->assertJsonPath('data.is_preparing', true)
            ->assertJsonPath('data.prep_time_label', 'about 15–20 mins')
            ->assertJsonPath('data.prep_estimate_text', 'Preparing — ready in about 15–20 mins');

        // Verify timeline contains the prep estimate
        $timeline = $response->json('data.timeline');
        $prepStep = collect($timeline)->firstWhere('key', 'Preparing');
        $this->assertNotNull($prepStep);
        $this->assertEquals('active', $prepStep['state']);
        $this->assertStringContainsString('about 15–20 mins', $prepStep['description']);

        // Now advance to Out for Delivery with assigned driver
        $order->update([
            'status' => 'Out for Delivery',
            'driver_id' => $this->driver->id,
            'assigned_at' => Carbon::now(),
            'dest_lat' => 7.6150,
            'dest_lng' => 124.9900,
            'delivery_distance_km' => 1.5,
            'delivery_minutes' => 6,
        ]);

        $outResponse = $this->actingAs($this->customer, 'sanctum')
            ->getJson("/api/customer/orders/{$order->id}/tracking");

        $outResponse->assertStatus(200)
            ->assertJsonPath('data.status', 'Out for Delivery')
            ->assertJsonPath('data.is_preparing', false);

        $this->assertNotNull($outResponse->json('data.eta_mins'));
        $this->assertGreaterThan(0, $outResponse->json('data.eta_mins'));
    }
}
