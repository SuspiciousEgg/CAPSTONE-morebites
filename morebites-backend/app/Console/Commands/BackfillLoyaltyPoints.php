<?php

namespace App\Console\Commands;

use App\Services\LoyaltyService;
use Illuminate\Console\Command;

class BackfillLoyaltyPoints extends Command
{
    protected $signature = 'loyalty:backfill';

    protected $description = 'Safe & idempotent backfill of opening balance loyalty points for completed Online Orders';

    public function handle(LoyaltyService $service): int
    {
        $this->info('Starting loyalty points backfill...');
        $result = $service->backfill();

        $this->info("Completed orders processed: {$result['orders_processed']}");
        $this->info("New orders credited: {$result['orders_credited']}");
        $this->info("Customers updated: {$result['customers_updated']}");
        $this->info('Loyalty backfill finished successfully.');

        return Command::SUCCESS;
    }
}

