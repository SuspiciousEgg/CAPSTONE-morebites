<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('menu_item_ingredients', function (Blueprint $table) {
            if (! Schema::hasColumn('menu_item_ingredients', 'is_removable')) {
                $table->boolean('is_removable')->default(true)->after('price');
            }
        });
    }

    public function down(): void
    {
        Schema::table('menu_item_ingredients', function (Blueprint $table) {
            if (Schema::hasColumn('menu_item_ingredients', 'is_removable')) {
                $table->dropColumn('is_removable');
            }
        });
    }
};

