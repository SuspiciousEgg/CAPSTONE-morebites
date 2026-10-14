<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\LoyaltyLedger;
use App\Models\LoyaltySetting;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use App\Services\LoyaltyService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LoyaltyPrompt86Test extends TestCase
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

    private function createCustomer(array $attrs = []): Customer
    {
        static $seq = 1000;
        $seq++;

        return Customer::query()->create(array_merge([
            'customer_code' => "C-{$seq}",
            'full_name' => "Customer {$seq}",
            'phone' => "0917000{$seq}",
            'status' => 'ACTIVE',
            'registered_at' => now(),
            'loyalty_points' => 0,
        ], $attrs));
    }

    private function createOrder(array $attrs = []): Order
    {
        static $orderSeq = 1000;
        $orderSeq++;

        return Order::query()->create(array_merge([
            'order_code' => "#ORD-{$orderSeq}",
            'customer_name' => 'Test Customer',
            'order_type' => 'Online Order',
            'total' => 100.00,
            'status' => 'Pending',
            'payment_method' => 'COD',
            'payment_status' => 'Unpaid',
        ], $attrs));
    }

    public function test_online_order_completion_credits_food_subtotal_divided_by_spend_per_point(): void
    {
        $customerUser = User::factory()->create(['role' => 'customer']);
        $customer = $this->createCustomer(['user_id' => $customerUser->id, 'loyalty_points' => 0]);
        $driver = User::factory()->create(['role' => 'driver', 'status' => 'Active', 'role_access' => ['driver']]);

        // Order with food subtotal 350, delivery_fee 40, service_fee 10 -> total 400
        $order = $this->createOrder([
            'order_code' => '#ORD-TEST-001',
            'order_type' => 'Online Order',
            'customer_id' => $customer->id,
            'driver_id' => $driver->id,
            'total' => 400.00,
            'delivery_fee' => 40.00,
            'service_fee' => 10.00,
            'status' => 'Assigned',
        ]);

        OrderItem::create([
            'order_id' => $order->id,
            'name' => 'Pizza',
            'qty' => 1,
            'unit_price' => 350.00,
            'line_total' => 350.00,
        ]);

        // Complete via driver status update
        $response = $this->actingAs($driver)
            ->postJson("/api/driver/orders/{$order->id}/status", [
                'status' => 'Delivered',
            ])
            ->assertOk();

        $customer->refresh();
        $order->refresh();

        // 350 food subtotal / 2 spend_per_point = 175 points (delivery & service fees excluded)
        $this->assertEquals(175, $customer->loyalty_points);
        $this->assertNotNull($customer->points_expire_at);
        $this->assertEquals(now()->addDays(30)->toDateString(), $customer->points_expire_at->toDateString());

        // Check ledger
        $ledger = LoyaltyLedger::where('order_id', $order->id)->first();
        $this->assertNotNull($ledger);
        $this->assertEquals('earn', $ledger->type);
        $this->assertEquals(175, $ledger->points);
        $this->assertEquals(175, $ledger->balance_after);
        $this->assertEquals(175, $order->loyaltyPointsEarned());

        // Idempotency: re-marking completed does not double credit
        app(LoyaltyService::class)->creditForOrder($order);
        $this->assertEquals(1, LoyaltyLedger::where('order_id', $order->id)->where('type', 'earn')->count());
        $this->assertEquals(175, $customer->fresh()->loyalty_points);
    }

    public function test_walk_in_orders_earn_nothing(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin']);
        $customer = $this->createCustomer(['loyalty_points' => 0]);

        $order = $this->createOrder([
            'order_code' => '#ORD-WALKIN-1',
            'order_type' => 'Dine-in',
            'customer_id' => $customer->id,
            'total' => 500.00,
            'status' => 'Pending',
        ]);

        $this->actingAs($admin)
            ->patchJson("/api/orders/{$order->id}/status", [
                'status' => 'Completed',
            ])
            ->assertOk();

        $this->assertEquals(0, $customer->fresh()->loyalty_points);
        $this->assertEquals(0, LoyaltyLedger::where('order_id', $order->id)->count());
        $this->assertEquals(0, $order->fresh()->loyaltyPointsEarned());
    }

    public function test_disabled_loyalty_credits_nothing(): void
    {
        LoyaltySetting::current()->update(['enabled' => false]);

        $driver = User::factory()->create(['role' => 'driver', 'status' => 'Active', 'role_access' => ['driver']]);
        $customer = $this->createCustomer(['loyalty_points' => 0]);

        $order = $this->createOrder([
            'order_code' => '#ORD-DISABLED-1',
            'order_type' => 'Online Order',
            'customer_id' => $customer->id,
            'driver_id' => $driver->id,
            'total' => 300.00,
            'delivery_fee' => 0,
            'service_fee' => 0,
            'status' => 'Assigned',
        ]);

        $this->actingAs($driver)
            ->postJson("/api/driver/orders/{$order->id}/status", [
                'status' => 'Delivered',
            ])
            ->assertOk();

        $this->assertEquals(0, $customer->fresh()->loyalty_points);
        $this->assertEquals(0, LoyaltyLedger::where('order_id', $order->id)->count());
    }

    public function test_lazy_expiry_zeroes_balance_under_lock_on_customer_read(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        $customer = $this->createCustomer([
            'user_id' => $user->id,
            'loyalty_points' => 100,
            'points_expire_at' => now()->subDay(), // expired yesterday
        ]);

        // Reading customer profile via me triggers lazy expiry
        $response = $this->actingAs($user)
            ->getJson('/api/customer/me')
            ->assertOk();

        $this->assertEquals(0, $response->json('user.loyalty_points'));

        $customer->refresh();
        $this->assertEquals(0, $customer->loyalty_points);
        $this->assertNull($customer->points_expire_at);

        // Check expire ledger entry
        $expireEntry = LoyaltyLedger::where('customer_id', $customer->id)->where('type', 'expire')->first();
        $this->assertNotNull($expireEntry);
        $this->assertEquals(-100, $expireEntry->points);
        $this->assertEquals(0, $expireEntry->balance_after);

        // Calling it again does not create a duplicate expire entry
        $this->actingAs($user)->getJson('/api/customer/me')->assertOk();
        $this->assertEquals(1, LoyaltyLedger::where('customer_id', $customer->id)->where('type', 'expire')->count());
    }

    public function test_report_and_list_queries_never_write_and_show_zero_for_expired_customers(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin']);
        $user = User::factory()->create(['role' => 'customer']);
        $customer = $this->createCustomer([
            'user_id' => $user->id,
            'loyalty_points' => 250,
            'points_expire_at' => now()->subDays(5), // expired 5 days ago
        ]);

        // Query reports customers endpoint
        $res = $this->actingAs($admin)
            ->getJson('/api/reports/customers')
            ->assertOk()
            ->json('data');

        $matched = collect($res)->firstWhere('id', $customer->id);
        $this->assertNotNull($matched);
        $this->assertEquals('0 pts', $matched['points']);

        // Confirm database was NOT written by report query
        $this->assertEquals(0, LoyaltyLedger::where('customer_id', $customer->id)->count());
        $this->assertEquals(250, $customer->fresh()->loyalty_points); // DB row unchanged until lazy read/use
    }

    public function test_backfill_is_idempotent_and_credits_existing_completed_orders(): void
    {
        $customer = $this->createCustomer(['loyalty_points' => 0]);

        $order1 = $this->createOrder([
            'order_code' => '#ORD-BF-1',
            'order_type' => 'Online Order',
            'customer_id' => $customer->id,
            'total' => 300.00,
            'status' => 'Completed',
        ]);

        $order2 = $this->createOrder([
            'order_code' => '#ORD-BF-2',
            'order_type' => 'Online Order',
            'customer_id' => $customer->id,
            'total' => 150.00,
            'status' => 'Completed',
        ]);

        // Run backfill service
        $res = app(LoyaltyService::class)->backfill();
        $this->assertGreaterThanOrEqual(2, $res['orders_processed']);

        $customer->refresh();
        // round(300 / 2) = 150 + round(150 / 2) = 75 => 225 total
        $this->assertEquals(225, $customer->loyalty_points);
        $this->assertNotNull($customer->points_expire_at);
        $this->assertEquals(now()->addDays(30)->toDateString(), $customer->points_expire_at->toDateString());

        // Re-running backfill is completely idempotent
        $res2 = app(LoyaltyService::class)->backfill();
        $this->assertEquals(0, $res2['orders_credited']);
        $this->assertEquals(225, $customer->fresh()->loyalty_points);
    }
}

