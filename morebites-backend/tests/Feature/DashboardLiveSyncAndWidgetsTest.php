<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\InventoryItem;
use App\Models\Order;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DashboardLiveSyncAndWidgetsTest extends TestCase
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
            'allowed_pages' => ['Dashboard', 'Orders', 'Inventory'],
        ]);
    }

    public function test_active_driver_count_matches_case_insensitively_and_supports_multi_role(): void
    {
        Sanctum::actingAs($this->admin);

        // 1. Primary role driver with Title Case 'Active'
        User::query()->create([
            'name' => 'Driver One',
            'email' => 'driver1@test.com',
            'password' => Hash::make('secret'),
            'role' => 'driver',
            'status' => 'Active',
        ]);

        // 2. Primary role driver with lowercase 'active'
        User::query()->create([
            'name' => 'Driver Two',
            'email' => 'driver2@test.com',
            'password' => Hash::make('secret'),
            'role' => 'driver',
            'status' => 'active',
        ]);

        // 3. Multi-role staff with driver in role_access
        User::query()->create([
            'name' => 'Driver Three (Staff multi-role)',
            'email' => 'driver3@test.com',
            'password' => Hash::make('secret'),
            'role' => 'cashier',
            'role_access' => ['cashier', 'driver'],
            'status' => 'Active',
        ]);

        // 4. Inactive driver (should NOT be counted)
        User::query()->create([
            'name' => 'Driver Inactive',
            'email' => 'driver-inactive@test.com',
            'password' => Hash::make('secret'),
            'role' => 'driver',
            'status' => 'Inactive',
        ]);

        // 5. Blocklisted driver (should NOT be counted)
        User::query()->create([
            'name' => 'Driver Blocked',
            'email' => 'driver-blocked@test.com',
            'password' => Hash::make('secret'),
            'role' => 'driver',
            'status' => 'Blocklisted',
        ]);

        // 6. Archived driver (should NOT be counted)
        User::query()->create([
            'name' => 'Driver Archived',
            'email' => 'driver-archived@test.com',
            'password' => Hash::make('secret'),
            'role' => 'driver',
            'status' => 'Active',
            'archived_at' => now(),
        ]);

        $res = $this->getJson('/api/dashboard');
        $res->assertOk();
        $this->assertEquals(3, $res->json('data.stats.active_drivers'));
    }

    public function test_low_stock_alert_evaluates_numerical_reorder_level_and_excludes_archived(): void
    {
        Sanctum::actingAs($this->admin);

        // 1. Item with status 'Expiring Soon' but numerical stock <= reorder_level
        InventoryItem::query()->create([
            'name' => 'Butter',
            'category' => 'Dairy',
            'stock' => 3.0,
            'unit' => 'kg',
            'reorder_level' => 5.0,
            'status' => 'Expiring Soon',
        ]);

        // 2. Item with status 'Out of Stock'
        InventoryItem::query()->create([
            'name' => 'Sugar',
            'category' => 'Baking',
            'stock' => 0.0,
            'unit' => 'kg',
            'reorder_level' => 10.0,
            'status' => 'Out of Stock',
        ]);

        // 3. Item with status 'Sufficient' and high stock (should NOT be counted)
        InventoryItem::query()->create([
            'name' => 'Flour',
            'category' => 'Baking',
            'stock' => 50.0,
            'unit' => 'kg',
            'reorder_level' => 10.0,
            'status' => 'Sufficient',
        ]);

        // 4. Archived item (should NOT be counted even if stock is 0)
        InventoryItem::query()->create([
            'name' => 'Old Spice',
            'category' => 'Spices',
            'stock' => 0.0,
            'unit' => 'g',
            'reorder_level' => 10.0,
            'status' => 'Archived',
        ]);

        $res = $this->getJson('/api/dashboard');
        $res->assertOk();

        $this->assertEquals(2, $res->json('data.stats.low_stocks_count'));
        $names = collect($res->json('data.low_stocks'))->pluck('name')->all();
        $this->assertContains('Butter', $names);
        $this->assertContains('Sugar', $names);
        $this->assertNotContains('Flour', $names);
        $this->assertNotContains('Old Spice', $names);
    }

    public function test_sales_overview_handles_timezone_and_periods(): void
    {
        Sanctum::actingAs($this->admin);

        // Manila today at 2:30 PM (14:30 PHT = 06:30 UTC)
        $manilaToday2pm = Carbon::now('Asia/Manila')->setTime(14, 30, 0)->setTimezone('UTC');
        // Manila today at 9:15 PM (21:15 PHT = 13:15 UTC) — outside default "To 8:00 PM" filter
        $manilaToday9pm = Carbon::now('Asia/Manila')->setTime(21, 15, 0)->setTimezone('UTC');

        $order = Order::query()->create([
            'order_code' => '#ORD-00101',
            'customer_name' => 'Afternoon Customer',
            'order_type' => 'Online Order',
            'total' => 450.00,
            'status' => 'Completed',
        ]);
        $order->created_at = $manilaToday2pm;
        $order->save();

        $eveningOrder = Order::query()->create([
            'order_code' => '#ORD-00105',
            'customer_name' => 'Evening Customer',
            'order_type' => 'Online Order',
            'total' => 250.00,
            'status' => 'Delivered',
        ]);
        $eveningOrder->created_at = $manilaToday9pm;
        $eveningOrder->save();

        // Daily view: chart slots must include both 2 PM and 9 PM and sum to Total Sales (700.00)
        $resDaily = $this->getJson('/api/dashboard?period=Daily&from_time=From%208:00%20AM&to_time=To%208:00%20PM');
        $resDaily->assertOk();
        $salesDaily = $resDaily->json('data.sales');
        $totalSalesStat = (float) $resDaily->json('data.stats.total_sales');

        $twoPmSlot = collect($salesDaily)->firstWhere('t', '2 PM');
        $this->assertNotNull($twoPmSlot);
        $this->assertEquals(450.00, $twoPmSlot['v']);

        // Evening order placed at 10:15 PM PHT (outside standard 8am-8pm window)
        $manilaToday10pm = Carbon::now('Asia/Manila')->setTime(22, 15, 0)->setTimezone('UTC');
        $orderLate = Order::query()->create([
            'order_code' => '#ORD-00109',
            'customer_name' => 'Late Customer',
            'order_type' => 'Online Order',
            'total' => 200.00,
            'status' => 'Completed',
        ]);
        $orderLate->created_at = $manilaToday10pm;
        $orderLate->save();

        // Even with from_hour=8 and to_hour=20, slots dynamically expand to include hours with sales
        $resDailyLate = $this->getJson('/api/dashboard?period=Daily&from_hour=8&to_hour=20');
        $resDailyLate->assertOk();
        $tenPmSlot = collect($resDailyLate->json('data.sales'))->firstWhere('t', '10 PM');
        $this->assertNotNull($tenPmSlot, '10 PM slot should exist dynamically when sales occur at 10 PM');
        $this->assertEquals(200.00, $tenPmSlot['v']);

        // Weekly view
        $resWeekly = $this->getJson('/api/dashboard?period=Weekly');
        $resWeekly->assertOk();
        $salesWeekly = $resWeekly->json('data.sales');
        $currentDayName = Carbon::now('Asia/Manila')->format('D');
        $daySlot = collect($salesWeekly)->firstWhere('t', $currentDayName);
        $this->assertNotNull($daySlot);
        $this->assertEquals(650.00, $daySlot['v']);

        // Monthly view
        $resMonthly = $this->getJson('/api/dashboard?period=Monthly');
        $resMonthly->assertOk();
        $this->assertNotEmpty($resMonthly->json('data.sales'));

        // Yearly view
        $resYearly = $this->getJson('/api/dashboard?period=Yearly');
        $resYearly->assertOk();
        $salesYearly = $resYearly->json('data.sales');
        $currentMonthName = Carbon::now('Asia/Manila')->format('M');
        $monthSlot = collect($salesYearly)->firstWhere('t', $currentMonthName);
        $this->assertNotNull($monthSlot);
        $this->assertEquals(650.00, $monthSlot['v']);
    }

    public function test_inventory_and_order_actions_populate_activity_log(): void
    {
        Sanctum::actingAs($this->admin);

        // 1. Inventory restock action via API
        $item = InventoryItem::query()->create([
            'name' => 'Chicken Breast',
            'category' => 'Meat',
            'stock' => 10.0,
            'unit' => 'kg',
            'reorder_level' => 5.0,
            'status' => 'Sufficient',
        ]);

        $this->postJson("/api/inventory/{$item->id}/restock", [
            'quantity' => 15.0,
            'date_placed' => now()->toDateString(),
            'expiry_date' => now()->addDays(10)->toDateString(),
        ])->assertOk();

        // 2. Order creation and status change via API
        $order = Order::query()->create([
            'order_code' => '#ORD-00102',
            'customer_name' => 'Test Customer',
            'order_type' => 'Online Order',
            'total' => 300.00,
            'status' => 'Pending',
        ]);

        $this->patchJson("/api/orders/{$order->id}/status", [
            'status' => 'Preparing',
        ])->assertOk();

        $res = $this->getJson('/api/dashboard');
        $res->assertOk();

        $activityLog = $res->json('data.activity_log');
        $actions = collect($activityLog)->pluck('action')->all();

        $hasRestockLog = collect($actions)->contains(fn ($act) => str_contains($act, 'Chicken Breast'));
        $hasOrderStatusLog = collect($actions)->contains(fn ($act) => str_contains($act, 'Order #ORD-00102 status updated to Preparing'));

        $this->assertTrue($hasRestockLog, 'ActivityLog should contain inventory restock action');
        $this->assertTrue($hasOrderStatusLog, 'ActivityLog should contain order status change action');
    }
}
