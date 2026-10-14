<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DynamicPageAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_has_access_to_all_pages(): void
    {
        $superAdmin = User::factory()->create([
            'role' => 'super_admin',
            'status' => 'Active',
        ]);

        Sanctum::actingAs($superAdmin);

        $this->getJson('/api/dashboard')->assertStatus(200);
        $this->getJson('/api/orders')->assertStatus(200);
        $this->getJson('/api/menu')->assertStatus(200);
        $this->getJson('/api/inventory')->assertStatus(200);
        $this->getJson('/api/dispatch')->assertStatus(200);
        $this->getJson('/api/reports')->assertStatus(200);
        $this->getJson('/api/drivers')->assertStatus(200);
        $this->getJson('/api/customers')->assertStatus(200);
        $this->getJson('/api/accounts')->assertStatus(200);
    }

    public function test_staff_restricted_from_pages_not_in_allowed_pages(): void
    {
        $staff = User::factory()->create([
            'role' => 'cashier',
            'status' => 'Active',
            'allowed_pages' => ['Dashboard', 'Orders'],
        ]);

        Sanctum::actingAs($staff);

        // Allowed
        $this->getJson('/api/dashboard')->assertStatus(200);
        $this->getJson('/api/orders')->assertStatus(200);

        // Disallowed
        $menuRes = $this->getJson('/api/menu');
        $menuRes->assertStatus(403);
        $this->assertStringContainsString('Menu', $menuRes->json('message'));

        $inventoryRes = $this->getJson('/api/inventory');
        $inventoryRes->assertStatus(403);
        $this->assertStringContainsString('Inventory', $inventoryRes->json('message'));
    }

    public function test_super_admin_can_update_user_allowed_pages(): void
    {
        $superAdmin = User::factory()->create([
            'role' => 'super_admin',
            'status' => 'Active',
        ]);

        $cashier = User::factory()->create([
            'role' => 'cashier',
            'status' => 'Active',
            'allowed_pages' => ['Orders'],
        ]);

        Sanctum::actingAs($superAdmin);

        $response = $this->patchJson("/api/accounts/{$cashier->id}/allowed-pages", [
            'allowed_pages' => ['Orders', 'Menu', 'Inventory'],
        ]);

        $response->assertStatus(200);
        $this->assertEquals(['Orders', 'Menu', 'Inventory'], $cashier->fresh()->resolvedAllowedPages());

        // Now test cashier access
        Sanctum::actingAs($cashier->fresh());
        $this->getJson('/api/orders')->assertStatus(200);
        $this->getJson('/api/menu')->assertStatus(200);
        $this->getJson('/api/inventory')->assertStatus(200);
        $this->getJson('/api/dispatch')->assertStatus(403);
    }

    public function test_account_and_settings_are_strictly_owner_only(): void
    {
        $superAdmin = User::factory()->create([
            'role' => 'super_admin',
            'status' => 'Active',
        ]);

        $admin = User::factory()->create([
            'role' => 'admin',
            'status' => 'Active',
            // Even if explicitly set in factory/DB:
            'allowed_pages' => ['Account', 'Settings', 'Orders'],
        ]);

        // Non-super_admin resolvedAllowedPages strips Account and Settings
        $this->assertNotContains('Account', $admin->resolvedAllowedPages());
        $this->assertNotContains('Settings', $admin->resolvedAllowedPages());
        $this->assertFalse($admin->hasPageAccess('Account'));
        $this->assertFalse($admin->hasPageAccess('Settings'));

        // Non-super_admin calling Account endpoints gets 403
        Sanctum::actingAs($admin);
        $this->getJson('/api/accounts')->assertStatus(403);
        $this->getJson('/api/archive')->assertStatus(403);
        $this->getJson('/api/blacklist')->assertStatus(403);

        // Non-super_admin attempting to restore an archived user gets 403
        $archived = User::factory()->create([
            'role' => 'driver',
            'archived_at' => now(),
        ]);
        $this->postJson("/api/archive/{$archived->id}/restore")->assertStatus(403);

        // Non-super_admin attempting to blacklist driver gets 403
        $driver = User::factory()->create(['role' => 'driver', 'status' => 'Active']);
        $this->postJson("/api/drivers/{$driver->id}/blacklist", ['reason' => 'Test'])->assertStatus(403);

        // Super-admin patching allowed_pages with Account or Settings strips them for non-super_admin
        Sanctum::actingAs($superAdmin);
        $res = $this->patchJson("/api/accounts/{$admin->id}/allowed-pages", [
            'allowed_pages' => ['Dashboard', 'Account', 'Settings', 'Menu'],
        ]);
        $res->assertStatus(200);
        $this->assertEquals(['Dashboard', 'Menu'], $admin->fresh()->resolvedAllowedPages());
    }
}

