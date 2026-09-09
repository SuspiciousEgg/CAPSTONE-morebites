<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DriverOrderStatusTest extends TestCase
{
    use RefreshDatabase;

    public function test_driver_can_update_order_to_delivered_with_proof(): void
    {
        Storage::fake('public');

        $driver = User::query()->create([
            'name' => 'Driver User',
            'first_name' => 'Driver',
            'last_name' => 'One',
            'email' => 'driver@test.com',
            'username' => '09112223344',
            'phone' => '09112223344',
            'password' => Hash::make('password'),
            'role' => 'driver',
            'status' => 'Active',
        ]);

        $order = Order::query()->create([
            'order_code' => '#ORD-99901',
            'driver_id' => $driver->id,
            'customer_name' => 'Customer Test',
            'order_type' => 'Online Order',
            'total' => 500,
            'status' => 'Out for Delivery',
            'payment_method' => 'COD',
            'payment_status' => 'Unpaid',
            'delivery_address' => 'Test Address',
        ]);

        Sanctum::actingAs($driver);

        $file = UploadedFile::fake()->create('proof.jpg', 100, 'image/jpeg');

        $response = $this->postJson("/api/driver/orders/{$order->id}/status", [
            'status' => 'Delivered',
            'proof_of_delivery' => $file,
        ]);

        $response->assertStatus(200);
        $this->assertEquals('Completed', $order->fresh()->status);
        $this->assertNotNull($order->fresh()->proof_of_delivery);
        $this->assertNotNull($order->fresh()->delivered_at);
    }
}
