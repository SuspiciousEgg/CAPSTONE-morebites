<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OrderSequenceTest extends TestCase
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

    public function test_order_sequence_generates_five_digit_zero_padded_codes(): void
    {
        // Seed order_sequences table to 27
        DB::table('order_sequences')->delete();
        for ($i = 1; $i <= 27; $i++) {
            DB::table('order_sequences')->insert(['id' => $i]);
        }

        $code1 = Order::generateOrderCode();
        $this->assertEquals('#ORD-00028', $code1);

        $code2 = Order::generateOrderCode();
        $this->assertEquals('#ORD-00029', $code2);

        $code3 = Order::generateOrderCode();
        $this->assertEquals('#ORD-00030', $code3);
    }

    public function test_store_order_creates_sequential_order_and_keeps_customer_name_separate(): void
    {
        Sanctum::actingAs($this->admin);

        // Seed sequence to 27
        DB::table('order_sequences')->delete();
        for ($i = 1; $i <= 27; $i++) {
            DB::table('order_sequences')->insert(['id' => $i]);
        }

        $initialCustomerCount = Customer::query()->count();

        $response = $this->postJson('/api/orders', [
            'customer_name' => 'Walk In Guest',
            'order_type' => 'Dine-in',
            'items' => [
                [
                    'name' => 'Garlic Bread',
                    'qty' => 2,
                    'unit_price' => 50,
                ],
            ],
        ]);

        $response->assertStatus(201);
        $response->assertJson([
            'data' => [
                'id' => '#ORD-00028',
                'customer' => 'Walk In Guest',
                'type' => 'Dine-in',
            ],
        ]);

        // Customer management should NOT have any new registered customer
        $this->assertEquals($initialCustomerCount, Customer::query()->count());

        // The order should have the code #ORD-00028
        $this->assertDatabaseHas('orders', [
            'order_code' => '#ORD-00028',
            'customer_name' => 'Walk In Guest',
            'customer_id' => null,
        ]);
    }
}
