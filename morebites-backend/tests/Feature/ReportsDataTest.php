<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\ExportedReport;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ReportsDataTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::query()->create([
            'name' => 'Reports Admin',
            'email' => 'admin@morebites.test',
            'phone' => '+639171234567',
            'password' => Hash::make('password'),
            'role' => 'admin',
            'status' => 'Active',
        ]);
    }

    public function test_reports_customers_aggregates_completed_orders_and_derives_status(): void
    {
        // Customer 1: 15 completed orders -> Frequent
        $custFrequent = Customer::query()->create([
            'customer_code' => 'C-0001',
            'full_name' => 'Frequent Customer',
            'phone' => '+639171111111',
        ]);

        for ($i = 1; $i <= 15; $i++) {
            Order::query()->create([
                'order_code' => "#ORD-FREQ-{$i}",
                'order_type' => 'Online Order',
                'customer_id' => $custFrequent->id,
                'customer_name' => $custFrequent->full_name,
                'total' => 100,
                'status' => 'Completed',
                'created_at' => Carbon::now()->subDays(16 - $i),
            ]);
        }

        // Customer 2: 6 completed orders + 2 cancelled -> Regular (6 completed)
        $custRegular = Customer::query()->create([
            'customer_code' => 'C-0002',
            'full_name' => 'Regular Customer',
            'phone' => '+639172222222',
        ]);

        for ($i = 1; $i <= 6; $i++) {
            Order::query()->create([
                'order_code' => "#ORD-REG-{$i}",
                'order_type' => 'Online Order',
                'customer_id' => $custRegular->id,
                'customer_name' => $custRegular->full_name,
                'total' => 150,
                'status' => 'Completed',
                'created_at' => Carbon::now()->subDays(7 - $i),
            ]);
        }
        // Cancelled orders should NOT count toward completed
        Order::query()->create([
            'order_code' => '#ORD-REG-C1',
            'order_type' => 'Online Order',
            'customer_id' => $custRegular->id,
            'customer_name' => $custRegular->full_name,
            'total' => 500,
            'status' => 'Cancelled',
            'created_at' => Carbon::now()->subHours(2),
        ]);

        // Customer 3: 2 completed orders -> New
        $custNew = Customer::query()->create([
            'customer_code' => 'C-0003',
            'full_name' => 'New Customer',
            'phone' => '+639173333333',
        ]);

        for ($i = 1; $i <= 2; $i++) {
            Order::query()->create([
                'order_code' => "#ORD-NEW-{$i}",
                'order_type' => 'Online Order',
                'customer_id' => $custNew->id,
                'customer_name' => $custNew->full_name,
                'total' => 80,
                'status' => 'Delivered', // Delivered counts as completed
                'created_at' => Carbon::now()->subDays(3 - $i),
            ]);
        }

        $res = $this->actingAs($this->admin)->getJson('/api/reports/customers?per_page=10');
        $res->assertOk();
        $res->assertJsonStructure([
            'data' => [
                '*' => ['id', 'name', 'orders', 'orders_count', 'spent', 'points', 'last', 'freq'],
            ],
            'current_page',
            'last_page',
            'per_page',
            'total',
        ]);

        $rows = collect($res->json('data'))->keyBy('name');

        // Verify Frequent
        $freqRow = $rows->get('Frequent Customer');
        $this->assertNotNull($freqRow);
        $this->assertEquals(15, $freqRow['orders_count']);
        $this->assertEquals(1500, $freqRow['spent']);
        $this->assertEquals('750 pts', $freqRow['points']);
        $this->assertEquals('Frequent', $freqRow['freq']);

        // Verify Regular
        $regRow = $rows->get('Regular Customer');
        $this->assertNotNull($regRow);
        $this->assertEquals(6, $regRow['orders_count']);
        $this->assertEquals(900, $regRow['spent']);
        $this->assertEquals('450 pts', $regRow['points']);
        $this->assertEquals('Regular', $regRow['freq']);

        // Verify New
        $newRow = $rows->get('New Customer');
        $this->assertNotNull($newRow);
        $this->assertEquals(2, $newRow['orders_count']);
        $this->assertEquals(160, $newRow['spent']);
        $this->assertEquals('80 pts', $newRow['points']);
        $this->assertEquals('New', $newRow['freq']);
    }

    public function test_reports_customers_search_and_filter(): void
    {
        $custA = Customer::query()->create([
            'customer_code' => 'C-0010',
            'full_name' => 'Alice Wonder',
            'phone' => '+639170000001',
        ]);
        for ($i = 1; $i <= 16; $i++) {
            Order::query()->create([
                'order_code' => "#ORD-A-{$i}",
                'order_type' => 'Online Order',
                'customer_id' => $custA->id,
                'customer_name' => $custA->full_name,
                'total' => 50,
                'status' => 'Completed',
            ]);
        }

        $custB = Customer::query()->create([
            'customer_code' => 'C-0011',
            'full_name' => 'Bob Marley',
            'phone' => '+639170000002',
        ]);
        Order::query()->create([
            'order_code' => '#ORD-B-1',
            'order_type' => 'Online Order',
            'customer_id' => $custB->id,
            'customer_name' => $custB->full_name,
            'total' => 50,
            'status' => 'Completed',
        ]);

        // Search by name
        $searchRes = $this->actingAs($this->admin)->getJson('/api/reports/customers?search=Alice');
        $searchRes->assertOk();
        $this->assertCount(1, $searchRes->json('data'));
        $this->assertEquals('Alice Wonder', $searchRes->json('data.0.name'));

        // Filter by Frequent
        $filterFrequent = $this->actingAs($this->admin)->getJson('/api/reports/customers?status=Frequent');
        $filterFrequent->assertOk();
        $this->assertCount(1, $filterFrequent->json('data'));
        $this->assertEquals('Alice Wonder', $filterFrequent->json('data.0.name'));

        // Filter by New
        $filterNew = $this->actingAs($this->admin)->getJson('/api/reports/customers?status=New');
        $filterNew->assertOk();
        $this->assertCount(1, $filterNew->json('data'));
        $this->assertEquals('Bob Marley', $filterNew->json('data.0.name'));
    }

    public function test_top_selling_calculates_trend_percentage_against_prior_30_days(): void
    {
        $itemA = MenuItem::query()->create([
            'name' => 'Pizza A',
            'category' => 'Pizza',
            'price' => 200,
            'available' => true,
            'archived' => false,
        ]);
        $itemB = MenuItem::query()->create([
            'name' => 'Burger B',
            'category' => 'Burgers',
            'price' => 100,
            'available' => true,
            'archived' => false,
        ]);
        $itemC = MenuItem::query()->create([
            'name' => 'Drink C',
            'category' => 'Beverages',
            'price' => 50,
            'available' => true,
            'archived' => false,
        ]);

        // Current 30 days: order 5 days ago
        $currentOrder = Order::query()->create([
            'order_code' => '#ORD-CUR-1',
            'order_type' => 'Online Order',
            'customer_name' => 'Buyer',
            'total' => 2500,
            'status' => 'Completed',
            'order_date' => Carbon::now()->subDays(5)->toDateString(),
            'created_at' => Carbon::now()->subDays(5),
        ]);
        // Item A: 20 units currently
        OrderItem::query()->create([
            'order_id' => $currentOrder->id,
            'menu_item_id' => $itemA->id,
            'name' => $itemA->name,
            'qty' => 20,
            'unit_price' => 200,
            'line_total' => 4000,
        ]);
        // Item B: 5 units currently
        OrderItem::query()->create([
            'order_id' => $currentOrder->id,
            'menu_item_id' => $itemB->id,
            'name' => $itemB->name,
            'qty' => 5,
            'unit_price' => 100,
            'line_total' => 500,
        ]);
        // Item C: 10 units currently (brand new item, no prior period sales)
        OrderItem::query()->create([
            'order_id' => $currentOrder->id,
            'menu_item_id' => $itemC->id,
            'name' => $itemC->name,
            'qty' => 10,
            'unit_price' => 50,
            'line_total' => 500,
        ]);

        // Prior 30 days (40 days ago):
        $priorOrder = Order::query()->create([
            'order_code' => '#ORD-PRIOR-1',
            'order_type' => 'Online Order',
            'customer_name' => 'Buyer',
            'total' => 2000,
            'status' => 'Completed',
            'order_date' => Carbon::now()->subDays(40)->toDateString(),
            'created_at' => Carbon::now()->subDays(40),
        ]);
        // Item A had 10 units in prior period -> diff +10 / 10 = +100% -> '↑ 100%'
        OrderItem::query()->create([
            'order_id' => $priorOrder->id,
            'menu_item_id' => $itemA->id,
            'name' => $itemA->name,
            'qty' => 10,
            'unit_price' => 200,
            'line_total' => 2000,
        ]);
        // Item B had 10 units in prior period -> diff -5 / 10 = -50% -> '↓ 50%'
        OrderItem::query()->create([
            'order_id' => $priorOrder->id,
            'menu_item_id' => $itemB->id,
            'name' => $itemB->name,
            'qty' => 10,
            'unit_price' => 100,
            'line_total' => 1000,
        ]);

        $res = $this->getJson('/api/menu/top-selling');
        $res->assertOk();

        $items = collect($res->json('data'))->keyBy('name');

        $this->assertEquals('↑ 100%', $items->get('Pizza A')['change']);
        $this->assertEquals('↓ 50%', $items->get('Burger B')['change']);
        // Item C has no prior-period sales: must return '—'
        $this->assertEquals('—', $items->get('Drink C')['change']);
    }

    public function test_log_export_records_user_role_and_file_details(): void
    {
        $payload = [
            'name' => 'Sales_Summary_Report_Weekly.pdf',
            'format' => 'PDF',
            'size' => '245.5 KB',
            'type' => 'Sales Summary Report',
        ];

        $res = $this->actingAs($this->admin)->postJson('/api/reports/log-export', $payload);
        $res->assertCreated();
        $this->assertEquals('Sales_Summary_Report_Weekly.pdf', $res->json('data.name'));
        $this->assertEquals('PDF', $res->json('data.format'));
        $this->assertEquals('245.5 KB', $res->json('data.size'));
        $this->assertEquals('admin', $res->json('data.role'));

        $this->assertDatabaseHas('exported_reports', [
            'name' => 'Sales_Summary_Report_Weekly.pdf',
            'format' => 'PDF',
            'size' => '245.5 KB',
            'role' => 'admin',
        ]);
    }

    public function test_empty_database_returns_empty_collections_without_placeholders(): void
    {
        $res = $this->actingAs($this->admin)->getJson('/api/reports');
        $res->assertOk();

        $data = $res->json('data');
        $this->assertEmpty($data['all_records']);
        $this->assertEmpty($data['delivery_records']);
        $this->assertEmpty($data['customer_records']);
        $this->assertEmpty($data['top_items']);
        $this->assertEmpty($data['exports']);
        $this->assertEquals(0, $data['stats']['total_sales_today']);
        $this->assertEquals(0, $data['stats']['completed_deliveries']);
        $this->assertEquals(0, $data['stats']['avg_delivery_time']);
        $this->assertEquals(0, $data['stats']['total_orders']);

        $custRes = $this->actingAs($this->admin)->getJson('/api/reports/customers');
        $custRes->assertOk();
        $this->assertEmpty($custRes->json('data'));
        $this->assertEquals(0, $custRes->json('total'));
    }
}
