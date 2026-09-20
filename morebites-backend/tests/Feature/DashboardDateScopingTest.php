<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
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

    public function test_total_sales_and_status_counts_match_today_orders(): void
    {
        Sanctum::actingAs($this->admin);

        // Yesterday order
        $yesterdayOrder = Order::query()->create([
            'order_code' => '#ORD-00010',
            'customer_name' => 'Past Customer',
            'order_type' => 'Online Order',
            'total' => 1000.00,
            'status' => 'Completed',
        ]);
        $yesterdayOrder->created_at = Carbon::yesterday();
        $yesterdayOrder->save();

        // Today order
        Order::query()->create([
            'order_code' => '#ORD-00011',
            'customer_name' => 'Today Customer',
            'order_type' => 'Online Order',
            'total' => 250.00,
            'status' => 'Preparing',
        ]);

        $res = $this->getJson('/api/dashboard');
        $res->assertOk();

        $this->assertEquals(250.00, $res->json('data.stats.total_sales'));
        $this->assertEquals('₱250.00', $res->json('data.stats.total_sales_label'));
        $this->assertEquals(1, $res->json('data.stats.total_orders'));

        $preparingCount = collect($res->json('data.order_status'))->firstWhere('name', 'Preparing');
        $this->assertEquals(1, $preparingCount['value']);
    }
}

