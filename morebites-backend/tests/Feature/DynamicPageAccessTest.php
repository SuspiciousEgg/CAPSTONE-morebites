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
}

