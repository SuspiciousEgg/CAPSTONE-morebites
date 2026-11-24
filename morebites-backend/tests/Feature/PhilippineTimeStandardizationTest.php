<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Customer;
use App\Models\DriverBlacklist;
use App\Models\InventoryBatch;
use App\Models\InventoryItem;
use App\Models\InventoryLog;
use App\Models\LoyaltyLedger;
use App\Models\Order;
use App\Models\User;
use App\Services\TrackingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class PhilippineTimeStandardizationTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_utc_midnight_rollover_displays_philippine_standard_time_across_endpoints(): void
    {
        // Freeze clock at 2026-11-24 16:30:00 UTC === 2026-11-25 12:30 AM Asia/Manila (next calendar day in PHT!)
        $utcInstant = Carbon::create(2026, 11, 24, 16, 30, 0, 'UTC');
        Carbon::setTestNow($utcInstant);

        $owner = User::factory()->create(['role' => 'super_admin', 'status' => 'Active']);
        $driverUser = User::factory()->create([
            'role' => 'driver',
            'name' => 'Kuya Rider',
            'status' => 'Active',
        ]);
        $customerUser = User::factory()->create([
            'role' => 'customer',
            'name' => 'Ana Customer',
            'status' => 'Active',
        ]);
        $customer = Customer::query()->create([
            'user_id' => $customerUser->id,
            'customer_code' => 'CUST-999',
            'full_name' => 'Ana Customer',
            'email' => $customerUser->email,
            'phone' => '09171234567',
            'delivery_address' => 'Poblacion, Dangcagan, Bukidnon',
            'status' => 'ACTIVE',
            'registered_at' => $utcInstant,
            'loyalty_points' => 100,
            'points_expire_at' => Carbon::create(2026, 12, 24, 16, 30, 0, 'UTC'), // Dec 25, 2026 PHT
        ]);

        // 1. Order placed & delivered at 16:30 UTC (Nov 25, 2026 12:30 AM PHT)
        $order = Order::query()->create([
            'order_code' => '#ORD-00901',
            'customer_id' => $customer->id,
            'customer_name' => 'Ana Customer',
            'order_type' => 'Online Order',
            'total' => 350,
            'delivery_fee' => 40,
            'service_fee' => 0,
            'status' => 'Completed',
            'payment_method' => 'COD',
            'payment_status' => 'Paid',
            'delivery_address' => 'Poblacion, Dangcagan, Bukidnon',
            'dest_lat' => 7.615,
            'dest_lng' => 124.992,
            'driver_id' => $driverUser->id,
            'assigned_at' => $utcInstant,
            'delivered_at' => $utcInstant,
            'delivery_minutes' => 15,
        ]);

        // Verify DB still stores UTC cleanly without shifting
        $this->assertSame('2026-11-24 16:30:00', $order->fresh()->getRawOriginal('created_at'));

        // 2. Dashboard Activity Log -> 12:30 AM PHT
        ActivityLog::query()->create([
            'actor' => $owner->name,
            'action' => 'Created order #ORD-00901',
        ]);

        $dashRes = $this->actingAs($owner)->getJson('/api/dashboard');
        $dashRes->assertOk()
            ->assertJsonPath('data.activity_log.0.time', '12:30 AM');

        // 3. Tracking payload & timeline -> Nov 25, 2026 · 12:30 AM + arrival_by in PHT
        $tracking = app(TrackingService::class)->trackingPayload($order->fresh()->load(['driver', 'items.menuItem']));
        $this->assertSame('Nov 25, 2026 · 12:30 AM', $tracking['dateLabel']);
        $this->assertSame('Nov 25, 2026 · 12:30 AM', $tracking['ordered_at_label']);
        $this->assertSame('Nov 25, 2026 · 12:30 AM', $tracking['delivered_at_label']);
        $this->assertSame('12:30 AM', $tracking['timeline'][0]['timestamp']);
        $this->assertGreaterThan(0, (int) $tracking['eta_mins']);
        $expectedArrivalPht = Carbon::create(2026, 11, 25, 0, 30, 0, 'Asia/Manila')
            ->addMinutes((int) $tracking['eta_mins'])
            ->format('g:i A');
        $this->assertSame($expectedArrivalPht, $tracking['arrival_by']);

        // 4. Customer App orders & loyalty -> Nov 25, 2026 · 12:30 AM + Dec 25, 2026 expiry
        LoyaltyLedger::query()->create([
            'customer_id' => $customer->id,
            'order_id' => $order->id,
            'type' => 'earn',
            'points' => 10,
            'balance_after' => 100,
            'note' => 'Earned on #ORD-00901',
            'created_at' => $utcInstant,
        ]);

        $custOrdersRes = $this->actingAs($customerUser)->getJson('/api/customer/orders');
        $custOrdersRes->assertOk()
            ->assertJsonPath('data.0.dateLabel', 'Nov 25, 2026 · 12:30 AM')
            ->assertJsonPath('data.0.delivered_at_label', 'Nov 25, 2026 · 12:30 AM');

        $custLoyaltyRes = $this->actingAs($customerUser)->getJson('/api/customer/loyalty');
        $custLoyaltyRes->assertOk()
            ->assertJsonPath('expiry_date_label', 'Dec 25, 2026')
            ->assertJsonPath('history.0.date', 'Nov 25, 2026 · 12:30 AM')
            ->assertJsonPath('history.0.date_short', 'Nov 25, 2026');

        // 5. Customer Management & Loyalty Ledger admin APIs -> PHT
        $custDetailRes = $this->actingAs($owner)->getJson("/api/customers/{$customer->id}");
        $custDetailRes->assertOk()
            ->assertJsonPath('data.registered', 'Nov 25, 2026')
            ->assertJsonPath('data.registeredFull', 'Nov 25, 2026 12:30 AM')
            ->assertJsonPath('data.points_expire_at', 'Dec 25, 2026')
            ->assertJsonPath('data.order_history.0.datetime', 'Nov 25, 2026 12:30 AM');

        $ledgerRes = $this->actingAs($owner)->getJson('/api/loyalty-settings/history');
        $ledgerRes->assertOk()
            ->assertJsonPath('data.0.date', 'Nov 25, 2026 12:30 AM');

        // 6. Inventory logs & expiry at 12:30 AM PHT (Nov 25)
        $itemToday = InventoryItem::query()->create([
            'name' => 'Fresh Milk',
            'batch_no' => 'FR-1125',
            'category' => 'Dairy',
            'stock' => 10,
            'unit' => 'L',
            'reorder_level' => 2,
            'status' => 'Expires Today',
            'date_placed' => '2026-11-20',
            'expiry_date' => '2026-11-25',
        ]);
        $batchExpired = InventoryBatch::query()->create([
            'inventory_item_id' => $itemToday->id,
            'batch_no' => 'FR-1124',
            'stock' => 5,
            'initial_stock' => 5,
            'date_placed' => '2026-11-18',
            'expiry_date' => '2026-11-24',
            'status' => 'Expired',
        ]);

        $this->assertSame(0, $itemToday->daysLeft());
        $this->assertSame('Expires Today', InventoryItem::deriveStatus(10, 2, '2026-11-25'));
        $this->assertSame(-1, $batchExpired->daysLeft());
        $this->assertTrue($batchExpired->isExpired());

        InventoryLog::query()->create([
            'inventory_item_id' => $itemToday->id,
            'item_name' => 'Fresh Milk',
            'category' => 'Dairy',
            'stock_level' => '10 L',
            'quantity' => 10,
            'previous_stock' => 0,
            'unit' => 'L',
            'log_type' => 'Added',
            'status' => 'Expires Today',
            'user_id' => $owner->id,
        ]);

        $invLogsRes = $this->actingAs($owner)->getJson('/api/inventory/logs?range=today');
        $invLogsRes->assertOk()
            ->assertJsonPath('data.0.datetime', 'Nov 25, 2026 12:30 AM')
            ->assertJsonPath('meta.stats.total_today', 1);

        // 7. Reports date range accepts Manila today (2026-11-25) and formats PHT date/time
        $reportsRes = $this->actingAs($owner)->getJson('/api/reports?from_date=2026-11-25&to_date=2026-11-25');
        $reportsRes->assertOk()
            ->assertJsonPath('data.all_records.0.datetime', '2026-11-25')
            ->assertJsonPath('data.delivery_records.0.delivery_date', '2026-11-25')
            ->assertJsonPath('data.delivery_records.0.delivery_time', '12:30 AM');

        $genRes = $this->actingAs($owner)->postJson('/api/reports/generate', [
            'from_date' => '2026-11-25',
            'to_date' => '2026-11-25',
            'format_type' => 'Sales Summary Report',
            'export_as' => 'PDF',
            'size_bytes' => 1024,
        ]);
        $genRes->assertCreated()
            ->assertJsonPath('data.date', 'Nov 25, 2026');

        // 8. Blacklist timestamp formats in PHT
        $archivedDriver = User::factory()->create([
            'role' => 'driver',
            'name' => 'Blocked Rider',
            'status' => 'Inactive',
            'archived_at' => $utcInstant,
        ]);
        DriverBlacklist::query()->create([
            'driver_id' => $archivedDriver->id,
            'driver_code' => 'DRIVER-099',
            'name' => 'Blocked Rider',
            'license_number' => 'N01-99-000111',
            'phone' => '09170001111',
            'reason' => 'Policy violation',
            'blacklisted_at' => $utcInstant,
        ]);

        $blRes = $this->actingAs($owner)->getJson('/api/blacklist');
        $blRes->assertOk()
            ->assertJsonPath('data.0.date', 'November 25, 2026 12:30 AM');
    }
}
