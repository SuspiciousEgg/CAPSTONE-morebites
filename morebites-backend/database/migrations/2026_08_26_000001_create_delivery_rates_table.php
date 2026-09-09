<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('delivery_rates', function (Blueprint $table) {
            $table->id();
            $table->decimal('min_km', 8, 2)->default(0);
            $table->decimal('max_km', 8, 2)->nullable(); // null = no upper limit
            $table->decimal('fee', 10, 2);
            $table->boolean('active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->decimal('delivery_fee', 10, 2)->nullable()->after('total');
            $table->decimal('service_fee', 10, 2)->nullable()->after('delivery_fee');
        });

        DB::table('delivery_rates')->insert([
            [
                'min_km' => 0, 'max_km' => 2, 'fee' => 30, 'active' => 1, 'sort_order' => 1,
                'created_at' => now(), 'updated_at' => now(),
            ],
            [
                'min_km' => 2, 'max_km' => 5, 'fee' => 40, 'active' => 1, 'sort_order' => 2,
                'created_at' => now(), 'updated_at' => now(),
            ],
            [
                'min_km' => 5, 'max_km' => 10, 'fee' => 60, 'active' => 1, 'sort_order' => 3,
                'created_at' => now(), 'updated_at' => now(),
            ],
            [
                'min_km' => 10, 'max_km' => null, 'fee' => 80, 'active' => 1, 'sort_order' => 4,
                'created_at' => now(), 'updated_at' => now(),
            ],
        ]);
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['delivery_fee', 'service_fee']);
        });
        Schema::dropIfExists('delivery_rates');
    }
};
