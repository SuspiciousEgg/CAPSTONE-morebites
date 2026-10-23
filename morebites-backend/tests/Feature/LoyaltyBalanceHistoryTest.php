<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\LoyaltyLedger;
use App\Models\LoyaltySetting;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LoyaltyBalanceHistoryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        LoyaltySetting::current()->update([
            'spend_per_point' => 2.00,
            'peso_value_per_point' => 0.10,
            'minimum_points_to_redeem' => 100,
            'points_expiry_days' => 30,
            'enabled' => true,
        ]);
    }

    private function createCustomerUser(array $userAttrs = [], array $customerAttrs = []): array
    {
        static $seq = 3000;
        $seq++;

        $user = User::query()->create(array_merge([
            'name' => "Customer {$seq}",
            'phone' => "0917000{$seq}",
            'email' => "cust{$seq}@morebites.test",
            'password' => bcrypt('password123'),
            'role' => 'customer',
            'status' => 'ACTIVE',
        ], $userAttrs));

        $customer = Customer::query()->create(array_merge([
            'user_id' => $user->id,
            'customer_code' => "C-{$seq}",
            'full_name' => $user->name,
            'phone' => $user->phone,
            'status' => 'ACTIVE',
            'registered_at' => now(),
            'loyalty_points' => 0,
        ], $customerAttrs));

        return [$user, $customer];
    }

    public function test_customer_can_read_loyalty_balance_worth_explanation_and_history()
    {
        [$user, $customer] = $this->createCustomerUser([], [
            'loyalty_points' => 120,
            'points_expire_at' => now()->addDays(20),
        ]);

        $order = Order::query()->create([
            'order_code' => '#ORD-3001',
            'customer_id' => $customer->id,
            'customer_name' => $customer->full_name,
            'order_type' => 'Online Order',
            'total' => 240.00,
            'status' => 'Completed',
            'payment_method' => 'COD',
            'payment_status' => 'Paid',
        ]);

        LoyaltyLedger::query()->create([
            'customer_id' => $customer->id,
            'order_id' => $order->id,
            'type' => 'earn',
            'points' => 120,
            'balance_after' => 120,
            'note' => 'Earned from order #ORD-3001',
            'created_at' => now(),
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/customer/loyalty');

        $response->assertOk()
            ->assertJson([
                'enabled' => true,
                'points' => 120,
                'points_worth' => 12.0,
                'points_worth_label' => '₱12.00',
                'expiry_enabled' => true,
                'explanation' => 'Earn 1 point per ₱2 on food. Use points to pay up to all of your food total. Minimum 100 points.',
            ]);

        $data = $response->json();
        $this->assertNotEmpty($data['points_expire_at']);
        $this->assertNotEmpty($data['expiry_date_label']);
        $this->assertCount(1, $data['history']);
        $this->assertSame('earn', $data['history'][0]['type']);
        $this->assertSame(120, $data['history'][0]['points']);
        $this->assertSame('#ORD-3001', $data['history'][0]['order_code']);
    }

    public function test_non_customer_roles_and_guests_are_denied()
    {
        $guestResp = $this->getJson('/api/customer/loyalty');
        $guestResp->assertStatus(401);

        $driver = User::query()->create([
            'name' => 'Driver Dave',
            'phone' => '09178881111',
            'email' => 'driver@test.local',
            'password' => bcrypt('password123'),
            'role' => 'driver',
            'status' => 'ACTIVE',
        ]);

        $driverResp = $this->actingAs($driver, 'sanctum')->getJson('/api/customer/loyalty');
        $driverResp->assertStatus(403);
    }

    public function test_lazy_expiry_is_applied_before_returning_loyalty_data()
    {
        [$user, $customer] = $this->createCustomerUser([], [
            'loyalty_points' => 150,
            'points_expire_at' => now()->subDay(), // expired!
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/customer/loyalty');

        $response->assertOk()
            ->assertJson([
                'points' => 0,
                'points_worth' => 0.0,
                'points_worth_label' => '₱0.00',
                'points_expire_at' => null,
                'expiry_date_label' => null,
            ]);

        // Customer in db should now have 0 points
        $this->assertSame(0, (int) $customer->fresh()->loyalty_points);
        $this->assertNull($customer->fresh()->points_expire_at);

        // An expire ledger entry was written
        $ledger = LoyaltyLedger::query()->where('customer_id', $customer->id)->where('type', 'expire')->first();
        $this->assertNotNull($ledger);
        $this->assertSame(-150, (int) $ledger->points);
        $this->assertSame(0, (int) $ledger->balance_after);
    }

    public function test_ledger_history_never_shows_other_customers_data()
    {
        [$user1, $customer1] = $this->createCustomerUser(['name' => 'Alice']);
        [$user2, $customer2] = $this->createCustomerUser(['name' => 'Bob']);

        LoyaltyLedger::query()->create([
            'customer_id' => $customer1->id,
            'type' => 'earn',
            'points' => 50,
            'balance_after' => 50,
            'note' => 'Alice points',
            'created_at' => now(),
        ]);

        LoyaltyLedger::query()->create([
            'customer_id' => $customer2->id,
            'type' => 'earn',
            'points' => 99,
            'balance_after' => 99,
            'note' => 'Bob points',
            'created_at' => now(),
        ]);

        $respAlice = $this->actingAs($user1, 'sanctum')->getJson('/api/customer/loyalty');
        $respAlice->assertOk();
        $aliceHistory = $respAlice->json('history');
        $this->assertCount(1, $aliceHistory);
        $this->assertSame(50, $aliceHistory[0]['points']);
        $this->assertSame('Alice points', $aliceHistory[0]['note']);

        $respBob = $this->actingAs($user2, 'sanctum')->getJson('/api/customer/loyalty');
        $respBob->assertOk();
        $bobHistory = $respBob->json('history');
        $this->assertCount(1, $bobHistory);
        $this->assertSame(99, $bobHistory[0]['points']);
        $this->assertSame('Bob points', $bobHistory[0]['note']);
    }

    public function test_live_settings_update_dynamically_changes_explanation()
    {
        LoyaltySetting::current()->update([
            'spend_per_point' => 5.00,
            'minimum_points_to_redeem' => 50,
        ]);

        [$user, $customer] = $this->createCustomerUser();

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/customer/loyalty');
        $response->assertOk()
            ->assertJson([
                'explanation' => 'Earn 1 point per ₱5 on food. Use points to pay up to all of your food total. Minimum 50 points.',
            ]);
    }
}

