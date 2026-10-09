<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\DriverBlacklist;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class MobileAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_customer_can_login_via_unified_mobile_endpoint_and_receive_customer_role(): void
    {
        $customerUser = User::factory()->create([
            'phone' => '09171234567',
            'password' => Hash::make('password123'),
            'role' => 'customer',
            'status' => 'Active',
        ]);

        Customer::create([
            'user_id' => $customerUser->id,
            'customer_code' => 'CUST-0001',
            'full_name' => $customerUser->name,
            'phone' => '09171234567',
            'status' => 'ACTIVE',
        ]);

        $response = $this->postJson('/api/mobile/login', [
            'phone' => '09171234567',
            'password' => 'password123',
            'device_id' => 'device-test-1',
        ]);

        $response->assertStatus(200);
        $response->assertJson([
            'role' => 'customer',
            'user' => [
                'id' => $customerUser->id,
                'role' => 'customer',
                'phone' => '09171234567',
            ],
        ]);
        $this->assertNotEmpty($response->json('token'));

        // Test /api/mobile/me with token
        $meResponse = $this->withHeader('Authorization', 'Bearer '.$response->json('token'))
            ->getJson('/api/mobile/me');

        $meResponse->assertStatus(200);
        $meResponse->assertJson([
            'role' => 'customer',
            'user' => [
                'id' => $customerUser->id,
                'role' => 'customer',
            ],
        ]);
    }

    public function test_driver_can_login_via_unified_mobile_endpoint_and_receive_driver_role(): void
    {
        $driverUser = User::factory()->create([
            'phone' => '09181234567',
            'password' => Hash::make('driverpass123'),
            'role' => 'driver',
            'status' => 'Active',
            'vehicle_type' => 'Motorcycle',
            'plate_no' => 'ABC-1234',
        ]);

        $response = $this->postJson('/api/mobile/login', [
            'phone' => '09181234567',
            'password' => 'driverpass123',
        ]);

        $response->assertStatus(200);
        $response->assertJson([
            'role' => 'driver',
            'user' => [
                'id' => $driverUser->id,
                'role' => 'driver',
                'vehicle_type' => 'Motorcycle',
                'plate_no' => 'ABC-1234',
            ],
        ]);
        $this->assertNotEmpty($response->json('token'));

        // Test /api/mobile/me with driver token
        $meResponse = $this->withHeader('Authorization', 'Bearer '.$response->json('token'))
            ->getJson('/api/mobile/me');

        $meResponse->assertStatus(200);
        $meResponse->assertJson([
            'role' => 'driver',
            'user' => [
                'id' => $driverUser->id,
                'role' => 'driver',
            ],
        ]);
    }

    public function test_driver_with_role_access_can_login_via_unified_mobile_endpoint(): void
    {
        $staffDriver = User::factory()->create([
            'phone' => '09191234567',
            'password' => Hash::make('staffpass123'),
            'role' => 'staff',
            'role_access' => ['driver'],
            'status' => 'Active',
        ]);

        $response = $this->postJson('/api/mobile/login', [
            'phone' => '09191234567',
            'password' => 'staffpass123',
        ]);

        $response->assertStatus(200);
        $response->assertJson([
            'role' => 'driver',
            'user' => [
                'id' => $staffDriver->id,
                'role' => 'driver',
            ],
        ]);
    }

    public function test_blocklisted_driver_cannot_login(): void
    {
        $driverUser = User::factory()->create([
            'phone' => '09201234567',
            'password' => Hash::make('pass123'),
            'role' => 'driver',
            'status' => 'Active',
        ]);

        DriverBlacklist::create([
            'driver_id' => $driverUser->id,
            'name' => $driverUser->name,
            'reason' => 'Violation',
            'blacklisted_at' => now(),
        ]);

        $response = $this->postJson('/api/mobile/login', [
            'phone' => '09201234567',
            'password' => 'pass123',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['phone']);
    }

    public function test_inactive_user_cannot_login(): void
    {
        User::factory()->create([
            'phone' => '09211234567',
            'password' => Hash::make('pass123'),
            'role' => 'customer',
            'status' => 'Inactive',
        ]);

        $response = $this->postJson('/api/mobile/login', [
            'phone' => '09211234567',
            'password' => 'pass123',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['phone']);
    }

    public function test_invalid_password_fails_login(): void
    {
        User::factory()->create([
            'phone' => '09221234567',
            'password' => Hash::make('correct123'),
            'role' => 'customer',
            'status' => 'Active',
        ]);

        $response = $this->postJson('/api/mobile/login', [
            'phone' => '09221234567',
            'password' => 'wrongpass',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['phone']);
    }
}
