<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class MenuItemRatingTest extends TestCase
{
    use RefreshDatabase;

    private function createCustomer(): Customer
    {
        $user = User::query()->create([
            'name' => 'Rating Customer',
            'email' => 'rating_customer@test.com',
            'phone' => '09123456788',
            'password' => Hash::make('password123'),
            'role' => 'customer',
            'status' => 'Active',
        ]);

        return Customer::query()->create([
            'user_id' => $user->id,
            'customer_code' => 'C99999',
            'full_name' => 'Rating Customer',
            'phone' => '09123456788',
            'status' => 'ACTIVE',
            'registered_at' => now(),
        ]);
    }

    public function test_menu_item_returns_null_rating_when_no_ratings_exist(): void
    {
        $menu = MenuItem::query()->create([
            'name' => 'Brand New Pizza',
            'category' => 'Pizza',
            'price' => 250,
            'available' => true,
            'archived' => false,
        ]);

        $res = $this->getJson('/api/customer/menu');
        $res->assertStatus(200);

        $item = collect($res->json('data'))->firstWhere('name', 'Brand New Pizza');
        $this->assertNotNull($item);
        $this->assertNull($item['rating']);
        $this->assertSame(0, $item['reviewCount']);
    }

    public function test_menu_item_aggregates_real_food_ratings_from_orders(): void
    {
        $customer = $this->createCustomer();

        $menuA = MenuItem::query()->create([
            'name' => 'Rated Hawaiian Pizza',
            'category' => 'Pizza',
            'price' => 300,
            'available' => true,
            'archived' => false,
        ]);

        $menuB = MenuItem::query()->create([
            'name' => 'Unrated Garlic Bread',
            'category' => 'Sides',
            'price' => 100,
            'available' => true,
            'archived' => false,
        ]);

        // Order 1: rates food 5 stars
        $order1 = Order::query()->create([
            'order_code' => 'ORD-90001',
            'customer_id' => $customer->id,
            'customer_name' => $customer->full_name,
            'order_type' => 'Online Order',
            'total' => 300,
            'status' => 'Completed',
            'food_rating' => 5,
            'food_comment' => 'Delicious!',
            'rated_at' => now(),
        ]);

        OrderItem::query()->create([
            'order_id' => $order1->id,
            'menu_item_id' => $menuA->id,
            'name' => $menuA->name,
            'qty' => 1,
            'unit_price' => 300,
            'line_total' => 300,
        ]);

        // Order 2: rates food 4 stars
        $order2 = Order::query()->create([
            'order_code' => 'ORD-90002',
            'customer_id' => $customer->id,
            'customer_name' => $customer->full_name,
            'order_type' => 'Online Order',
            'total' => 300,
            'status' => 'Completed',
            'food_rating' => 4,
            'food_comment' => 'Good!',
            'rated_at' => now(),
        ]);

        OrderItem::query()->create([
            'order_id' => $order2->id,
            'menu_item_id' => $menuA->id,
            'name' => $menuA->name,
            'qty' => 1,
            'unit_price' => 300,
            'line_total' => 300,
        ]);

        // Fetch customer menu
        $res = $this->getJson('/api/customer/menu');
        $res->assertStatus(200);

        $itemA = collect($res->json('data'))->firstWhere('name', 'Rated Hawaiian Pizza');
        $this->assertNotNull($itemA);
        // Average of 5 and 4 = 4.5
        $this->assertEquals(4.5, $itemA['rating']);
        $this->assertSame(2, $itemA['reviewCount']);

        $itemB = collect($res->json('data'))->firstWhere('name', 'Unrated Garlic Bread');
        $this->assertNotNull($itemB);
        $this->assertNull($itemB['rating']);
        $this->assertSame(0, $itemB['reviewCount']);
    }
}

