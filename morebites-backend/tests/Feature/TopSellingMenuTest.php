<?php

namespace Tests\Feature;

use App\Models\MenuItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class TopSellingMenuTest extends TestCase
{
    use RefreshDatabase;

    public function test_top_selling_returns_products_ordered_by_30_day_sales(): void
    {
        $itemA = MenuItem::query()->create([
            'name' => 'Popular Pizza',
            'category' => 'Pizza',
            'price' => 250,
            'available' => true,
            'archived' => false,
        ]);

        $itemB = MenuItem::query()->create([
            'name' => 'Burger Deluxe',
            'category' => 'Burgers',
            'price' => 150,
            'available' => true,
            'archived' => false,
        ]);

        $itemC = MenuItem::query()->create([
            'name' => 'Pasta Carbonara',
            'category' => 'Pasta',
            'price' => 200,
            'available' => true,
            'archived' => false,
        ]);

        $itemD = MenuItem::query()->create([
            'name' => 'Iced Tea',
            'category' => 'Beverages',
            'price' => 50,
            'available' => true,
            'archived' => false,
        ]);

        // Order within 30 days
        $recentOrder = Order::query()->create([
            'order_code' => '#ORD-01001',
            'customer_name' => 'Buyer One',
            'order_type' => 'Online Order',
            'total' => 1500,
            'status' => 'Completed',
            'order_date' => Carbon::now()->subDays(5)->toDateString(),
            'created_at' => Carbon::now()->subDays(5),
        ]);

        OrderItem::query()->create([
            'order_id' => $recentOrder->id,
            'menu_item_id' => $itemA->id,
            'name' => $itemA->name,
            'qty' => 10,
            'unit_price' => 250,
            'line_total' => 2500,
        ]);

        OrderItem::query()->create([
            'order_id' => $recentOrder->id,
            'menu_item_id' => $itemB->id,
            'name' => $itemB->name,
            'qty' => 6,
            'unit_price' => 150,
            'line_total' => 900,
        ]);

        OrderItem::query()->create([
            'order_id' => $recentOrder->id,
            'menu_item_id' => $itemC->id,
            'name' => $itemC->name,
            'qty' => 4,
            'unit_price' => 200,
            'line_total' => 800,
        ]);

        OrderItem::query()->create([
            'order_id' => $recentOrder->id,
            'menu_item_id' => $itemD->id,
            'name' => $itemD->name,
            'qty' => 2,
            'unit_price' => 50,
            'line_total' => 100,
        ]);

        // Old order (45 days ago) - sales should NOT be included in rolling 30 days
        $oldOrder = Order::query()->create([
            'order_code' => '#ORD-01002',
            'customer_name' => 'Buyer Two',
            'order_type' => 'Online Order',
            'total' => 5000,
            'status' => 'Completed',
            'order_date' => Carbon::now()->subDays(45)->toDateString(),
            'created_at' => Carbon::now()->subDays(45),
        ]);

        OrderItem::query()->create([
            'order_id' => $oldOrder->id,
            'menu_item_id' => $itemD->id,
            'name' => $itemD->name,
            'qty' => 100, // Should be excluded because it's older than 30 days
            'unit_price' => 50,
            'line_total' => 5000,
        ]);

        $response = $this->getJson('/api/menu/top-selling');
        $response->assertStatus(200);

        $data = $response->json('data');
        $this->assertCount(4, $data);

        // Verify descending rank by 30-day quantity
        $this->assertEquals($itemA->id, $data[0]['id']);
        $this->assertEquals(10, $data[0]['units_sold']);
        $this->assertEquals($itemB->id, $data[1]['id']);
        $this->assertEquals(6, $data[1]['units_sold']);
        $this->assertEquals($itemC->id, $data[2]['id']);
        $this->assertEquals(4, $data[2]['units_sold']);
        $this->assertEquals($itemD->id, $data[3]['id']);
        $this->assertEquals(2, $data[3]['units_sold']);

        // Verify required keys
        $this->assertArrayHasKey('id', $data[0]);
        $this->assertArrayHasKey('name', $data[0]);
        $this->assertArrayHasKey('price', $data[0]);
        $this->assertArrayHasKey('image', $data[0]);
        $this->assertArrayHasKey('category', $data[0]);
    }

    public function test_top_selling_falls_back_to_is_featured_when_fewer_than_three_products_sold(): void
    {
        // Only 1 item has sales
        $soldItem = MenuItem::query()->create([
            'name' => 'Only Sold Item',
            'category' => 'Pizza',
            'price' => 200,
            'available' => true,
            'archived' => false,
            'is_featured' => false,
        ]);

        $order = Order::query()->create([
            'order_code' => '#ORD-01003',
            'customer_name' => 'Buyer Three',
            'order_type' => 'Online Order',
            'total' => 200,
            'status' => 'Completed',
            'order_date' => Carbon::now()->subDays(2)->toDateString(),
            'created_at' => Carbon::now()->subDays(2),
        ]);

        OrderItem::query()->create([
            'order_id' => $order->id,
            'menu_item_id' => $soldItem->id,
            'name' => $soldItem->name,
            'qty' => 5,
            'unit_price' => 200,
            'line_total' => 1000,
        ]);

        // Featured items
        $featuredA = MenuItem::query()->create([
            'name' => 'Chef Featured Special',
            'category' => 'Specials',
            'price' => 300,
            'available' => true,
            'archived' => false,
            'is_featured' => true,
        ]);

        $featuredB = MenuItem::query()->create([
            'name' => 'Signature Wings',
            'category' => 'Sides',
            'price' => 180,
            'available' => true,
            'archived' => false,
            'is_featured' => true,
        ]);

        $response = $this->getJson('/api/menu/top-selling');
        $response->assertStatus(200);

        $data = $response->json('data');
        $names = collect($data)->pluck('name')->all();

        // Must return the featured items
        $this->assertContains('Chef Featured Special', $names);
        $this->assertContains('Signature Wings', $names);
    }

    public function test_top_selling_falls_back_to_newest_active_when_no_featured_items_exist(): void
    {
        // 0 orders, 0 featured items
        $itemOld = MenuItem::query()->create([
            'name' => 'Oldest Item',
            'category' => 'Pizza',
            'price' => 200,
            'available' => true,
            'archived' => false,
            'is_featured' => false,
        ]);
        $itemOld->created_at = Carbon::now()->subDays(10);
        $itemOld->save();

        $itemNew = MenuItem::query()->create([
            'name' => 'Newest Item',
            'category' => 'Burgers',
            'price' => 150,
            'available' => true,
            'archived' => false,
            'is_featured' => false,
        ]);
        $itemNew->created_at = Carbon::now()->subDays(1);
        $itemNew->save();

        $response = $this->getJson('/api/menu/top-selling');
        $response->assertStatus(200);

        $data = $response->json('data');
        $this->assertNotEmpty($data);
        $this->assertEquals('Newest Item', $data[0]['name']);
    }

    public function test_top_selling_excludes_archived_items(): void
    {
        $archivedItem = MenuItem::query()->create([
            'name' => 'Archived Secret Item',
            'category' => 'Pizza',
            'price' => 200,
            'available' => true,
            'archived' => true,
            'is_featured' => true,
        ]);

        $activeItem = MenuItem::query()->create([
            'name' => 'Active Item',
            'category' => 'Pizza',
            'price' => 200,
            'available' => true,
            'archived' => false,
            'is_featured' => true,
        ]);

        $response = $this->getJson('/api/menu/top-selling');
        $response->assertStatus(200);

        $names = collect($response->json('data'))->pluck('name')->all();
        $this->assertNotContains('Archived Secret Item', $names);
        $this->assertContains('Active Item', $names);
    }

    public function test_reports_api_synchronizes_top_items_with_top_selling(): void
    {
        $admin = User::query()->create([
            'name' => 'Admin Report',
            'email' => 'admin_report@morebites.test',
            'password' => Hash::make('password'),
            'role' => 'admin',
            'status' => 'Active',
        ]);

        $itemA = MenuItem::query()->create([
            'name' => 'Best Pizza',
            'category' => 'Pizza',
            'price' => 300,
            'available' => true,
            'archived' => false,
            'is_featured' => true,
        ]);

        $itemB = MenuItem::query()->create([
            'name' => 'Best Drink',
            'category' => 'Beverages',
            'price' => 60,
            'available' => true,
            'archived' => false,
            'is_featured' => true,
        ]);

        $topSellingRes = $this->getJson('/api/menu/top-selling');
        $topSellingData = $topSellingRes->json('data');

        $reportsRes = $this->actingAs($admin)->getJson('/api/reports');
        $reportsData = $reportsRes->json('data.top_items');

        $this->assertEquals(
            collect($topSellingData)->pluck('name')->all(),
            collect($reportsData)->pluck('name')->all()
        );
    }
}
