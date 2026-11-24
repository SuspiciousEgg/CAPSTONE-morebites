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
        Schema::table('menu_item_ingredients', function (Blueprint $table) {
            if (! Schema::hasColumn('menu_item_ingredients', 'price')) {
                $table->decimal('price', 10, 2)->default(0.00)->after('unit');
            }
        });

        Schema::table('order_items', function (Blueprint $table) {
            if (! Schema::hasColumn('order_items', 'removed_ingredients')) {
                $table->json('removed_ingredients')->nullable()->after('size');
            }
        });

        // Backfill existing linked ingredients so price is never null
        \Illuminate\Support\Facades\DB::table('menu_item_ingredients')
            ->whereNull('price')
            ->update(['price' => 0.00]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('menu_item_ingredients', function (Blueprint $table) {
            if (Schema::hasColumn('menu_item_ingredients', 'price')) {
                $table->dropColumn('price');
            }
        });

        Schema::table('order_items', function (Blueprint $table) {
            if (Schema::hasColumn('order_items', 'removed_ingredients')) {
                $table->dropColumn('removed_ingredients');
            }
        });
    }
};

