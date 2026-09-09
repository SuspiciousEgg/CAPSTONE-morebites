<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->unsignedTinyInteger('food_rating')->nullable()->after('route_coordinates');
            $table->text('food_comment')->nullable()->after('food_rating');
            $table->unsignedTinyInteger('rider_rating')->nullable()->after('food_comment');
            $table->text('rider_comment')->nullable()->after('rider_rating');
            $table->timestamp('rated_at')->nullable()->after('rider_comment');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn([
                'food_rating',
                'food_comment',
                'rider_rating',
                'rider_comment',
                'rated_at',
            ]);
        });
    }
};
