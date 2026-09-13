<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\TrustedDevice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CustomerAuthTest extends TestCase
{
    use RefreshDatabase;

    private User $customerUser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->customerUser = User::query()->create([
            'name' => 'Maria Santos',
            'first_name' => 'Maria',
            'last_name' => 'Santos',
            'email' => 'maria@example.com',
            'phone' => '09123456789',
            'password' => Hash::make('secret123'),
            'role' => 'customer',
            'status' => 'Active',
        ]);

        Customer::query()->create([
            'user_id' => $this->customerUser->id,
            'customer_code' => 'CUST-00001',
            'full_name' => 'Maria Santos',
            'phone' => '09123456789',
            'email' => 'maria@example.com',
            'status' => 'Active',
        ]);
    }

    public function test_customer_login_registers_trusted_device(): void
    {
        $deviceId = 'test-android-device-123';

        // 1st login with new device
        $res1 = $this->postJson('/api/customer/login', [
            'phone' => '09123456789',
            'password' => 'secret123',
            'device_id' => $deviceId,
        ]);

        $res1->assertStatus(200);
        $res1->assertJson([
            'new_device' => true,
        ]);
        $this->assertNotEmpty($res1->json('token'));

        $this->assertDatabaseHas('trusted_devices', [
            'user_id' => $this->customerUser->id,
            'device_id' => $deviceId,
        ]);

        // 2nd login with same device
        $res2 = $this->postJson('/api/customer/login', [
            'phone' => '09123456789',
            'password' => 'secret123',
            'device_id' => $deviceId,
        ]);

        $res2->assertStatus(200);
        $res2->assertJson([
            'new_device' => false,
        ]);

        // 3rd login with different device
        $res3 = $this->postJson('/api/customer/login', [
            'phone' => '09123456789',
            'password' => 'secret123',
            'device_id' => 'different-device-456',
        ]);

        $res3->assertStatus(200);
        $res3->assertJson([
            'new_device' => true,
        ]);
    }

    public function test_customer_registration_enforces_philippine_phone_format(): void
    {
        // 10 digits
        $res1 = $this->postJson('/api/customer/register', [
            'full_name' => 'Test User',
            'phone' => '9123456789',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);
        $res1->assertStatus(422);
        $res1->assertJsonValidationErrors(['phone']);
        $this->assertEquals(
            'Enter a valid 11-digit Philippine mobile number starting with 09.',
            $res1->json('errors.phone.0')
        );

        // Invalid prefix (08 instead of 09)
        $res2 = $this->postJson('/api/customer/register', [
            'full_name' => 'Test User',
            'phone' => '08123456789',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);
        $res2->assertStatus(422);
        $res2->assertJsonValidationErrors(['phone']);

        // 12 digits
        $res3 = $this->postJson('/api/customer/register', [
            'full_name' => 'Test User',
            'phone' => '091234567890',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);
        $res3->assertStatus(422);
        $res3->assertJsonValidationErrors(['phone']);

        // Valid 11 digits starting with 09
        $resValid = $this->postJson('/api/customer/register', [
            'full_name' => 'Valid User',
            'phone' => '09190001111',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);
        $resValid->assertStatus(201);
    }

    public function test_customer_and_driver_login_enforces_philippine_phone_format(): void
    {
        // Invalid customer login phone
        $resCustomer = $this->postJson('/api/customer/login', [
            'phone' => '08123456789',
            'password' => 'secret123',
            'device_id' => 'dev-1',
        ]);
        $resCustomer->assertStatus(422);
        $resCustomer->assertJsonValidationErrors(['phone']);

        // Invalid driver login phone
        $resDriver = $this->postJson('/api/driver/login', [
            'phone' => '9123456789',
            'password' => 'secret123',
        ]);
        $resDriver->assertStatus(422);
        $resDriver->assertJsonValidationErrors(['phone']);
    }

    public function test_admin_creation_enforces_philippine_phone_format(): void
    {
        $superAdmin = User::query()->create([
            'name' => 'Super Admin',
            'first_name' => 'Super',
            'last_name' => 'Admin',
            'email' => 'super@example.com',
            'password' => Hash::make('password'),
            'role' => 'super_admin',
            'status' => 'Active',
        ]);

        $res = $this->actingAs($superAdmin)->postJson('/api/accounts/admins', [
            'first_name' => 'New',
            'last_name' => 'Admin',
            'email' => 'newadmin@example.com',
            'phone' => '08123456789', // invalid
            'password' => 'password123',
        ]);

        $res->assertStatus(422);
        $res->assertJsonValidationErrors(['phone']);
    }
}

