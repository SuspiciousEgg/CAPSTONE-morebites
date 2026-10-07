<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('menu_item_ingredients', function (Blueprint $table) {
            $table->string('unit', 20)->nullable()->after('qty_per_serving');
        });

        // Seed existing rows with the inventory item's unit in a cross-database compatible way
        $rows = DB::table('menu_item_ingredients')->whereNull('unit')->get();
        foreach ($rows as $row) {
            $unit = DB::table('inventory_items')->where('id', $row->inventory_item_id)->value('unit');
            if ($unit) {
                DB::table('menu_item_ingredients')->where('id', $row->id)->update(['unit' => $unit]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('menu_item_ingredients', function (Blueprint $table) {
            $table->dropColumn('unit');
        });
    }
};
