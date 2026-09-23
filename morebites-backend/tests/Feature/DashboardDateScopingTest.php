<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Customer;
use App\Models\Order;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DashboardDateScopingTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::query()->create([
            'name' => 'Admin User',
            'email' => 'admin@test.com',
            'password' => Hash::make('password'),
            'role' => 'admin',
            'status' => 'Active',
        ]);
    }

    public function test_activity_log_is_strictly_scoped_to_today(): void
    {
        Sanctum::actingAs($this->admin);

        // Activity log from yesterday
        $yesterdayLog = ActivityLog::query()->create([
            'actor' => 'Admin',
            'action' => 'Yesterday Action',
        ]);
        $yesterdayLog->created_at = Carbon::yesterday();
        $yesterdayLog->save();

        // Activity log from today
        $todayLog = ActivityLog::query()->create([
            'actor' => 'Admin',
            'action' => 'Today Action',
        ]);

        $res = $this->getJson('/api/dashboard');
        $res->assertOk();

        $activityLog = $res->json('data.activity_log');
        $actions = collect($activityLog)->pluck('action')->all();

        $this->assertContains('Today Action', $actions);
        $this->assertNotContains('Yesterday Action', $actions);
    }

    public function test_recent_orders_are_strictly_scoped_to_today(): void
    {
        Sanctum::actingAs($this->admin);

        // Order from yesterday
        $yesterdayOrder = Order::query()->create([
            'order_code' => '#ORD-00001',
            'customer_name' => 'Yesterday Customer',
            'order_type' => 'Online Order',
            'total' => 120.00,
            'status' => 'Completed',
        ]);
        $yesterdayOrder->created_at = Carbon::yesterday();
        $yesterdayOrder->save();

        // Order from today
        $todayOrder = Order::query()->create([
            'order_code' => '#ORD-00002',
            'customer_name' => 'Today Customer',
            'order_type' => 'Online Order',
            'total' => 350.50,
            'status' => 'Preparing',
        ]);

        $res = $this->getJson('/api/dashboard');
        $res->assertOk();

        $recentOrders = $res->json('data.recent_orders');
        $codes = collect($recentOrders)->pluck('id')->all();

        $this->assertContains('#ORD-00002', $codes);
        $this->assertNotContains('#ORD-00001', $codes);

        $matchingToday = collect($recentOrders)->firstWhere('id', '#ORD-00002');
        $this->assertEquals('₱350.50', $matchingToday['amount']);
        $this->assertEquals('Today Customer', $matchingToday['customer']);
    }

    public function test_total_sales_strictly_sums_completed_orders_and_returns_zero_honestly(): void
    {
        Sanctum::actingAs($this->admin);

        // Yesterday completed order (should NOT be counted in today's sales)
        $yesterdayOrder = Order::query()->create([
            'order_code' => '#ORD-00010',
            'customer_name' => 'Past Customer',
            'order_type' => 'Online Order',
            'total' => 1000.00,
            'status' => 'Completed',
        ]);
        $yesterdayOrder->created_at = Carbon::yesterday();
        $yesterdayOrder->save();

        // Today order with status Preparing (should NOT be counted in total_sales)
        Order::query()->create([
            'order_code' => '#ORD-00011',
            'customer_name' => 'Preparing Customer',
            'order_type' => 'Online Order',
            'total' => 250.00,
            'status' => 'Preparing',
        ]);

        // When no completed orders exist for today: display ₱0.00 honestly
        $res1 = $this->getJson('/api/dashboard');
        $res1->assertOk();
        $this->assertEquals(0.00, $res1->json('data.stats.total_sales'));
        $this->assertEquals('₱0.00', $res1->json('data.stats.total_sales_label'));

        // Today order with status Completed (MUST be counted in total_sales)
        Order::query()->create([
            'order_code' => '#ORD-00012',
            'customer_name' => 'Completed Customer',
            'order_type' => 'Online Order',
            'total' => 500.00,
            'status' => 'Completed',
        ]);

        $res2 = $this->getJson('/api/dashboard');
        $res2->assertOk();
        $this->assertEquals(500.00, $res2->json('data.stats.total_sales'));
        $this->assertEquals('₱500.00', $res2->json('data.stats.total_sales_label'));
        $this->assertEquals(2, $res2->json('data.stats.total_orders'));

        $preparingCount = collect($res2->json('data.order_status'))->firstWhere('name', 'Preparing');
        $this->assertEquals(1, $preparingCount['value']);
    }

    public function test_recent_orders_excludes_seeded_test_order_codes_and_resolves_customer_names(): void
    {
        Sanctum::actingAs($this->admin);

        // Seeded test order with non-standard code format and placeholder customer name
        Order::query()->create([
            'order_code' => '#ORD-PRIOR-1',
            'customer_name' => 'Buyer',
            'order_type' => 'Online Order',
            'total' => 2000.00,
            'status' => 'Completed',
        ]);

        // Registered customer order
        $customer = Customer::query()->create([
            'customer_code' => 'CUST-00001',
            'full_name' => 'Syan Benny',
            'phone' => '+639123456789',
        ]);

        Order::query()->create([
            'order_code' => '#ORD-00033',
            'customer_id' => $customer->id,
            'customer_name' => 'Placeholder',
            'order_type' => 'Online Order',
            'total' => 393.00,
            'status' => 'Completed',
        ]);

        // Walk-in order with customer_id null
        Order::query()->create([
            'order_code' => '#ORD-00034',
            'customer_id' => null,
            'customer_name' => 'Walk-in John',
            'order_type' => 'Walk-in',
            'total' => 150.00,
            'status' => 'Preparing',
        ]);

        $res = $this->getJson('/api/dashboard');
        $res->assertOk();

        $recentOrders = $res->json('data.recent_orders');
        $codes = collect($recentOrders)->pluck('id')->all();

        // Non-standard seeded code MUST be excluded
        $this->assertNotContains('#ORD-PRIOR-1', $codes);

        // Real codes MUST be included
        $this->assertContains('#ORD-00033', $codes);
        $this->assertContains('#ORD-00034', $codes);

        // Registered customer name resolved from customer relationship
        $order33 = collect($recentOrders)->firstWhere('id', '#ORD-00033');
        $this->assertEquals('Syan Benny', $order33['customer']);
        $this->assertEquals('₱393.00', $order33['amount']);

        // Walk-in customer name resolved from customer_name field
        $order34 = collect($recentOrders)->firstWhere('id', '#ORD-00034');
        $this->assertEquals('Walk-in John', $order34['customer']);
        $this->assertEquals('₱150.00', $order34['amount']);

        // Seeded order #ORD-PRIOR-1 (₱2000) must NOT inflate total sales
        $this->assertEquals(393.00, $res->json('data.stats.total_sales'));
        $this->assertEquals('₱393.00', $res->json('data.stats.total_sales_label'));
    }
}
