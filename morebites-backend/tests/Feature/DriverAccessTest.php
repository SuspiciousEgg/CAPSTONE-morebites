<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DriverAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_cashier_and_admin_can_access_driver_endpoints(): void
    {
        $cashier = User::query()->create([
            'name' => 'Rina Cashier',
            'first_name' => 'Rina',
            'last_name' => 'Cashier',
            'email' => 'cashier@test.com',
            'username' => '09128887777',
            'phone' => '09128887777',
            'password' => Hash::make('password'),
            'role' => 'cashier',
            'status' => 'Active',
        ]);

        $driver = User::query()->create([
            'name' => 'John Driver',
            'first_name' => 'John',
            'last_name' => 'Driver',
            'email' => 'driver@test.com',
            'username' => '09123456789',
            'phone' => '09123456789',
            'password' => Hash::make('password'),
            'role' => 'driver',
            'status' => 'Active',
            'vehicle_type' => 'Motorcycle',
            'plate_no' => 'ABC-1234',
        ]);

        $driver2 = User::query()->create([
            'name' => 'Marco Rider',
            'first_name' => 'Marco',
            'last_name' => 'Rider',
            'email' => 'driver2@test.com',
            'username' => '09123456780',
            'phone' => '09123456780',
            'password' => Hash::make('password'),
            'role' => 'driver',
            'status' => 'Active',
            'vehicle_type' => 'Motorcycle',
            'plate_no' => 'XYZ-5678',
        ]);

        // Cashier accesses drivers
        Sanctum::actingAs($cashier);
        $response = $this->getJson('/api/drivers');
        $response->assertStatus(200);
        $response->assertJsonCount(2, 'data');
        $response->assertJsonFragment(['name' => 'John Driver']);
        $response->assertJsonFragment(['name' => 'Marco Rider']);

        // Cashier accesses single driver
        $showResponse = $this->getJson("/api/drivers/{$driver->id}");
        $showResponse->assertStatus(200);
        $showResponse->assertJsonPath('data.name', 'John Driver');

        // Cashier suspends driver
        $suspendResponse = $this->postJson("/api/drivers/{$driver->id}/suspend");
        $suspendResponse->assertStatus(200);
        $this->assertEquals('Inactive', $driver->fresh()->status);
    }
}

