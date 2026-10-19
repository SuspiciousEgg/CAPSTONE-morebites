<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\InventoryBatch;
use App\Models\InventoryItem;
use App\Models\LoyaltyLedger;
use App\Models\LoyaltySetting;
use App\Models\MenuItem;
use App\Models\MenuItemIngredient;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OrderPlacementIdempotencyTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Customer $customer;
    private MenuItem $menuItem;
    private InventoryItem $inventoryItem;

    protected function setUp(): void
    {
        parent::setUp();

        LoyaltySetting::query()->delete();
        LoyaltySetting::query()->create([
            'spend_per_point' => 10.00,
            'peso_value_per_point' => 1.00,
            'minimum_points_to_redeem' => 10,
            'points_expiry_days' => 30,
            'enabled' => true,
        ]);

        $this->user = User::query()->create([
            'name' => 'Ana Reyes',
            'email' => 'ana@example.com',
            'phone' => '09123456789',
            'password' => bcrypt('password123'),
            'role' => 'customer',
            'status' => 'Active',
        ]);

        $this->customer = Customer::query()->create([
            'user_id' => $this->user->id,
            'customer_code' => 'CUST-00010',
            'full_name' => 'Ana Reyes',
            'phone' => '09123456789',
            'delivery_address' => '123 Rizal St, Manila',
            'status' => 'ACTIVE',
            'registered_at' => now(),
            'loyalty_points' => 50,
            'points_expire_at' => now()->addDays(30),
        ]);

        $this->inventoryItem = InventoryItem::query()->create([
            'name' => 'Pizza Dough',
            'category' => 'Ingredients',
            'unit' => 'pcs',
            'stock' => 10,
            'reorder_point' => 2,
            'status' => 'In Stock',
        ]);

        InventoryBatch::query()->create([
            'inventory_item_id' => $this->inventoryItem->id,
            'batch_no' => 'BATCH-DOUGH-1',
            'stock' => 10,
            'initial_stock' => 10,
            'date_placed' => now(),
            'expiry_date' => now()->addDays(10),
            'status' => 'In Stock',
        ]);

        $this->menuItem = MenuItem::query()->create([
            'name' => 'Cheese Pizza',
            'category' => 'Pizza',
            'price' => 200.00,
            'available' => true,
            'has_sizes' => false,
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $this->menuItem->id,
            'inventory_item_id' => $this->inventoryItem->id,
            'qty_per_serving' => 1,
            'unit' => 'pcs',
        ]);
    }

    private function orderPayload(string $idempotencyKey, bool $usePoints = false): array
    {
        return [
            'idempotency_key' => $idempotencyKey,
            'full_name' => 'Ana Reyes',
            'phone' => '09123456789',
            'delivery_address' => '123 Rizal St, Poblacion',
            'latitude' => 7.6100,
            'longitude' => 124.9890,
            'payment_method' => 'COD',
            'use_points' => $usePoints,
            'expected_points' => $usePoints ? 50 : null,
            'items' => [
                [
                    'menu_item_id' => $this->menuItem->id,
                    'name' => 'Cheese Pizza',
                    'qty' => 1,
                    'unit_price' => 200.00,
                ],
            ],
        ];
    }

    public function test_place_order_with_idempotency_key_creates_order_and_saves_key(): void
    {
        $payload = $this->orderPayload('chk_attempt_1');

        $res = $this->actingAs($this->user, 'sanctum')->postJson('/api/customer/orders', $payload);

        $res->assertStatus(201);
        $orderId = $res->json('data.id');
        $this->assertNotNull($orderId);

        $this->assertDatabaseHas('orders', [
            'idempotency_key' => 'chk_attempt_1',
            'customer_id' => $this->customer->id,
        ]);

        // Dough should be deducted: 10 - 1 = 9
        $this->assertEquals(9, $this->inventoryItem->fresh()->stock);
    }

    public function test_same_idempotency_key_returns_existing_order_and_never_deducts_stock_or_points_twice(): void
    {
        $payload = $this->orderPayload('chk_attempt_duplicate_test', true);

        // First tap / request
        $res1 = $this->actingAs($this->user, 'sanctum')->postJson('/api/customer/orders', $payload);
        $res1->assertStatus(201);
        $orderId1 = $res1->json('data.id');

        // Check stock and points after first call
        $stockAfterFirst = (float) $this->inventoryItem->fresh()->stock;
        $this->assertEquals(9.0, $stockAfterFirst);

        // 50 points redeemed
        $pointsAfterFirst = (int) $this->customer->fresh()->loyalty_points;
        $this->assertEquals(0, $pointsAfterFirst);

        $orderCount = Order::query()->count();
        $this->assertEquals(1, $orderCount);

        // Second tap / retry with exact same idempotency_key
        $res2 = $this->actingAs($this->user, 'sanctum')->postJson('/api/customer/orders', $payload);
        $res2->assertSuccessful();

        $orderId2 = $res2->json('data.id');
        $this->assertEquals($orderId1, $orderId2);

        // Orders table must STILL have only 1 order
        $this->assertEquals(1, Order::query()->count());

        // Stock must NOT be deducted a second time
        $this->assertEquals($stockAfterFirst, (float) $this->inventoryItem->fresh()->stock);

        // Points must NOT be deducted a second time
        $this->assertEquals($pointsAfterFirst, (int) $this->customer->fresh()->loyalty_points);

        // Loyalty ledger must only have 1 redeem row for this order
        $this->assertEquals(1, LoyaltyLedger::query()->where('customer_id', $this->customer->id)->count());
    }

    public function test_lookup_order_by_key_returns_order_if_found_and_404_if_not(): void
    {
        // 1. Non-existent key -> 404
        $res404 = $this->actingAs($this->user, 'sanctum')
            ->getJson('/api/customer/orders/by-key/non_existent_key_123');
        $res404->assertStatus(404)
            ->assertJsonPath('message', 'Order not found.');

        // 2. Place order with key
        $key = 'chk_lookup_test_456';
        $payload = $this->orderPayload($key);
        $placeRes = $this->actingAs($this->user, 'sanctum')->postJson('/api/customer/orders', $payload);
        $placeRes->assertCreated();

        // 3. Existing key -> 200 with order payload
        $resFound = $this->actingAs($this->user, 'sanctum')
            ->getJson('/api/customer/orders/by-key/'.$key);
        $resFound->assertStatus(200)
            ->assertJsonPath('data.customer', 'Ana Reyes');
    }

    public function test_different_idempotency_key_creates_distinct_order(): void
    {
        $res1 = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/customer/orders', $this->orderPayload('key_alpha'));
        $res1->assertCreated();

        $res2 = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/customer/orders', $this->orderPayload('key_beta'));
        $res2->assertCreated();

        $this->assertEquals(2, Order::query()->count());
        $this->assertEquals(8, $this->inventoryItem->fresh()->stock);
    }

    public function test_same_key_for_different_customers_creates_separate_orders(): void
    {
        $otherUser = User::query()->create([
            'name' => 'Carlos Dalisay',
            'email' => 'carlos@example.com',
            'phone' => '09198765432',
            'password' => bcrypt('password123'),
            'role' => 'customer',
            'status' => 'Active',
        ]);

        Customer::query()->create([
            'user_id' => $otherUser->id,
            'customer_code' => 'CUST-00011',
            'full_name' => 'Carlos Dalisay',
            'phone' => '09198765432',
            'delivery_address' => '456 Mabini St, Poblacion',
            'status' => 'ACTIVE',
            'registered_at' => now(),
            'loyalty_points' => 0,
        ]);

        $sharedKey = 'shared_identical_key_777';

        // Customer 1 places order with sharedKey
        $res1 = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/customer/orders', $this->orderPayload($sharedKey));
        $res1->assertCreated();

        // Customer 2 places order with same sharedKey
        $payload2 = $this->orderPayload($sharedKey);
        $payload2['full_name'] = 'Carlos Dalisay';
        $payload2['phone'] = '09198765432';

        $res2 = $this->actingAs($otherUser, 'sanctum')
            ->postJson('/api/customer/orders', $payload2);
        $res2->assertCreated();

        // Both orders created because idempotency key is unique per customer
        $this->assertEquals(2, Order::query()->count());
    }

    public function test_order_without_idempotency_key_creates_order_normally(): void
    {
        $payload = $this->orderPayload('will_be_removed');
        unset($payload['idempotency_key']);

        $res = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/customer/orders', $payload);

        $res->assertCreated();
        $this->assertNull($res->json('data.idempotency_key'));
    }
}
