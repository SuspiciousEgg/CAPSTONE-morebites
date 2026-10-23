<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\LoyaltyLedger;
use App\Models\LoyaltySetting;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\User;
use App\Services\LoyaltyService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LoyaltyPointsRedemptionTest extends TestCase
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
        static $seq = 4000;
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
            'delivery_address' => '123 Main St, Barangay 1, Caloocan',
            'status' => 'ACTIVE',
            'registered_at' => now(),
            'loyalty_points' => 0,
        ], $customerAttrs));

        return [$user, $customer];
    }

    private function createStaffUser(): User
    {
        static $staffSeq = 4000;
        $staffSeq++;

        return User::query()->create([
            'name' => "Staff {$staffSeq}",
            'phone' => "0918000{$staffSeq}",
            'email' => "staff{$staffSeq}@morebites.test",
            'password' => bcrypt('password123'),
            'role' => 'admin',
            'status' => 'ACTIVE',
        ]);
    }

    public function test_customer_can_redeem_points_up_to_food_subtotal_at_checkout()
    {
        [$user, $customer] = $this->createCustomerUser([], [
            'loyalty_points' => 150,
            'points_expire_at' => now()->addDays(30),
        ]);

        $item = MenuItem::query()->create([
            'name' => 'Burger Combo',
            'category' => 'Snacks',
            'price' => 200.00,
            'available' => true,
        ]);

        $payload = [
            'full_name' => $customer->full_name,
            'phone' => $customer->phone,
            'delivery_address' => '123 Main St, Barangay 1, Caloocan',
            'payment_method' => 'COD',
            'latitude' => 7.6100,
            'longitude' => 124.9890,
            'use_points' => true,
            'expected_points' => 150,
            'items' => [
                [
                    'menu_item_id' => $item->id,
                    'name' => $item->name,
                    'qty' => 1,
                    'unit_price' => 200.00,
                ],
            ],
        ];

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/customer/orders', $payload);

        $response->assertCreated();
        $orderData = $response->json('data');

        // Food subtotal = 200
        // 150 pts * 0.10 = 15.00 discount
        // Delivery fee + service fee paid in full
        $this->assertSame(150, $orderData['points_used']);
        $this->assertEquals(15.00, $orderData['points_discount']);
        $expectedTotal = (200 - 15) + (float) $orderData['delivery_fee'] + (float) $orderData['service_fee'];
        $this->assertEquals($expectedTotal, $orderData['total']);

        // Customer balance should be zeroed
        $customer->refresh();
        $this->assertSame(0, (int) $customer->loyalty_points);

        // Redeem entry in ledger
        $redeemLedger = LoyaltyLedger::query()->where('customer_id', $customer->id)->where('type', 'redeem')->first();
        $this->assertNotNull($redeemLedger);
        $this->assertSame(-150, (int) $redeemLedger->points);
        $this->assertSame(0, (int) $redeemLedger->balance_after);
    }

    public function test_points_can_cover_100_percent_of_food_subtotal_but_never_fees()
    {
        [$user, $customer] = $this->createCustomerUser([], [
            'loyalty_points' => 500, // worth ₱50.00
            'points_expire_at' => now()->addDays(30),
        ]);

        $item = MenuItem::query()->create([
            'name' => 'Fries',
            'category' => 'Snacks',
            'price' => 40.00,
            'available' => true,
        ]);

        // Food subtotal = 40.00. Max points needed = ceil(40 / 0.1) = 400 points
        $payload = [
            'full_name' => $customer->full_name,
            'phone' => $customer->phone,
            'delivery_address' => '123 Main St, Barangay 1, Caloocan',
            'payment_method' => 'COD',
            'latitude' => 7.6100,
            'longitude' => 124.9890,
            'use_points' => true,
            'items' => [
                [
                    'menu_item_id' => $item->id,
                    'name' => $item->name,
                    'qty' => 1,
                    'unit_price' => 40.00,
                ],
            ],
        ];

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/customer/orders', $payload);

        $response->assertCreated();
        $orderData = $response->json('data');

        $this->assertSame(400, $orderData['points_used']);
        $this->assertEquals(40.00, $orderData['points_discount']);

        // Fees are never discounted
        $expectedTotal = (float) $orderData['delivery_fee'] + (float) $orderData['service_fee'];
        $this->assertEquals($expectedTotal, $orderData['total']);

        // Remaining balance = 500 - 400 = 100 points
        $customer->refresh();
        $this->assertSame(100, (int) $customer->loyalty_points);

        // When order is marked Delivered/Completed, 0 points earned because food was 100% covered
        $order = Order::find($orderData['db_id']);
        $order->update(['status' => 'Delivered']);
        app(LoyaltyService::class)->creditForOrder($order);

        $earnEntry = LoyaltyLedger::query()->where('order_id', $order->id)->where('type', 'earn')->first();
        $this->assertNull($earnEntry);
    }

    public function test_redemption_rejected_if_balance_is_below_minimum()
    {
        [$user, $customer] = $this->createCustomerUser([], [
            'loyalty_points' => 80, // below 100 minimum
            'points_expire_at' => now()->addDays(30),
        ]);

        $item = MenuItem::query()->create([
            'name' => 'Burger',
            'category' => 'Snacks',
            'price' => 150.00,
            'available' => true,
        ]);

        $payload = [
            'full_name' => $customer->full_name,
            'phone' => $customer->phone,
            'delivery_address' => '123 Main St, Barangay 1, Caloocan',
            'payment_method' => 'COD',
            'latitude' => 7.6100,
            'longitude' => 124.9890,
            'use_points' => true,
            'items' => [
                [
                    'menu_item_id' => $item->id,
                    'name' => $item->name,
                    'qty' => 1,
                    'unit_price' => 150.00,
                ],
            ],
        ];

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/customer/orders', $payload);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['points']);
    }

    public function test_redemption_rejected_if_balance_changed_meanwhile()
    {
        [$user, $customer] = $this->createCustomerUser([], [
            'loyalty_points' => 100,
            'points_expire_at' => now()->addDays(30),
        ]);

        $item = MenuItem::query()->create([
            'name' => 'Burger',
            'category' => 'Snacks',
            'price' => 150.00,
            'available' => true,
        ]);

        $payload = [
            'full_name' => $customer->full_name,
            'phone' => $customer->phone,
            'delivery_address' => '123 Main St, Barangay 1, Caloocan',
            'payment_method' => 'COD',
            'latitude' => 7.6100,
            'longitude' => 124.9890,
            'use_points' => true,
            'expected_points' => 200, // higher than actual 100
            'items' => [
                [
                    'menu_item_id' => $item->id,
                    'name' => $item->name,
                    'qty' => 1,
                    'unit_price' => 150.00,
                ],
            ],
        ];

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/customer/orders', $payload);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['points']);
    }

    public function test_staff_cancel_flow_refunds_points_and_restarts_expiry()
    {
        [$user, $customer] = $this->createCustomerUser([], [
            'loyalty_points' => 150,
            'points_expire_at' => now()->addDays(5),
        ]);

        $item = MenuItem::query()->create([
            'name' => 'Pizza',
            'category' => 'Pizza',
            'price' => 300.00,
            'available' => true,
        ]);

        $payload = [
            'full_name' => $customer->full_name,
            'phone' => $customer->phone,
            'delivery_address' => '123 Main St, Barangay 1, Caloocan',
            'payment_method' => 'COD',
            'latitude' => 7.6100,
            'longitude' => 124.9890,
            'use_points' => true,
            'items' => [
                [
                    'menu_item_id' => $item->id,
                    'name' => $item->name,
                    'qty' => 1,
                    'unit_price' => 300.00,
                ],
            ],
        ];

        $placeResp = $this->actingAs($user, 'sanctum')->postJson('/api/customer/orders', $payload);
        $placeResp->assertCreated();
        $dbId = $placeResp->json('data.db_id');

        $customer->refresh();
        $this->assertSame(0, (int) $customer->loyalty_points);

        $staff = $this->createStaffUser();
        $order = Order::find($dbId);

        // Staff cancels order
        $cancelResp = $this->actingAs($staff, 'sanctum')->patchJson("/api/orders/{$order->id}/status", [
            'status' => 'Cancelled',
            'cancellation_reason' => 'Customer requested cancellation',
        ]);
        $cancelResp->assertOk();

        // Points must be restored to customer
        $customer->refresh();
        $this->assertSame(150, (int) $customer->loyalty_points);
        $this->assertNotNull($customer->points_expire_at);
        $this->assertTrue(now()->addDays(28)->lessThan($customer->points_expire_at));

        // Refund ledger entry written
        $refundLedger = LoyaltyLedger::query()->where('order_id', $order->id)->where('type', 'refund')->first();
        $this->assertNotNull($refundLedger);
        $this->assertSame(150, (int) $refundLedger->points);
        $this->assertSame(150, (int) $refundLedger->balance_after);

        // Second cancel attempt does not double refund
        $this->actingAs($staff, 'sanctum')->patchJson("/api/orders/{$order->id}/status", [
            'status' => 'Cancelled',
        ]);
        $customer->refresh();
        $this->assertSame(150, (int) $customer->loyalty_points);
        $this->assertSame(1, LoyaltyLedger::query()->where('order_id', $order->id)->where('type', 'refund')->count());
    }
}
