<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            if (! Schema::hasColumn('inventory_items', 'price')) {
                $table->decimal('price', 10, 2)->default(0.00)->after('reorder_level');
            }
        });

        \Illuminate\Support\Facades\DB::table('inventory_items')
            ->whereNull('price')
            ->update(['price' => 0.00]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            if (Schema::hasColumn('inventory_items', 'price')) {
                $table->dropColumn('price');
            }
        });
    }
};

