<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\DeliveryRate;
use App\Models\InventoryItem;
use App\Models\MenuItem;
use App\Models\MenuItemIngredient;
use App\Models\MenuItemSize;
use App\Models\Notification;
use App\Models\NotificationRead;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use App\Services\InventoryDeductionService;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        DeliveryRate::syncFixedTiers();

        User::query()->create([
            'name' => 'John Owner',
            'first_name' => 'John',
            'last_name' => 'Owner',
            'email' => 'admin@morebites.com',
            'username' => 'owner',
            'phone' => '09171234567',
            'password' => 'password',
            'role' => 'super_admin',
            'role_access' => ['admin', 'driver', 'cashier'],
            'status' => 'Active',
            'gender' => 'Male',
        ]);

        $driver = User::query()->create([
            'name' => 'John Driver',
            'first_name' => 'John',
            'last_name' => 'Driver',
            'email' => 'driver@morebites.com',
            'username' => 'johndriver',
            'phone' => '09123456789',
            'password' => 'driver123',
            'role' => 'driver',
            'role_access' => ['driver'],
            'status' => 'Active',
            'vehicle_type' => 'Motorcycle',
            'plate_no' => 'ABC-1234',
            'license_number' => 'N01-12-345678',
            'rating' => 4.8,
            'completed_orders' => 12,
            'years_experience' => 2,
            'success_rate' => 96,
        ]);

        $driver2 = User::query()->create([
            'name' => 'Marco Rider',
            'first_name' => 'Marco',
            'last_name' => 'Rider',
            'email' => 'driver2@morebites.com',
            'username' => 'marcorider',
            'phone' => '09123456780',
            'password' => 'driver123',
            'role' => 'driver',
            'role_access' => ['driver'],
            'status' => 'Active',
            'vehicle_type' => 'Motorcycle',
            'plate_no' => 'XYZ-5678',
            'license_number' => 'N01-12-987654',
            'rating' => 4.9,
            'completed_orders' => 24,
            'years_experience' => 3,
            'success_rate' => 98,
        ]);

        $cashier = User::query()->create([
            'name' => 'Rina Cashier',
            'first_name' => 'Rina',
            'last_name' => 'Cashier',
            'email' => 'cashier@morebites.com',
            'username' => 'rinacashier',
            'phone' => '09128887777',
            'password' => 'cashier123',
            'role' => 'cashier',
            'role_access' => ['cashier'],
            'status' => 'Active',
            'gender' => 'Female',
        ]);

        $customerUser = User::query()->create([
            'name' => 'Ana Customer',
            'first_name' => 'Ana',
            'last_name' => 'Customer',
            'email' => '09190001111@customer.morebites.local',
            'username' => '09190001111',
            'phone' => '09190001111',
            'password' => 'customer123',
            'role' => 'customer',
            'role_access' => [],
            'status' => 'Active',
        ]);

        $customer = Customer::query()->create([
            'user_id' => $customerUser->id,
            'customer_code' => 'C-0001',
            'full_name' => 'Ana Customer',
            'phone' => '09190001111',
            'status' => 'ACTIVE',
            'registered_at' => now(),
            'delivery_address' => 'Poblacion, Dangcagan, Bukidnon',
        ]);

        $this->call(MoreBitesMenuAndInventorySeeder::class);

        $firstMenu = MenuItem::query()->where('name', 'Hawaiian Overload')->first() ?? MenuItem::query()->first();

        $order = Order::query()->create([
            'order_code' => '#ORD-00021',
            'customer_id' => $customer->id,
            'customer_name' => $customer->full_name,
            'order_type' => 'Online Order',
            'total' => 350,
            'status' => 'Completed',
            'payment_method' => 'COD',
            'payment_status' => 'Paid',
            'delivery_address' => 'Dangcagan, Bukidnon',
            'driver_id' => $driver->id,
            'assigned_at' => now()->subDays(2),
            'delivered_at' => now()->subDays(2),
            'delivery_distance_km' => 2.5,
            'delivery_minutes' => 20,
        ]);

        OrderItem::query()->create([
            'order_id' => $order->id,
            'menu_item_id' => $firstMenu?->id,
            'name' => 'Hawaiian Pizza (L)',
            'qty' => 1,
            'unit_price' => 245,
            'line_total' => 245,
        ]);

        OrderItem::query()->create([
            'order_id' => $order->id,
            'menu_item_id' => null,
            'name' => 'Halo-halo',
            'qty' => 2,
            'unit_price' => 52.5,
            'line_total' => 105,
        ]);

        Notification::createOrderNotification($order);
        app(\App\Services\LoyaltyService::class)->creditForOrder($order);

        $deliveredNotif = Notification::query()->create([
            'user_id' => $customerUser->id,
            'title' => 'Order #ORD-00020 delivered',
            'message' => 'Order #ORD-00020 has been delivered. Enjoy your meal!',
            'type' => 'customer_order_status',
            'tab' => 'Orders',
            'nav' => 'Orders',
            'is_read' => true,
            'data' => [
                'order_code' => '#ORD-00020',
                'status' => 'Delivered',
            ],
            'created_at' => now()->subDays(2),
        ]);

        NotificationRead::query()->create([
            'notification_id' => $deliveredNotif->id,
            'user_id' => $customerUser->id,
            'read_at' => now()->subDays(2),
        ]);
    }

    private function seedInventory(array $data): InventoryItem
    {
        $placed = now()->subDays($data['placed_days_ago'] ?? 7)->startOfDay();
        $expiry = now()->addDays($data['days_until_expiry'])->startOfDay();
        $stock = (float) $data['stock'];
        $reorder = (float) $data['reorder_level'];

        return InventoryItem::query()->create([
            'name' => $data['name'],
            'batch_no' => InventoryItem::makeBatchNo($data['name'], $placed),
            'category' => $data['category'],
            'subcategory' => $data['subcategory'] ?? null,
            'subcategory_detail' => $data['subcategory_detail'] ?? null,
            'stock' => $stock,
            'unit' => $data['unit'],
            'reorder_level' => $reorder,
            'date_placed' => $placed,
            'expiry_date' => $expiry,
            'status' => InventoryItem::deriveStatus($stock, $reorder, $expiry),
        ]);
    }
}
