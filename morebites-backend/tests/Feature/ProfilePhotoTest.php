<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ProfilePhotoTest extends TestCase
{
    use RefreshDatabase;

    private User $customer;
    private User $driver;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');

        $this->customer = User::query()->create([
            'name' => 'Maria Customer',
            'first_name' => 'Maria',
            'last_name' => 'Customer',
            'email' => 'maria@customer.local',
            'phone' => '09123456789',
            'password' => Hash::make('password123'),
            'role' => 'customer',
            'status' => 'Active',
        ]);

        Customer::query()->create([
            'user_id' => $this->customer->id,
            'customer_code' => 'CUST-00001',
            'full_name' => 'Maria Customer',
            'phone' => '09123456789',
            'email' => 'maria@customer.local',
            'status' => 'Active',
        ]);

        $this->driver = User::query()->create([
            'name' => 'Danilo Driver',
            'first_name' => 'Danilo',
            'last_name' => 'Driver',
            'email' => 'danilo@driver.local',
            'phone' => '09191234567',
            'password' => Hash::make('password123'),
            'role' => 'driver',
            'status' => 'Active',
        ]);
    }

    public function test_customer_can_update_profile_photo_and_retrieve_on_login(): void
    {
        $base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

        // 1. Customer updates profile with base64 photo
        $updateRes = $this->actingAs($this->customer)->patchJson('/api/customer/profile', [
            'full_name' => 'Maria Updated',
            'photo' => $base64Image,
        ]);

        $updateRes->assertStatus(200);
        $updatedPhotoUrl = $updateRes->json('user.photo');
        $this->assertNotEmpty($updatedPhotoUrl);
        $this->assertStringContainsString('/storage/avatars/', $updatedPhotoUrl);

        // Verify photo path was persisted in the database
        $this->customer->refresh();
        $this->assertNotNull($this->customer->photo);
        $this->assertStringStartsWith('/storage/avatars/', $this->customer->photo);

        // 2. Customer gets profile via /api/customer/me
        $meRes = $this->actingAs($this->customer)->getJson('/api/customer/me');
        $meRes->assertStatus(200);
        $this->assertEquals($updatedPhotoUrl, $meRes->json('user.photo'));

        // 3. Customer logs in again (simulating logout & re-login)
        $loginRes = $this->postJson('/api/customer/login', [
            'phone' => '09123456789',
            'password' => 'password123',
            'device_id' => 'device-abc',
        ]);

        $loginRes->assertStatus(200);
        $this->assertEquals($updatedPhotoUrl, $loginRes->json('user.photo'));
    }

    public function test_driver_can_update_profile_photo_and_retrieve_on_login(): void
    {
        $base64Image = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

        // 1. Driver updates profile with photo
        $updateRes = $this->actingAs($this->driver)->patchJson('/api/driver/profile', [
            'first_name' => 'Danilo',
            'last_name' => 'Updated',
            'photo' => $base64Image,
        ]);

        $updateRes->assertStatus(200);
        $updatedPhotoUrl = $updateRes->json('user.photo');
        $this->assertNotEmpty($updatedPhotoUrl);
        $this->assertStringContainsString('/storage/avatars/', $updatedPhotoUrl);

        // 2. Driver logs in again
        $loginRes = $this->postJson('/api/driver/login', [
            'phone' => '09191234567',
            'password' => 'password123',
        ]);

        $loginRes->assertStatus(200);
        $this->assertEquals($updatedPhotoUrl, $loginRes->json('user.photo'));
    }
}

