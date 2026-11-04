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
        Schema::table('orders', function (Blueprint $table) {
            $table->unsignedInteger('estimated_delivery_minutes')->nullable()->after('delivery_minutes');
            $table->unsignedInteger('late_minutes')->default(0)->after('estimated_delivery_minutes');
            $table->unsignedInteger('late_discount_percent')->default(0)->after('late_minutes');
            $table->decimal('late_discount', 10, 2)->default(0.00)->after('points_discount');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn([
                'estimated_delivery_minutes',
                'late_minutes',
                'late_discount_percent',
                'late_discount',
            ]);
        });
    }
};

