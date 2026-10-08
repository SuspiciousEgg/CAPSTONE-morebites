<?php

namespace Tests\Feature;

use App\Models\InventoryBatch;
use App\Models\InventoryDisposition;
use App\Models\InventoryItem;
use App\Models\MenuItem;
use App\Models\MenuItemIngredient;
use App\Models\Order;
use App\Models\OrderInventoryDeduction;
use App\Models\User;
use App\Services\InventoryDeductionService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MultiBatchFefoInventoryTest extends TestCase
{
    use RefreshDatabase;

    private function createAdmin(): User
    {
        return User::query()->create([
            'name' => 'Admin User',
            'email' => 'admin@test.com',
            'phone' => '09123456780',
            'password' => Hash::make('password123'),
            'role' => 'admin',
            'status' => 'Active',
        ]);
    }

    public function test_restock_creates_new_batch_instead_of_merging(): void
    {
        $admin = $this->createAdmin();
        Sanctum::actingAs($admin);

        // 1. Initial item setup with initial batch
        $response = $this->postJson('/api/inventory', [
            'name' => 'Mozzarella Cheese',
            'category' => 'Dairy',
            'stock' => 5.0,
            'unit' => 'kg',
            'reorder_level' => 2.0,
            'date_placed' => '2026-10-01',
            'expiry_date' => '2026-10-15',
            'batch_no' => 'MC-1001',
        ]);

        $response->assertCreated();
        $item = InventoryItem::where('name', 'Mozzarella Cheese')->first();
        $this->assertNotNull($item);
        $this->assertEquals(1, $item->batches()->count());

        $firstBatch = $item->batches()->first();
        $this->assertEquals('MC-1001', $firstBatch->batch_no);
        $this->assertEquals(5.0, (float) $firstBatch->stock);
        $this->assertEquals('2026-10-15', $firstBatch->expiry_date->toDateString());

        // 2. Restock with second delivery having later expiry
        $restockResponse = $this->postJson("/api/inventory/{$item->id}/restock", [
            'quantity' => 10.0,
            'date_placed' => '2026-10-08',
            'expiry_date' => '2026-10-30',
            'batch_no' => 'MC-1008',
        ]);

        $restockResponse->assertOk();
        $item->refresh();

        // Must have 2 distinct batches
        $this->assertEquals(2, $item->batches()->count());
        $this->assertEquals(15.0, (float) $item->stock);

        // Master item reflects earliest expiry among open batches
        $this->assertEquals('2026-10-15', $item->expiry_date->toDateString());

        $secondBatch = $item->batches()->where('batch_no', 'MC-1008')->first();
        $this->assertNotNull($secondBatch);
        $this->assertEquals(10.0, (float) $secondBatch->stock);
        $this->assertEquals('2026-10-30', $secondBatch->expiry_date->toDateString());
    }

    public function test_fefo_deducts_earliest_expiry_first_and_splits_across_batches(): void
    {
        $service = app(InventoryDeductionService::class);

        $item = InventoryItem::query()->create([
            'name' => 'Tomato Sauce',
            'category' => 'Ingredients',
            'stock' => 8.0,
            'unit' => 'kg',
            'reorder_level' => 1.0,
            'status' => 'In Stock',
        ]);

        // Batch 1: expires earlier (Oct 12), 3kg
        $batch1 = $item->batches()->create([
            'batch_no' => 'TS-EARLY',
            'stock' => 3.0,
            'initial_stock' => 3.0,
            'date_placed' => Carbon::parse('2026-10-01'),
            'expiry_date' => Carbon::parse('2026-10-12'),
            'status' => 'Sufficient',
        ]);

        // Batch 2: expires later (Oct 25), 5kg
        $batch2 = $item->batches()->create([
            'batch_no' => 'TS-LATE',
            'stock' => 5.0,
            'initial_stock' => 5.0,
            'date_placed' => Carbon::parse('2026-10-05'),
            'expiry_date' => Carbon::parse('2026-10-25'),
            'status' => 'Sufficient',
        ]);

        $menu = MenuItem::query()->create([
            'name' => 'Pasta Marinara',
            'category' => 'Pasta',
            'has_sizes' => false,
            'price' => 150,
            'available' => true,
            'archived' => false,
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $menu->id,
            'inventory_item_id' => $item->id,
            'qty_per_serving' => 1.0,
        ]);

        // Order needs 5kg of Tomato Sauce (should drain Batch 1 [3kg] and take 2kg from Batch 2)
        $order = Order::query()->create([
            'order_code' => '#ORD-99001',
            'customer_name' => 'Chef Mario',
            'order_type' => 'Dine-in',
            'total' => 750,
            'status' => 'Preparing',
        ]);

        $order->items()->create([
            'menu_item_id' => $menu->id,
            'name' => 'Pasta Marinara',
            'qty' => 5,
            'unit_price' => 150,
            'line_total' => 750,
        ]);

        $service->deductForOrder($order);

        $batch1->refresh();
        $batch2->refresh();
        $item->refresh();

        // Batch 1 drained to 0
        $this->assertEquals(0.0, (float) $batch1->stock);
        // Batch 2 had 5 - 2 = 3kg remaining
        $this->assertEquals(3.0, (float) $batch2->stock);
        // Master item stock = 3kg
        $this->assertEquals(3.0, (float) $item->stock);
        // Master item expiry is now Batch 2's expiry
        $this->assertEquals('2026-10-25', $item->expiry_date->toDateString());

        // Deductions recorded per batch
        $deductions = OrderInventoryDeduction::where('order_id', $order->id)->get();
        $this->assertCount(2, $deductions);
        $this->assertEquals(3.0, (float) $deductions->where('inventory_batch_id', $batch1->id)->first()->quantity);
        $this->assertEquals(2.0, (float) $deductions->where('inventory_batch_id', $batch2->id)->first()->quantity);

        // 3. Exact Reversal: cancel / restock order restores exact batches
        $service->restockForOrder($order);

        $batch1->refresh();
        $batch2->refresh();
        $item->refresh();

        $this->assertEquals(3.0, (float) $batch1->stock);
        $this->assertEquals(5.0, (float) $batch2->stock);
        $this->assertEquals(8.0, (float) $item->stock);
        $this->assertEquals('2026-10-12', $item->expiry_date->toDateString());
        $this->assertDatabaseMissing('order_inventory_deductions', ['order_id' => $order->id]);
    }

    public function test_perishables_are_prioritized_over_non_perishables(): void
    {
        $service = app(InventoryDeductionService::class);

        $item = InventoryItem::query()->create([
            'name' => 'Flour Mix',
            'category' => 'Ingredients',
            'stock' => 10.0,
            'unit' => 'kg',
            'reorder_level' => 1.0,
            'status' => 'In Stock',
        ]);

        // Non-perishable batch (no expiry date, placed older)
        $nonPerishable = $item->batches()->create([
            'batch_no' => 'FM-DRY-01',
            'stock' => 5.0,
            'initial_stock' => 5.0,
            'date_placed' => Carbon::parse('2026-09-01'),
            'expiry_date' => null,
            'status' => 'Sufficient',
        ]);

        // Perishable batch (has expiry date, placed more recently)
        $perishable = $item->batches()->create([
            'batch_no' => 'FM-PERISH-01',
            'stock' => 5.0,
            'initial_stock' => 5.0,
            'date_placed' => Carbon::parse('2026-10-01'),
            'expiry_date' => Carbon::parse('2026-10-20'),
            'status' => 'Sufficient',
        ]);

        $menu = MenuItem::query()->create([
            'name' => 'Focaccia',
            'category' => 'Sides',
            'has_sizes' => false,
            'price' => 100,
            'available' => true,
            'archived' => false,
        ]);

        MenuItemIngredient::query()->create([
            'menu_item_id' => $menu->id,
            'inventory_item_id' => $item->id,
            'qty_per_serving' => 3.0,
        ]);

        $order = Order::query()->create([
            'order_code' => '#ORD-99002',
            'customer_name' => 'Baker Bob',
            'order_type' => 'Dine-in',
            'total' => 100,
            'status' => 'Preparing',
        ]);

        $order->items()->create([
            'menu_item_id' => $menu->id,
            'name' => 'Focaccia',
            'qty' => 1,
            'unit_price' => 100,
            'line_total' => 100,
        ]);

        // Needs 3kg: must take from perishable batch first even though non-perishable was placed earlier
        $service->deductForOrder($order);

        $perishable->refresh();
        $nonPerishable->refresh();

        $this->assertEquals(2.0, (float) $perishable->stock);
        $this->assertEquals(5.0, (float) $nonPerishable->stock);
    }

    public function test_expiring_stock_disposition_operates_per_batch(): void
    {
        $admin = $this->createAdmin();
        Sanctum::actingAs($admin);

        $milk = InventoryItem::query()->create([
            'name' => 'Fresh Milk',
            'category' => 'Dairy',
            'stock' => 10.0,
            'unit' => 'L',
            'reorder_level' => 2.0,
            'status' => 'In Stock',
        ]);

        // Batch A: Expiring tomorrow (2L)
        $batchA = $milk->batches()->create([
            'batch_no' => 'MK-SOON',
            'stock' => 2.0,
            'initial_stock' => 2.0,
            'date_placed' => now()->subDays(5),
            'expiry_date' => now()->addDay(),
            'status' => 'Expiring Soon',
        ]);

        // Batch B: Fresh for another month (8L)
        $batchB = $milk->batches()->create([
            'batch_no' => 'MK-FRESH',
            'stock' => 8.0,
            'initial_stock' => 8.0,
            'date_placed' => now(),
            'expiry_date' => now()->addDays(30),
            'status' => 'Sufficient',
        ]);

        $response = $this->getJson('/api/inventory/expiring');
        $response->assertOk();

        $data = $response->json('data');
        // Only Batch A should be returned as expiring, not Batch B
        $batchIds = collect($data)->pluck('id')->all();
        $this->assertContains($batchA->id, $batchIds);
        $this->assertNotContains($batchB->id, $batchIds);

        // Mark Waste on Batch A
        $wasteRes = $this->postJson("/api/inventory/batches/{$batchA->id}/expiring/waste", [
            'notes' => 'Sour milk smell',
        ]);
        $wasteRes->assertOk();

        $batchA->refresh();
        $batchB->refresh();
        $milk->refresh();

        // Batch A is zeroed
        $this->assertEquals(0.0, (float) $batchA->stock);
        $this->assertEquals('Expired', $batchA->status);

        // Batch B is intact
        $this->assertEquals(8.0, (float) $batchB->stock);

        // Master milk stock is now 8L (not zeroed!)
        $this->assertEquals(8.0, (float) $milk->stock);
        $this->assertEquals('Sufficient', $milk->status);
    }
}

