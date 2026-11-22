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

class LoyaltyMemberLookupTest extends TestCase
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
        static $seq = 2000;
        $seq++;

        $user = User::factory()->create([
            'role' => 'customer',
            'phone' => "0918000{$seq}",
        ]);

        return Customer::query()->create(array_merge([
            'user_id' => $user->id,
            'customer_code' => "C-{$seq}",
            'full_name' => "Member {$seq}",
            'phone' => "0918000{$seq}",
            'status' => 'ACTIVE',
            'registered_at' => now(),
            'loyalty_points' => 0,
        ], $attrs));
    }

    public function test_staff_can_lookup_loyalty_member_by_phone_with_lazy_expiry(): void
    {
        $staff = User::factory()->create([
            'role' => 'cashier',
        ]);

        // Customer with expired points
        $customer = $this->createCustomer([
            'phone' => '09171234567',
            'full_name' => 'Maria Santos',
            'loyalty_points' => 150,
            'points_expire_at' => now()->subDay(),
        ]);

        $response = $this->actingAs($staff)
            ->getJson('/api/orders/lookup-loyalty?phone=09171234567');

        $response->assertOk()
            ->assertJson([
                'found' => true,
                'customer' => [
                    'id' => $customer->id,
                    'customer_code' => $customer->customer_code,
                    'name' => 'Maria Santos',
                    'phone' => '09171234567',
                    'points' => 0,
                    'points_worth' => 0,
                ],
            ]);

        // Customer with active points
        $customer2 = $this->createCustomer([
            'phone' => '09179876543',
            'full_name' => 'Juan Dela Cruz',
            'loyalty_points' => 200,
            'points_expire_at' => now()->addDays(20),
        ]);

        $response2 = $this->actingAs($staff)
            ->getJson('/api/orders/lookup-loyalty?phone=09179876543');

        $response2->assertOk()
            ->assertJson([
                'found' => true,
                'customer' => [
                    'id' => $customer2->id,
                    'customer_code' => $customer2->customer_code,
                    'name' => 'Juan Dela Cruz',
                    'phone' => '09179876543',
                    'points' => 200,
                    'points_worth' => 20.00,
                ],
            ]);
    }

    public function test_lookup_returns_not_found_for_unregistered_phone(): void
    {
        $staff = User::factory()->create([
            'role' => 'cashier',
            'role_access' => ['orders'],
        ]);

        $response = $this->actingAs($staff)
            ->getJson('/api/orders/lookup-loyalty?phone=09170000000');

        $response->assertOk()
            ->assertJson([
                'found' => false,
                'message' => 'No loyalty account for this number',
            ]);
    }

    public function test_lookup_validates_phone_format_and_rejects_unauthorized_users(): void
    {
        $staff = User::factory()->create([
            'role' => 'cashier',
        ]);

        // Invalid phone (not starting with 09)
        $this->actingAs($staff)
            ->getJson('/api/orders/lookup-loyalty?phone=08123456789')
            ->assertStatus(422);

        // Invalid length
        $this->actingAs($staff)
            ->getJson('/api/orders/lookup-loyalty?phone=0912345')
            ->assertStatus(422);

        // Customer role denied (no orders page access)
        $customerUser = User::factory()->create(['role' => 'customer']);
        $this->actingAs($customerUser)
            ->getJson('/api/orders/lookup-loyalty?phone=09171234567')
            ->assertStatus(403);
    }

    public function test_guest_is_denied_from_loyalty_lookup(): void
    {
        $this->getJson('/api/orders/lookup-loyalty?phone=09171234567')
            ->assertStatus(401);
    }

    public function test_pos_store_saves_loyalty_customer_id_and_keeps_customer_id_null(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin']);
        $customer = $this->createCustomer(['loyalty_points' => 0]);

        $payload = [
            'customer_name' => 'Walkin Guest',
            'order_type' => 'Dine-in',
            'loyalty_customer_id' => $customer->id,
            'items' => [
                [
                    'name' => 'Cheeseburger',
                    'qty' => 2,
                    'unit_price' => 150.00,
                ],
            ],
        ];

        $response = $this->actingAs($admin)
            ->postJson('/api/orders', $payload);

        $response->assertStatus(201);

        $orderId = $response->json('data.db_id');
        $order = Order::find($orderId);

        $this->assertNotNull($order);
        $this->assertNull($order->customer_id, 'Walk-in order customer_id must be strictly null');
        $this->assertEquals($customer->id, $order->loyalty_customer_id);
        $this->assertEquals('Dine-in', $order->order_type);
        $this->assertEquals(300.00, $order->total);
    }

    public function test_walk_in_order_completion_credits_points_to_loyalty_customer_id(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin']);
        $customer = $this->createCustomer(['loyalty_points' => 50]);

        $order = Order::query()->create([
            'order_code' => '#ORD-WALK-89',
            'customer_name' => 'Walkin Member',
            'order_type' => 'Takeout',
            'customer_id' => null,
            'loyalty_customer_id' => $customer->id,
            'total' => 450.00,
            'status' => 'Preparing',
            'payment_method' => 'COD',
            'payment_status' => 'Paid',
        ]);

        OrderItem::query()->create([
            'order_id' => $order->id,
            'name' => 'Crispy Chicken Box',
            'qty' => 3,
            'unit_price' => 150.00,
            'line_total' => 450.00,
        ]);

        // Complete order: food total 450 ÷ 2.00 spend_per_point = 225 points
        $this->actingAs($admin)
            ->patchJson("/api/orders/{$order->id}/status", [
                'status' => 'Completed',
            ])
            ->assertOk();

        $customer->refresh();
        $this->assertEquals(275, $customer->loyalty_points); // 50 + 225
        $this->assertNotNull($customer->points_expire_at);
        $this->assertEquals(now()->addDays(30)->toDateString(), $customer->points_expire_at->toDateString());

        // Check ledger
        $ledger = LoyaltyLedger::query()->where('order_id', $order->id)->first();
        $this->assertNotNull($ledger);
        $this->assertEquals('earn', $ledger->type);
        $this->assertEquals(225, $ledger->points);
        $this->assertEquals(275, $ledger->balance_after);
        $this->assertEquals("Earned from walk-in order {$order->order_code}", $ledger->note);

        // Idempotency: creditForOrder called again does not duplicate
        app(LoyaltyService::class)->creditForOrder($order->fresh());
        $this->assertEquals(1, LoyaltyLedger::query()->where('order_id', $order->id)->where('type', 'earn')->count());
        $this->assertEquals(275, $customer->fresh()->loyalty_points);
    }

    public function test_walk_in_order_without_loyalty_customer_or_cancelled_earns_nothing(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin']);
        $customer = $this->createCustomer(['loyalty_points' => 100]);

        // Walk-in order with NO member
        $orderNoMember = Order::query()->create([
            'order_code' => '#ORD-WALK-NOMEM',
            'customer_name' => 'Anonymous Walkin',
            'order_type' => 'Dine-in',
            'customer_id' => null,
            'loyalty_customer_id' => null,
            'total' => 600.00,
            'status' => 'Preparing',
            'payment_method' => 'COD',
            'payment_status' => 'Paid',
        ]);
        OrderItem::query()->create([
            'order_id' => $orderNoMember->id,
            'name' => 'Family Meal',
            'qty' => 1,
            'unit_price' => 600.00,
            'line_total' => 600.00,
        ]);

        $this->actingAs($admin)
            ->patchJson("/api/orders/{$orderNoMember->id}/status", ['status' => 'Completed'])
            ->assertOk();

        $this->assertEquals(0, LoyaltyLedger::query()->where('order_id', $orderNoMember->id)->count());

        // Walk-in order with member that gets CANCELLED
        $orderCancelled = Order::query()->create([
            'order_code' => '#ORD-WALK-CANCEL',
            'customer_name' => 'Cancelled Walkin',
            'order_type' => 'Dine-in',
            'customer_id' => null,
            'loyalty_customer_id' => $customer->id,
            'total' => 300.00,
            'status' => 'Preparing',
            'payment_method' => 'COD',
            'payment_status' => 'Paid',
        ]);
        OrderItem::query()->create([
            'order_id' => $orderCancelled->id,
            'name' => 'Burger Combo',
            'qty' => 1,
            'unit_price' => 300.00,
            'line_total' => 300.00,
        ]);

        $this->actingAs($admin)
            ->patchJson("/api/orders/{$orderCancelled->id}/status", [
                'status' => 'Cancelled',
                'cancellation_reason' => 'Customer request',
            ])
            ->assertOk();

        $this->assertEquals(0, LoyaltyLedger::query()->where('order_id', $orderCancelled->id)->count());
        $this->assertEquals(100, $customer->fresh()->loyalty_points);
    }

    public function test_customer_management_totals_exclude_walk_in_orders_with_null_customer_id(): void
    {
        $staff = User::factory()->create([
            'role' => 'admin',
        ]);

        $customer = $this->createCustomer();

        // 1 Online Order linked via customer_id
        Order::query()->create([
            'order_code' => '#ORD-ONLINE-1',
            'customer_id' => $customer->id,
            'loyalty_customer_id' => null,
            'customer_name' => $customer->full_name,
            'order_type' => 'Online Order',
            'total' => 500.00,
            'status' => 'Completed',
            'payment_method' => 'COD',
            'payment_status' => 'Paid',
        ]);

        // 2 Walk-in Orders where loyalty_customer_id = $customer->id, but customer_id = null
        Order::query()->create([
            'order_code' => '#ORD-WALK-1',
            'customer_id' => null,
            'loyalty_customer_id' => $customer->id,
            'customer_name' => $customer->full_name,
            'order_type' => 'Dine-in',
            'total' => 300.00,
            'status' => 'Completed',
            'payment_method' => 'COD',
            'payment_status' => 'Paid',
        ]);
        Order::query()->create([
            'order_code' => '#ORD-WALK-2',
            'customer_id' => null,
            'loyalty_customer_id' => $customer->id,
            'customer_name' => $customer->full_name,
            'order_type' => 'Takeout',
            'total' => 200.00,
            'status' => 'Completed',
            'payment_method' => 'COD',
            'payment_status' => 'Paid',
        ]);

        // Query Customer Management API
        $response = $this->actingAs($staff)
            ->getJson('/api/customers');

        $response->assertOk();
        $targetCustomer = collect($response->json('data'))->firstWhere('db_id', $customer->id);

        $this->assertNotNull($targetCustomer);
        // Only 1 online order should be counted, not 3
        $this->assertEquals(1, $targetCustomer['orders']);
        $this->assertEquals(500.00, $targetCustomer['spent']);
    }
}
