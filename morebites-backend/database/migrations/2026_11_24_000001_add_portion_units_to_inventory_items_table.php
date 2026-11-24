<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            if (! Schema::hasColumn('inventory_items', 'portion_unit')) {
                $table->string('portion_unit', 30)->nullable()->after('unit');
            }
            if (! Schema::hasColumn('inventory_items', 'portions_per_unit')) {
                $table->decimal('portions_per_unit', 12, 4)->nullable()->after('portion_unit');
            }
        });
    }

    public function down(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            $drop = [];
            if (Schema::hasColumn('inventory_items', 'portions_per_unit')) {
                $drop[] = 'portions_per_unit';
            }
            if (Schema::hasColumn('inventory_items', 'portion_unit')) {
                $drop[] = 'portion_unit';
            }
            if (! empty($drop)) {
                $table->dropColumn($drop);
            }
        });
    }
};

