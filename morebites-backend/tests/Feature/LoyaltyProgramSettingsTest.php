<?php

namespace Tests\Feature;

use App\Models\LoyaltySetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LoyaltyProgramSettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_loyalty_settings_defaults_are_seeded_or_created(): void
    {
        $setting = LoyaltySetting::current();

        $this->assertEquals(2.00, $setting->spend_per_point);
        $this->assertEquals(0.10, $setting->peso_value_per_point);
        $this->assertEquals(100, $setting->minimum_points_to_redeem);
        $this->assertEquals(30, $setting->points_expiry_days);
        $this->assertTrue($setting->enabled);
        $this->assertEquals(5.00, $setting->percentBack());
    }

    public function test_non_owner_users_cannot_access_or_update_loyalty_settings(): void
    {
        $cashier = User::factory()->create(['role' => 'cashier']);
        $admin = User::factory()->create(['role' => 'admin', 'allowed_pages' => ['Orders', 'Menu']]);
        $driver = User::factory()->create(['role' => 'driver']);
        $customer = User::factory()->create(['role' => 'customer']);

        foreach ([$cashier, $admin, $driver, $customer] as $user) {
            $this->actingAs($user)
                ->getJson('/api/loyalty-settings')
                ->assertStatus(403);

            $this->actingAs($user)
                ->putJson('/api/loyalty-settings', [
                    'spend_per_point' => 5.00,
                    'peso_value_per_point' => 0.20,
                    'minimum_points_to_redeem' => 50,
                    'points_expiry_days' => 60,
                    'enabled' => true,
                ])
                ->assertStatus(403);
        }
    }

    public function test_owner_can_read_and_update_loyalty_settings(): void
    {
        $owner = User::factory()->create(['role' => 'super_admin', 'name' => 'Store Owner']);

        $readRes = $this->actingAs($owner)
            ->getJson('/api/loyalty-settings')
            ->assertOk()
            ->json('data');

        $this->assertEquals(2.00, $readRes['spend_per_point']);
        $this->assertEquals(0.10, $readRes['peso_value_per_point']);
        $this->assertEquals(100, $readRes['minimum_points_to_redeem']);
        $this->assertEquals(30, $readRes['points_expiry_days']);
        $this->assertTrue($readRes['enabled']);
        $this->assertEquals(5.0, $readRes['percent_back']);

        $updateRes = $this->actingAs($owner)
            ->putJson('/api/loyalty-settings', [
                'spend_per_point' => 4.00,
                'peso_value_per_point' => 0.20,
                'minimum_points_to_redeem' => 150,
                'points_expiry_days' => 60,
                'enabled' => true,
            ])
            ->assertOk()
            ->json('data');

        $this->assertEquals(4.00, $updateRes['spend_per_point']);
        $this->assertEquals(0.20, $updateRes['peso_value_per_point']);
        $this->assertEquals(150, $updateRes['minimum_points_to_redeem']);
        $this->assertEquals(60, $updateRes['points_expiry_days']);
        $this->assertTrue($updateRes['enabled']);
        $this->assertEquals(5.0, $updateRes['percent_back']); // 0.20 / 4.00 = 5%
        $this->assertEquals($owner->id, $updateRes['updated_by']);
        $this->assertEquals('Store Owner', $updateRes['updated_by_name']);
    }

    public function test_validation_rejects_invalid_loyalty_settings(): void
    {
        $owner = User::factory()->create(['role' => 'super_admin']);

        // spend_per_point <= 0
        $this->actingAs($owner)
            ->putJson('/api/loyalty-settings', [
                'spend_per_point' => 0,
                'peso_value_per_point' => 0.10,
                'minimum_points_to_redeem' => 100,
                'points_expiry_days' => 30,
                'enabled' => true,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['spend_per_point']);

        // peso_value_per_point <= 0
        $this->actingAs($owner)
            ->putJson('/api/loyalty-settings', [
                'spend_per_point' => 2.00,
                'peso_value_per_point' => -0.5,
                'minimum_points_to_redeem' => 100,
                'points_expiry_days' => 30,
                'enabled' => true,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['peso_value_per_point']);

        // minimum_points_to_redeem < 1
        $this->actingAs($owner)
            ->putJson('/api/loyalty-settings', [
                'spend_per_point' => 2.00,
                'peso_value_per_point' => 0.10,
                'minimum_points_to_redeem' => 0,
                'points_expiry_days' => 30,
                'enabled' => true,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['minimum_points_to_redeem']);

        // points_expiry_days > 365 or < 0
        $this->actingAs($owner)
            ->putJson('/api/loyalty-settings', [
                'spend_per_point' => 2.00,
                'peso_value_per_point' => 0.10,
                'minimum_points_to_redeem' => 100,
                'points_expiry_days' => 400,
                'enabled' => true,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['points_expiry_days']);
    }

    public function test_authenticated_users_can_read_current_rates(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);

        $res = $this->actingAs($customer)
            ->getJson('/api/loyalty/rates')
            ->assertOk()
            ->json('data');

        $this->assertEquals(2.00, $res['spend_per_point']);
        $this->assertEquals(0.10, $res['peso_value_per_point']);
        $this->assertEquals(100, $res['minimum_points_to_redeem']);
        $this->assertEquals(30, $res['points_expiry_days']);
        $this->assertTrue($res['enabled']);
        $this->assertEquals(5.0, $res['percent_back']);
    }
}

