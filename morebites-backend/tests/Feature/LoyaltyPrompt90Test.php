<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\LoyaltyLedger;
use App\Models\LoyaltySetting;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LoyaltyPrompt90Test extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        LoyaltySetting::query()->delete();
        LoyaltySetting::query()->create([
            'spend_per_point' => 2.00,
            'peso_value_per_point' => 0.10,
            'minimum_points_to_redeem' => 100,
            'points_expiry_days' => 30,
            'enabled' => true,
        ]);
    }

    private function createCustomer(array $attrs = []): Customer
    {
        static $seq = 3000;
        $seq++;

        $user = User::factory()->create([
            'role' => 'customer',
            'phone' => "0917000{$seq}",
        ]);

        return Customer::query()->create(array_merge([
            'user_id' => $user->id,
            'customer_code' => "C-{$seq}",
            'full_name' => "Loyalty Member {$seq}",
            'phone' => "0917000{$seq}",
            'status' => 'ACTIVE',
            'registered_at' => now(),
            'loyalty_points' => 0,
        ], $attrs));
    }

    public function test_customer_details_endpoint_returns_loyalty_balance_and_expiry_date(): void
    {
        $owner = User::factory()->create(['role' => 'super_admin']);

        $customer = $this->createCustomer([
            'loyalty_points' => 250,
            'points_expire_at' => now()->addDays(20),
        ]);

        $response = $this->actingAs($owner)->getJson("/api/customers/{$customer->id}");

        $response->assertOk()
            ->assertJsonPath('data.loyalty_points', 250)
            ->assertJsonPath('data.points_expired', false)
            ->assertJsonPath('data.points_expire_at', now()->addDays(20)->format('M d, Y'));
    }

    public function test_customer_details_returns_zero_points_for_expired_customer_without_writing_to_db(): void
    {
        $admin = User::factory()->create([
            'role' => 'admin',
            'allowed_pages' => ['Customers'],
        ]);

        $customer = $this->createCustomer([
            'loyalty_points' => 180,
            'points_expire_at' => now()->subDay(),
        ]);

        $response = $this->actingAs($admin)->getJson("/api/customers/{$customer->id}");

        $response->assertOk()
            ->assertJsonPath('data.loyalty_points', 0)
            ->assertJsonPath('data.points_expired', true);

        // Stored balance in database must remain 180 and NO ledger entry should be created on read
        $customer->refresh();
        $this->assertSame(180, $customer->loyalty_points);
        $this->assertDatabaseMissing('loyalty_ledger', [
            'customer_id' => $customer->id,
            'type' => 'expire',
        ]);
    }

    public function test_non_owner_cannot_access_loyalty_settings_history(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $cashier = User::factory()->create(['role' => 'cashier']);
        $driver = User::factory()->create(['role' => 'driver']);
        $customer = User::factory()->create(['role' => 'customer']);

        $this->actingAs($admin)->getJson('/api/loyalty-settings/history')->assertStatus(403);
        $this->actingAs($cashier)->getJson('/api/loyalty-settings/history')->assertStatus(403);
        $this->actingAs($driver)->getJson('/api/loyalty-settings/history')->assertStatus(403);
        $this->actingAs($customer)->getJson('/api/loyalty-settings/history')->assertStatus(403);
    }

    public function test_owner_can_access_loyalty_history_with_5_rows_per_page(): void
    {
        $owner = User::factory()->create(['role' => 'super_admin']);
        $customer = $this->createCustomer();

        for ($i = 1; $i <= 7; $i++) {
            LoyaltyLedger::query()->create([
                'customer_id' => $customer->id,
                'type' => 'earn',
                'points' => 10 * $i,
                'balance_after' => 10 * $i,
                'note' => "Earn test #{$i}",
                'created_at' => now()->subMinutes(10 - $i),
            ]);
        }

        $resPage1 = $this->actingAs($owner)->getJson('/api/loyalty-settings/history?page=1');

        $resPage1->assertOk()
            ->assertJsonCount(5, 'data')
            ->assertJsonPath('meta.per_page', 5)
            ->assertJsonPath('meta.total', 7)
            ->assertJsonPath('meta.current_page', 1)
            ->assertJsonPath('meta.last_page', 2);

        $resPage2 = $this->actingAs($owner)->getJson('/api/loyalty-settings/history?page=2');

        $resPage2->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.current_page', 2);
    }

    public function test_owner_can_filter_loyalty_history_by_type(): void
    {
        $owner = User::factory()->create(['role' => 'super_admin']);
        $customer = $this->createCustomer();

        LoyaltyLedger::query()->create([
            'customer_id' => $customer->id,
            'type' => 'earn',
            'points' => 50,
            'balance_after' => 50,
            'created_at' => now(),
        ]);
        LoyaltyLedger::query()->create([
            'customer_id' => $customer->id,
            'type' => 'redeem',
            'points' => -30,
            'balance_after' => 20,
            'created_at' => now(),
        ]);
        LoyaltyLedger::query()->create([
            'customer_id' => $customer->id,
            'type' => 'refund',
            'points' => 30,
            'balance_after' => 50,
            'created_at' => now(),
        ]);
        LoyaltyLedger::query()->create([
            'customer_id' => $customer->id,
            'type' => 'expire',
            'points' => -50,
            'balance_after' => 0,
            'created_at' => now(),
        ]);

        $resRedeem = $this->actingAs($owner)->getJson('/api/loyalty-settings/history?type=redeem');
        $resRedeem->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame('redeem', $resRedeem->json('data.0.type'));
        $this->assertSame(-30, $resRedeem->json('data.0.points'));

        $resEarn = $this->actingAs($owner)->getJson('/api/loyalty-settings/history?type=earn');
        $resEarn->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame('earn', $resEarn->json('data.0.type'));
        $this->assertSame('+50', $resEarn->json('data.0.signed_points'));
    }

    public function test_owner_can_search_loyalty_history_by_customer_name_or_code(): void
    {
        $owner = User::factory()->create(['role' => 'super_admin']);

        $customerA = $this->createCustomer([
            'customer_code' => 'C-SEARCH-A',
            'full_name' => 'Alice Wonderland',
        ]);
        $customerB = $this->createCustomer([
            'customer_code' => 'C-SEARCH-B',
            'full_name' => 'Bob Builder',
        ]);

        LoyaltyLedger::query()->create([
            'customer_id' => $customerA->id,
            'type' => 'earn',
            'points' => 100,
            'balance_after' => 100,
            'created_at' => now(),
        ]);
        LoyaltyLedger::query()->create([
            'customer_id' => $customerB->id,
            'type' => 'earn',
            'points' => 40,
            'balance_after' => 40,
            'created_at' => now(),
        ]);

        $resSearchName = $this->actingAs($owner)->getJson('/api/loyalty-settings/history?search=Alice');
        $resSearchName->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame('Alice Wonderland', $resSearchName->json('data.0.customer_name'));

        $resSearchCode = $this->actingAs($owner)->getJson('/api/loyalty-settings/history?search=SEARCH-B');
        $resSearchCode->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame('Bob Builder', $resSearchCode->json('data.0.customer_name'));
    }

    public function test_reports_customer_tab_shows_stored_balance_and_zero_for_expired_without_writing_to_db(): void
    {
        $admin = User::factory()->create([
            'role' => 'admin',
            'allowed_pages' => ['Reports'],
        ]);

        $activeCust = $this->createCustomer([
            'full_name' => 'Active Customer',
            'loyalty_points' => 120,
            'points_expire_at' => now()->addDays(15),
        ]);

        $expiredCust = $this->createCustomer([
            'full_name' => 'Expired Customer',
            'loyalty_points' => 300,
            'points_expire_at' => now()->subDays(5),
        ]);

        $res = $this->actingAs($admin)->getJson('/api/reports/customers?per_page=10');

        $res->assertOk();
        $items = collect($res->json('data'));

        $activeRow = $items->firstWhere('id', $activeCust->id);
        $this->assertNotNull($activeRow);
        $this->assertSame('120 pts', $activeRow['points']);

        $expiredRow = $items->firstWhere('id', $expiredCust->id);
        $this->assertNotNull($expiredRow);
        $this->assertSame('0 pts', $expiredRow['points']);

        // Verify no ledger entries created
        $this->assertDatabaseMissing('loyalty_ledger', [
            'customer_id' => $expiredCust->id,
            'type' => 'expire',
        ]);
    }
}

