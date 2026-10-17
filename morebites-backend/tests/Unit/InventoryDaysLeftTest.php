<?php

namespace Tests\Unit;

use App\Models\InventoryBatch;
use App\Models\InventoryItem;
use Carbon\Carbon;
use Tests\TestCase;

class InventoryDaysLeftTest extends TestCase
{
    public function test_days_left_follows_exact_expiry_date_from_today(): void
    {
        Carbon::setTestNow('2026-10-17');

        $item = new InventoryItem([
            'name' => 'Fresh Milk',
            'date_placed' => '2026-10-01',
            'expiry_date' => '2026-10-22',
        ]);

        // Expiry is 5 days from today (Oct 17 to Oct 22 = 5 days)
        // (Previously it was hardcoded/static to Oct 22 - Oct 01 = 21 days!)
        $this->assertEquals(5, $item->daysLeft());
        $this->assertEquals(5, $item->daysUntilExpiry());

        // As time advances to Oct 20, days left dynamically counts down to 2
        Carbon::setTestNow('2026-10-20');
        $this->assertEquals(2, $item->daysLeft());

        // On the day of expiry (Oct 22), days left is 0
        Carbon::setTestNow('2026-10-22');
        $this->assertEquals(0, $item->daysLeft());

        // Past expiry (Oct 25), days left is -3 (overdue)
        Carbon::setTestNow('2026-10-25');
        $this->assertEquals(-3, $item->daysLeft());
    }

    public function test_non_perishable_item_returns_null_days_left(): void
    {
        Carbon::setTestNow('2026-10-17');

        $item = new InventoryItem([
            'name' => 'Table Salt',
            'date_placed' => '2026-10-01',
            'expiry_date' => null,
        ]);

        $this->assertNull($item->daysLeft());
        $this->assertNull($item->daysUntilExpiry());
    }

    public function test_batch_days_left_follows_exact_expiry_date(): void
    {
        Carbon::setTestNow('2026-10-17');

        $batch = new InventoryBatch([
            'batch_no' => 'BAT-001',
            'date_placed' => '2026-10-05',
            'expiry_date' => '2026-10-27',
        ]);

        // Oct 17 to Oct 27 = 10 days
        $this->assertEquals(10, $batch->daysLeft());
        $this->assertEquals(10, $batch->daysUntilExpiry());

        Carbon::setTestNow('2026-10-27');
        $this->assertEquals(0, $batch->daysLeft());

        Carbon::setTestNow('2026-10-29');
        $this->assertEquals(-2, $batch->daysLeft());
    }
}

