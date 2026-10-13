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

        // Non-owner (cashier) is rejected from suspending or reactivating driver
        $this->postJson("/api/drivers/{$driver->id}/suspend")->assertStatus(403);
        $this->postJson("/api/drivers/{$driver->id}/reactivate")->assertStatus(403);
        $this->postJson("/api/drivers/{$driver->id}/unsuspend")->assertStatus(403);

        // Non-owner (cashier) is rejected from blacklisting driver
        $this->postJson("/api/drivers/{$driver->id}/blacklist", [
            'reason' => 'Repeated tardiness and delivery complaints',
        ])->assertStatus(403);

        // Super-admin (owner) can suspend and reactivate driver
        $owner = User::query()->create([
            'name' => 'Store Owner',
            'email' => 'owner_driver_test@test.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
            'status' => 'Active',
        ]);
        Sanctum::actingAs($owner);

        $suspendResponse = $this->postJson("/api/drivers/{$driver->id}/suspend");
        $suspendResponse->assertStatus(200);
        $this->assertEquals('Inactive', $driver->fresh()->status);

        $reactivateResponse = $this->postJson("/api/drivers/{$driver->id}/reactivate");
        $reactivateResponse->assertStatus(200);
        $this->assertEquals('Active', $driver->fresh()->status);

        // Unsuspend alias also works for owner
        $this->postJson("/api/drivers/{$driver->id}/suspend");
        $this->assertEquals('Inactive', $driver->fresh()->status);
        $unsuspendResponse = $this->postJson("/api/drivers/{$driver->id}/unsuspend");
        $unsuspendResponse->assertStatus(200);
        $this->assertEquals('Active', $driver->fresh()->status);

        $blacklistResponse = $this->postJson("/api/drivers/{$driver->id}/blacklist", [
            'reason' => 'Repeated tardiness and delivery complaints',
        ]);
        $blacklistResponse->assertStatus(200);
        $this->assertEquals('Inactive', $driver->fresh()->status);
        $this->assertNotNull($driver->fresh()->archived_at);
        $this->assertDatabaseHas('driver_blacklist', [
            'driver_id' => $driver->id,
            'reason' => 'Repeated tardiness and delivery complaints',
        ]);

        // Blacklisted driver no longer appears in /api/drivers
        $activeDriversResponse = $this->getJson('/api/drivers');
        $activeDriversResponse->assertStatus(200);
        $activeDriversResponse->assertJsonMissing(['name' => 'John Driver']);
        $activeDriversResponse->assertJsonFragment(['name' => 'Marco Rider']);

        // Blacklisted driver appears in /api/blacklist (admin/super_admin view)
        $admin = User::query()->create([
            'name' => 'Admin Boss',
            'email' => 'admin_boss@test.com',
            'phone' => '09121112222',
            'password' => Hash::make('password'),
            'role' => 'admin',
            'status' => 'Active',
        ]);
        // Non-super_admin (admin) receives 403 on /api/blacklist (Owner only)
        Sanctum::actingAs($admin);
        $this->getJson('/api/blacklist')->assertStatus(403);

        // Super-admin (owner) can view /api/blacklist
        Sanctum::actingAs($owner);
        $blacklistListResponse = $this->getJson('/api/blacklist');
        $blacklistListResponse->assertStatus(200);
        $blacklistListResponse->assertJsonFragment(['name' => 'John Driver']);

        // Blocklisted driver attempting to log in receives specific blocklist error
        $loginResponse = $this->postJson('/api/driver/login', [
            'phone' => '09123456789',
            'password' => 'password',
        ]);
        $loginResponse->assertStatus(422);
        $loginResponse->assertJsonValidationErrors(['phone']);
        $this->assertStringContainsString('blocklisted', $loginResponse->json('errors.phone.0'));

        // Admin can reinstate the driver (supports both /reinstate and /unblacklist)
        $blacklistEntry = \App\Models\DriverBlacklist::where('driver_id', $driver->id)->firstOrFail();
        $unblacklistResponse = $this->postJson("/api/blacklist/{$blacklistEntry->id}/reinstate");
        $unblacklistResponse->assertStatus(200);
        $unblacklistResponse->assertJsonFragment(['message' => 'Driver has been reinstated and restored to active drivers.']);

        // Driver is restored to Active
        $driver->refresh();
        $this->assertEquals('Active', $driver->status);
        $this->assertNull($driver->archived_at);
        $this->assertDatabaseMissing('driver_blacklist', ['driver_id' => $driver->id]);

        // Driver can now log in successfully
        $successfulLogin = $this->postJson('/api/driver/login', [
            'phone' => '09123456789',
            'password' => 'password',
        ]);
        $successfulLogin->assertStatus(200);
        $successfulLogin->assertJsonStructure(['token', 'user']);
    }

    public function test_permanent_delete_is_refused_for_archive_endpoint(): void
    {
        $owner = User::query()->create([
            'name' => 'Store Owner',
            'email' => 'owner_archive_test@test.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
            'status' => 'Active',
        ]);

        $driver = User::query()->create([
            'name' => 'Archived Driver',
            'email' => 'archived_driver@test.com',
            'phone' => '09123334444',
            'password' => bcrypt('password'),
            'role' => 'driver',
            'status' => 'Inactive',
            'archived_at' => now(),
        ]);

        Sanctum::actingAs($owner);

        $response = $this->deleteJson("/api/archive/{$driver->id}");
        $response->assertStatus(403);
        $response->assertJsonFragment([
            'message' => 'Permanent deletion is disabled. Accounts can only be archived or restored.',
        ]);

        // Assert user was NOT hard-deleted from database
        $this->assertDatabaseHas('users', ['id' => $driver->id]);
    }
}


