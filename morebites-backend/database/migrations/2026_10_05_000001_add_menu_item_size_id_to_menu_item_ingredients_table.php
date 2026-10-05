<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('menu_item_ingredients', function (Blueprint $table) {
            $table->index('menu_item_id');
            $table->dropUnique(['menu_item_id', 'inventory_item_id']);
            $table->foreignId('menu_item_size_id')
                ->nullable()
                ->after('menu_item_id')
                ->constrained('menu_item_sizes')
                ->cascadeOnDelete();
            $table->unique(['menu_item_id', 'menu_item_size_id', 'inventory_item_id'], 'menu_item_size_inventory_unique');
        });
    }

    public function down(): void
    {
        Schema::table('menu_item_ingredients', function (Blueprint $table) {
            $table->dropUnique('menu_item_size_inventory_unique');
            $table->dropConstrainedForeignId('menu_item_size_id');
            $table->unique(['menu_item_id', 'inventory_item_id']);
            $table->dropIndex(['menu_item_id']);
        });
    }
};
