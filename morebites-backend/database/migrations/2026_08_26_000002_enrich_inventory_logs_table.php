<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_logs', function (Blueprint $table) {
            $table->decimal('quantity', 10, 2)->nullable()->after('stock_level');
            $table->decimal('previous_stock', 10, 2)->nullable()->after('quantity');
            $table->string('unit')->nullable()->after('previous_stock');
            $table->string('reason')->nullable()->after('unit');
            $table->string('action_label')->nullable()->after('reason');
            $table->text('notes')->nullable()->after('action_label');
            $table->string('batch_no')->nullable()->after('notes');
        });
    }

    public function down(): void
    {
        Schema::table('inventory_logs', function (Blueprint $table) {
            $table->dropColumn([
                'quantity',
                'previous_stock',
                'unit',
                'reason',
                'action_label',
                'notes',
                'batch_no',
            ]);
        });
    }
};
