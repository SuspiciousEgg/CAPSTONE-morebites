<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('inventory:check-expirations', function () {
    $now = now()->startOfDay();
    $items = \App\Models\InventoryItem::query()
        ->whereNotNull('expiry_date')
        ->whereDate('expiry_date', '<', $now)
        ->get();

    $count = 0;
    foreach ($items as $item) {
        if ($item->status !== 'Expired') {
            $item->update(['status' => 'Expired']);
            $count++;
        }
    }

    app(\App\Services\InventoryDeductionService::class)->syncMenuAvailability();

    $this->info("Expired inventory items checked. {$count} marked as expired and linked menu items disabled.");
})->purpose('Check for expired inventory items and disable linked menu items')->daily();
