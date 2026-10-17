<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DriverSuspensionSecurityTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private User $driver;
    private Order $order;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::query()->create([
            'name' => 'Owner Admin',
            'first_name' => 'Owner',
            'last_name' => 'Admin',
            'email' => 'owner@test.com',
            'username' => '09121112222',
            'phone' => '09121112222',
            'password' => Hash::make('password123'),
            'role' => 'super_admin',
            'status' => 'Active',
        ]);

        $this->driver = User::query()->create([
            'name' => 'Marco Rider',
            'first_name' => 'Marco',
            'last_name' => 'Rider',
            'email' => 'marco@test.com',
            'username' => '09123456780',
            'phone' => '09123456780',
            'password' => Hash::make('password123'),
            'role' => 'driver',
            'status' => 'Active',
            'vehicle_type' => 'Motorcycle',
            'plate_no' => 'XYZ-5678',
        ]);

        $this->order = Order::query()->create([
            'order_code' => 'ORD-99001',
            'order_type' => 'Online Order',
            'status' => 'Assigned',
            'customer_name' => 'Test Customer',
            'delivery_address' => '123 Main St, Manila',
            'total' => 350.00,
            'driver_id' => $this->driver->id,
            'assigned_at' => now(),
        ]);
    }

    public function test_active_driver_can_access_endpoints(): void
    {
        Sanctum::actingAs($this->driver);

        $this->getJson('/api/driver/me')->assertStatus(200);
        $this->getJson('/api/mobile/me')->assertStatus(200)->assertJsonPath('role', 'driver');
        $this->getJson('/api/driver/orders')->assertStatus(200);
        $this->getJson('/api/notifications/unread-count')->assertStatus(200);

        $locRes = $this->patchJson("/api/deliveries/{$this->order->id}/location", [
            'latitude' => 14.5995,
            'longitude' => 120.9842,
        ]);
        $locRes->assertStatus(200);
    }

    public function test_suspending_driver_revokes_tokens_and_rejects_subsequent_requests_with_403(): void
    {
        // Issue token to driver
        $token = $this->driver->createToken('driver-app')->plainTextToken;
        $this->assertDatabaseHas('personal_access_tokens', ['tokenable_id' => $this->driver->id]);

        // Owner suspends Marco
        Sanctum::actingAs($this->owner);
        $suspendRes = $this->postJson("/api/drivers/{$this->driver->id}/suspend");
        $suspendRes->assertStatus(200);

        // Tokens must be revoked
        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $this->driver->id]);
        $this->assertEquals('Inactive', $this->driver->fresh()->status);

        // Now Marco attempts requests using actingAs or token
        Sanctum::actingAs($this->driver->fresh());

        $expectedMessage = 'Your account is suspended. Please contact the shop.';

        $this->getJson('/api/driver/me')
            ->assertStatus(403)
            ->assertJsonPath('message', $expectedMessage);

        $this->getJson('/api/mobile/me')
            ->assertStatus(403)
            ->assertJsonPath('message', $expectedMessage);

        $this->getJson('/api/driver/orders')
            ->assertStatus(403)
            ->assertJsonPath('message', $expectedMessage);

        $this->patchJson("/api/driver/orders/{$this->order->id}/status", ['status' => 'Picked Up'])
            ->assertStatus(403)
            ->assertJsonPath('message', $expectedMessage);

        $this->patchJson("/api/deliveries/{$this->order->id}/location", [
            'latitude' => 14.6000,
            'longitude' => 120.9850,
        ])
            ->assertStatus(403)
            ->assertJsonPath('message', $expectedMessage);

        $this->getJson('/api/notifications/unread-count')
            ->assertStatus(403)
            ->assertJsonPath('message', $expectedMessage);
    }

    public function test_blocklisting_driver_revokes_tokens_and_rejects_with_clear_403(): void
    {
        $this->driver->createToken('driver-app');
        $this->assertDatabaseHas('personal_access_tokens', ['tokenable_id' => $this->driver->id]);

        Sanctum::actingAs($this->owner);
        $this->postJson("/api/drivers/{$this->driver->id}/blacklist", [
            'reason' => 'Customer harassment complaint',
        ])->assertStatus(200);

        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $this->driver->id]);

        Sanctum::actingAs($this->driver->fresh());

        $expectedMessage = 'Your account has been blocklisted. Please contact the shop.';

        $this->getJson('/api/driver/me')
            ->assertStatus(403)
            ->assertJsonPath('message', $expectedMessage);

        $this->patchJson("/api/deliveries/{$this->order->id}/location", [
            'latitude' => 14.6000,
            'longitude' => 120.9850,
        ])
            ->assertStatus(403)
            ->assertJsonPath('message', $expectedMessage);
    }

    public function test_assign_rejects_suspended_driver_inside_transaction(): void
    {
        // Order waiting for rider
        $pendingOrder = Order::query()->create([
            'order_code' => 'ORD-99002',
            'order_type' => 'Online Order',
            'status' => 'Pending',
            'customer_name' => 'Jane Doe',
            'delivery_address' => '456 Taft Ave, Manila',
            'total' => 500.00,
        ]);

        // Suspend Marco
        $this->driver->update(['status' => 'Inactive']);

        Sanctum::actingAs($this->owner);

        // Attempt to assign Marco by name
        $response = $this->postJson("/api/dispatch/{$pendingOrder->id}/assign", [
            'rider_name' => 'Marco Rider',
        ]);

        $response->assertStatus(422);
        $response->assertJsonPath('message', 'The selected rider is suspended or inactive and cannot be assigned.');

        // Verify order is NOT assigned to Marco
        $this->assertNull($pendingOrder->fresh()->driver_id);
    }

    public function test_reactivating_driver_allows_new_login_and_access(): void
    {
        // Suspend Marco
        Sanctum::actingAs($this->owner);
        $this->postJson("/api/drivers/{$this->driver->id}/suspend");
        $this->assertEquals('Inactive', $this->driver->fresh()->status);

        // Reactivate Marco
        $reactivateRes = $this->postJson("/api/drivers/{$this->driver->id}/reactivate");
        $reactivateRes->assertStatus(200);
        $this->assertEquals('Active', $this->driver->fresh()->status);

        // Marco logs in again
        $this->app['auth']->forgetGuards();
        $loginRes = $this->postJson('/api/driver/login', [
            'phone' => '09123456780',
            'password' => 'password123',
        ]);
        $loginRes->assertStatus(200);
        $token = $loginRes->json('token');
        $this->assertNotEmpty($token);

        // Marco can make requests with the new token
        $this->app['auth']->forgetGuards();
        $this->withToken($token)
            ->getJson('/api/driver/me')
            ->assertStatus(200)
            ->assertJsonPath('user.fullName', 'Marco Rider');
    }
}
