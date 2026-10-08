<?php

namespace Tests\Feature;

use App\Models\InventoryBatch;
use App\Models\InventoryItem;
use App\Models\InventoryLog;
use App\Models\MenuItem;
use App\Models\MenuItemIngredient;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderInventoryDeduction;
use App\Services\InventoryDeductionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IdempotentBatchRestockTest extends TestCase
{
    use RefreshDatabase;

    private InventoryDeductionService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = app(InventoryDeductionService::class);
    }

    public function test_deduction_sets_inventory_deducted_flag_to_true(): void
    {
        $cheese = InventoryItem::query()->create([
            'name' => 'Mozzarella',
            'category' => 'Dairy',
            'stock' => 1.0,
            'unit' => 'kg',
            'reorder_level' => 0.2,
            'status' => 'In Stock',
            'date_placed' => now()->toDateString(),
        ]);

        $batch = InventoryBatch::query()->create([
            'inventory_item_id' => $cheese->id,
            'batch_no' => 'BATCH-MOZZ-101',
            'stock' => 1.0,
            'initial_stock' => 1.0,
            'expiry_date' => now()->addDays(10)->toDateString(),
            'date_placed' => now()->toDateString(),
            'status' => 'Good',
        ]);

        $pizza = MenuItem::query()->create([
            'name' => 'Cheese Pizza',
            'category' => 'Pizza',
            'price' => 200,
            'available' => true,
            'archived' => false,
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $pizza->id,
            'inventory_item_id' => $cheese->id,
            'qty_per_serving' => 0.2,
            'unit' => 'kg',
        ]);

        $order = Order::query()->create([
            'order_code' => '#ORD-TEST-001',
            'customer_name' => 'Alice',
            'order_type' => 'Dine-in',
            'total' => 200,
            'status' => 'Pending',
        ]);

        OrderItem::query()->create([
            'order_id' => $order->id,
            'menu_item_id' => $pizza->id,
            'name' => 'Cheese Pizza',
            'qty' => 1,
            'unit_price' => 200,
            'line_total' => 200,
        ]);

        $this->assertFalse((bool) $order->fresh()->inventory_deducted);

        $this->service->deductForOrder($order);

        $this->assertTrue((bool) $order->fresh()->inventory_deducted);
        $this->assertEquals(0.8, round((float) $batch->fresh()->stock, 4));
        $this->assertEquals(1, OrderInventoryDeduction::query()->where('order_id', $order->id)->count());
    }

    public function test_restock_is_idempotent_and_never_restores_twice(): void
    {
        $cheese = InventoryItem::query()->create([
            'name' => 'Mozzarella',
            'category' => 'Dairy',
            'stock' => 1.0,
            'unit' => 'kg',
            'reorder_level' => 0.2,
            'status' => 'In Stock',
            'date_placed' => now()->toDateString(),
        ]);

        $batch1 = InventoryBatch::query()->create([
            'inventory_item_id' => $cheese->id,
            'batch_no' => 'BATCH-MOZZ-101',
            'stock' => 0.15,
            'initial_stock' => 0.15,
            'expiry_date' => now()->addDays(2)->toDateString(),
            'date_placed' => now()->toDateString(),
            'status' => 'Good',
        ]);

        $batch2 = InventoryBatch::query()->create([
            'inventory_item_id' => $cheese->id,
            'batch_no' => 'BATCH-MOZZ-102',
            'stock' => 0.85,
            'initial_stock' => 0.85,
            'expiry_date' => now()->addDays(10)->toDateString(),
            'date_placed' => now()->toDateString(),
            'status' => 'Good',
        ]);

        $pizza = MenuItem::query()->create([
            'name' => 'Cheese Pizza',
            'category' => 'Pizza',
            'price' => 200,
            'available' => true,
            'archived' => false,
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $pizza->id,
            'inventory_item_id' => $cheese->id,
            'qty_per_serving' => 0.25, // takes 0.15 from batch1, 0.10 from batch2
            'unit' => 'kg',
        ]);

        $order = Order::query()->create([
            'order_code' => '#ORD-TEST-002',
            'customer_name' => 'Bob',
            'order_type' => 'Dine-in',
            'total' => 200,
            'status' => 'Pending',
        ]);

        OrderItem::query()->create([
            'order_id' => $order->id,
            'menu_item_id' => $pizza->id,
            'name' => 'Cheese Pizza',
            'qty' => 1,
            'unit_price' => 200,
            'line_total' => 200,
        ]);

        $this->service->deductForOrder($order);

        $this->assertEquals(0.0, round((float) $batch1->fresh()->stock, 4));
        $this->assertEquals(0.75, round((float) $batch2->fresh()->stock, 4));
        $this->assertTrue((bool) $order->fresh()->inventory_deducted);

        $initialLogsCount = InventoryLog::query()->count();

        // 1st restock call: reverses exactly what was deducted
        $this->service->restockForOrder($order);

        $this->assertFalse((bool) $order->fresh()->inventory_deducted);
        $this->assertEquals(0.15, round((float) $batch1->fresh()->stock, 4));
        $this->assertEquals(0.85, round((float) $batch2->fresh()->stock, 4));
        $this->assertEquals(1.0, round((float) $cheese->fresh()->stock, 4));

        $logsAfterFirstRestock = InventoryLog::query()->count();
        $this->assertGreaterThan($initialLogsCount, $logsAfterFirstRestock);

        // 2nd restock call: must do NOTHING (idempotent)
        $this->service->restockForOrder($order);

        $this->assertFalse((bool) $order->fresh()->inventory_deducted);
        $this->assertEquals(0.15, round((float) $batch1->fresh()->stock, 4));
        $this->assertEquals(0.85, round((float) $batch2->fresh()->stock, 4));
        $this->assertEquals(1.0, round((float) $cheese->fresh()->stock, 4));
        $this->assertEquals($logsAfterFirstRestock, InventoryLog::query()->count()); // No duplicate logs!

        // 3rd restock call: still does nothing
        $this->service->restockForOrder($order);
        $this->assertEquals(0.15, round((float) $batch1->fresh()->stock, 4));
        $this->assertEquals(0.85, round((float) $batch2->fresh()->stock, 4));
        $this->assertEquals($logsAfterFirstRestock, InventoryLog::query()->count());
    }

    public function test_restock_reverses_recorded_deductions_even_if_recipe_changed(): void
    {
        $beef = InventoryItem::query()->create([
            'name' => 'Ground Beef',
            'category' => 'Meat',
            'stock' => 1.0,
            'unit' => 'kg',
            'reorder_level' => 0.2,
            'status' => 'In Stock',
            'date_placed' => now()->toDateString(),
        ]);

        $batch = InventoryBatch::query()->create([
            'inventory_item_id' => $beef->id,
            'batch_no' => 'BATCH-BEEF-201',
            'stock' => 1.0,
            'initial_stock' => 1.0,
            'expiry_date' => now()->addDays(5)->toDateString(),
            'date_placed' => now()->toDateString(),
            'status' => 'Good',
        ]);

        $burger = MenuItem::query()->create([
            'name' => 'Beef Burger',
            'category' => 'Burgers',
            'price' => 150,
            'available' => true,
            'archived' => false,
        ]);

        $ingredientLink = MenuItemIngredient::query()->create([
            'menu_item_id' => $burger->id,
            'inventory_item_id' => $beef->id,
            'qty_per_serving' => 0.2, // Deducted 0.2 kg
            'unit' => 'kg',
        ]);

        $order = Order::query()->create([
            'order_code' => '#ORD-TEST-003',
            'customer_name' => 'Charlie',
            'order_type' => 'Dine-in',
            'total' => 150,
            'status' => 'Pending',
        ]);

        OrderItem::query()->create([
            'order_id' => $order->id,
            'menu_item_id' => $burger->id,
            'name' => 'Beef Burger',
            'qty' => 1,
            'unit_price' => 150,
            'line_total' => 150,
        ]);

        $this->service->deductForOrder($order);
        $this->assertEquals(0.8, round((float) $batch->fresh()->stock, 4));

        // Now suppose the chef/admin changes the recipe to require 0.5 kg (or deletes the ingredient link)
        $ingredientLink->update(['qty_per_serving' => 0.5]);

        // Restock should restore 0.2 kg (from recorded deduction), NOT 0.5 kg (current recipe)
        $this->service->restockForOrder($order);

        $this->assertEquals(1.0, round((float) $batch->fresh()->stock, 4));
        $this->assertEquals(1.0, round((float) $beef->fresh()->stock, 4));
        $this->assertFalse((bool) $order->fresh()->inventory_deducted);
    }

    public function test_restock_does_nothing_if_inventory_deducted_is_false(): void
    {
        $onion = InventoryItem::query()->create([
            'name' => 'Onions',
            'category' => 'Produce',
            'stock' => 5.0,
            'unit' => 'kg',
            'reorder_level' => 1.0,
            'status' => 'In Stock',
            'date_placed' => now()->toDateString(),
        ]);

        $batch = InventoryBatch::query()->create([
            'inventory_item_id' => $onion->id,
            'batch_no' => 'BATCH-ONION-301',
            'stock' => 5.0,
            'initial_stock' => 5.0,
            'expiry_date' => now()->addDays(7)->toDateString(),
            'date_placed' => now()->toDateString(),
            'status' => 'Good',
        ]);

        $order = Order::query()->create([
            'order_code' => '#ORD-TEST-004',
            'customer_name' => 'Dana',
            'order_type' => 'Dine-in',
            'total' => 100,
            'status' => 'Pending',
            'inventory_deducted' => false,
        ]);

        $this->service->restockForOrder($order);

        $this->assertEquals(5.0, round((float) $batch->fresh()->stock, 4));
        $this->assertEquals(5.0, round((float) $onion->fresh()->stock, 4));
        $this->assertEquals(0, InventoryLog::query()->count());
    }
}

