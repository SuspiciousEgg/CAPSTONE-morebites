<?php

use Carbon\Carbon;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inventory_item_id')->constrained()->cascadeOnDelete();
            $table->string('batch_no');
            $table->decimal('stock', 12, 3)->default(0);
            $table->decimal('initial_stock', 12, 3)->default(0);
            $table->date('date_placed')->nullable();
            $table->date('expiry_date')->nullable();
            $table->string('status')->default('Sufficient');
            $table->timestamps();

            $table->index(['inventory_item_id', 'expiry_date']);
        });

        Schema::create('order_inventory_deductions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('inventory_item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('inventory_batch_id')->constrained()->cascadeOnDelete();
            $table->decimal('quantity', 12, 3);
            $table->timestamps();

            $table->index(['order_id', 'inventory_batch_id']);
        });

        Schema::table('inventory_dispositions', function (Blueprint $table) {
            $table->foreignId('inventory_batch_id')->nullable()->after('inventory_item_id')->constrained('inventory_batches')->cascadeOnDelete();
        });

        Schema::table('inventory_logs', function (Blueprint $table) {
            $table->foreignId('inventory_batch_id')->nullable()->after('inventory_item_id')->constrained('inventory_batches')->nullOnDelete();
        });

        // Seed initial batches for existing inventory items
        $items = DB::table('inventory_items')->get();
        foreach ($items as $item) {
            $placed = $item->date_placed ?? ($item->created_at ? Carbon::parse($item->created_at)->toDateString() : now()->toDateString());
            $batchNo = $item->batch_no;
            if (! $batchNo) {
                $letters = preg_replace('/[^A-Za-z]/', '', $item->name) ?: 'XX';
                $prefix = strtoupper(substr($letters, 0, 2));
                $batchNo = $prefix . '-' . Carbon::parse($placed)->format('md');
            }

            $expiry = $item->expiry_date;
            $status = 'Sufficient';
            $stock = (float) $item->stock;
            $reorder = (float) $item->reorder_level;

            if ($stock <= 0) {
                $status = 'Out of Stock';
            } elseif ($expiry) {
                $days = (int) floor((Carbon::parse($expiry)->startOfDay()->getTimestamp() - now()->startOfDay()->getTimestamp()) / 86400);
                if ($days < 0) {
                    $status = 'Expired';
                } elseif ($days === 0) {
                    $status = 'Expires Today';
                } elseif ($days <= 7) {
                    $status = 'Expiring Soon';
                } elseif ($stock <= $reorder) {
                    $status = 'Low Stock';
                }
            } elseif ($stock <= $reorder) {
                $status = 'Low Stock';
            }

            $batchId = DB::table('inventory_batches')->insertGetId([
                'inventory_item_id' => $item->id,
                'batch_no' => $batchNo,
                'stock' => $stock,
                'initial_stock' => $stock,
                'date_placed' => $placed,
                'expiry_date' => $expiry,
                'status' => $status,
                'created_at' => $item->created_at ?: now(),
                'updated_at' => $item->updated_at ?: now(),
            ]);

            // Link existing active dispositions to this initial batch
            DB::table('inventory_dispositions')
                ->where('inventory_item_id', $item->id)
                ->whereNull('inventory_batch_id')
                ->update(['inventory_batch_id' => $batchId]);

            // Link logs for this item to this batch
            DB::table('inventory_logs')
                ->where('inventory_item_id', $item->id)
                ->whereNull('inventory_batch_id')
                ->update(['inventory_batch_id' => $batchId]);
        }
    }

    public function down(): void
    {
        Schema::table('inventory_logs', function (Blueprint $table) {
            $table->dropForeign(['inventory_batch_id']);
            $table->dropColumn('inventory_batch_id');
        });

        Schema::table('inventory_dispositions', function (Blueprint $table) {
            $table->dropForeign(['inventory_batch_id']);
            $table->dropColumn('inventory_batch_id');
        });

        Schema::dropIfExists('order_inventory_deductions');
        Schema::dropIfExists('inventory_batches');
    }
};
