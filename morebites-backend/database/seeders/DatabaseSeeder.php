<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\DeliveryRate;
use App\Models\InventoryItem;
use App\Models\MenuItem;
use App\Models\MenuItemIngredient;
use App\Models\MenuItemSize;
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
            'customer_code' => 'C00001',
            'full_name' => 'Ana Customer',
            'phone' => '09190001111',
            'status' => 'ACTIVE',
            'registered_at' => now(),
            'delivery_address' => 'Poblacion, Dangcagan, Bukidnon',
        ]);

        $sizes285 = [
            ['name' => 'Medium 9"', 'price' => 285],
            ['name' => 'Large 12"', 'price' => 395],
            ['name' => 'XL 15"', 'price' => 480],
            ['name' => 'Jumbo 18"', 'price' => 695],
            ['name' => 'Party 24"', 'price' => 1185],
        ];
        $sizes265 = [
            ['name' => 'Medium 9"', 'price' => 265],
            ['name' => 'Large 12"', 'price' => 355],
            ['name' => 'XL 15"', 'price' => 449],
            ['name' => 'Jumbo 18"', 'price' => 649],
            ['name' => 'Party 24"', 'price' => 995],
        ];

        $menuSeed = [
            ['name' => 'Supreme Pizza', 'category' => 'Pizza', 'price' => 285, 'has_sizes' => true, 'sizes' => $sizes285],
            ['name' => 'Full House', 'category' => 'Pizza', 'price' => 285, 'has_sizes' => true, 'sizes' => $sizes285],
            ['name' => 'Pepperoni Pizza', 'category' => 'Pizza', 'price' => 265, 'has_sizes' => true, 'sizes' => $sizes265],
            ['name' => 'Hawaiian Pizza', 'category' => 'Pizza', 'price' => 245, 'has_sizes' => true, 'sizes' => $sizes265],
            ['name' => 'Chicken Wing', 'category' => 'Snacks', 'price' => 349, 'has_sizes' => false],
            ['name' => 'Fries', 'category' => 'Snacks', 'price' => 65, 'has_sizes' => false],
            ['name' => 'Heavenly Ube', 'category' => 'Desserts', 'price' => 185, 'has_sizes' => false],
            ['name' => 'Cheesy Overload', 'category' => 'Desserts', 'price' => 155, 'has_sizes' => false],
            ['name' => 'Halo Halo', 'category' => 'Desserts', 'price' => 145, 'has_sizes' => false],
            ['name' => 'Sprite 1.5L', 'category' => 'Beverages', 'price' => 67, 'has_sizes' => false],
            ['name' => 'Coke 1.5L', 'category' => 'Beverages', 'price' => 67, 'has_sizes' => false],
            ['name' => 'Chicken Thigh Rice Meal', 'category' => 'Rice Meals', 'price' => 120, 'has_sizes' => false],
            ['name' => 'Burger Steak Rice Meal', 'category' => 'Rice Meals', 'price' => 110, 'has_sizes' => false],
        ];

        $dough = $this->seedInventory([
            'name' => 'Pizza Dough',
            'category' => 'Ingredients',
            'subcategory' => 'Dry Goods',
            'stock' => 40,
            'unit' => 'pcs',
            'reorder_level' => 10,
            'days_until_expiry' => 5,
        ]);
        $chickenThigh = $this->seedInventory([
            'name' => 'Chicken Thigh',
            'category' => 'Meat',
            'subcategory' => 'Chicken',
            'subcategory_detail' => 'Thigh',
            'stock' => 6,
            'unit' => 'kg',
            'reorder_level' => 3,
            'days_until_expiry' => 3,
        ]);
        $chickenWings = $this->seedInventory([
            'name' => 'Chicken Wings',
            'category' => 'Meat',
            'subcategory' => 'Chicken',
            'subcategory_detail' => 'Wings',
            'stock' => 4.5,
            'unit' => 'kg',
            'reorder_level' => 2,
            'days_until_expiry' => 0,
        ]);
        $ube = $this->seedInventory([
            'name' => 'Ube Mix',
            'category' => 'Dessert',
            'subcategory' => 'Dry Mix',
            'stock' => 2,
            'unit' => 'kg',
            'reorder_level' => 2,
            'days_until_expiry' => -2,
        ]);
        $soda = $this->seedInventory([
            'name' => 'Soda Bottles',
            'category' => 'Beverages',
            'subcategory' => 'Soft Drinks',
            'stock' => 24,
            'unit' => 'pcs',
            'reorder_level' => 6,
            'days_until_expiry' => 14,
        ]);
        $mozzarella = $this->seedInventory([
            'name' => 'Mozzarella Cheese',
            'category' => 'Ingredients',
            'subcategory' => 'Dairy',
            'stock' => 3,
            'unit' => 'kg',
            'reorder_level' => 2,
            'days_until_expiry' => 6,
        ]);
        $fries = $this->seedInventory([
            'name' => 'Frozen Fries',
            'category' => 'Sides',
            'subcategory' => 'Frozen',
            'stock' => 12,
            'unit' => 'kg',
            'reorder_level' => 4,
            'days_until_expiry' => 7,
        ]);

        $firstMenu = null;
        foreach ($menuSeed as $row) {
            $item = MenuItem::query()->create([
                'name' => $row['name'],
                'category' => $row['category'],
                'price' => $row['price'],
                'available' => true,
                'archived' => false,
                'has_sizes' => $row['has_sizes'],
            ]);
            $firstMenu ??= $item;
            foreach ($row['sizes'] ?? [] as $size) {
                MenuItemSize::query()->create([
                    'menu_item_id' => $item->id,
                    'name' => $size['name'],
                    'price' => $size['price'],
                ]);
            }

            $recipe = match ($row['category']) {
                'Pizza' => [[$dough->id, 1], [$mozzarella->id, 0.2]],
                'Snacks' => [[$chickenWings->id, 0.25], [$fries->id, 0.15]],
                'Desserts' => [[$ube->id, 0.15]],
                'Beverages' => [[$soda->id, 1]],
                'Rice Meals' => [[$chickenThigh->id, 0.2]],
                default => [],
            };
            foreach ($recipe as [$inventoryId, $qty]) {
                MenuItemIngredient::query()->create([
                    'menu_item_id' => $item->id,
                    'inventory_item_id' => $inventoryId,
                    'qty_per_serving' => $qty,
                ]);
            }
        }

        app(InventoryDeductionService::class)->syncMenuAvailability();

        $order = Order::query()->create([
            'order_code' => '#ORD-00101',
            'customer_id' => $customer->id,
            'customer_name' => $customer->full_name,
            'order_type' => 'Online Order',
            'total' => 350,
            'status' => 'Assigned',
            'payment_method' => 'COD',
            'payment_status' => 'Unpaid',
            'delivery_address' => 'Dangcagan, Bukidnon',
            'driver_id' => $driver->id,
            'assigned_at' => now(),
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
