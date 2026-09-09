<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->decimal('dest_lat', 10, 7)->nullable()->after('delivery_address');
            $table->decimal('dest_lng', 10, 7)->nullable()->after('dest_lat');
            $table->json('route_coordinates')->nullable()->after('delivery_minutes');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->decimal('current_lat', 10, 7)->nullable()->after('plate_no');
            $table->decimal('current_lng', 10, 7)->nullable()->after('current_lat');
            $table->timestamp('location_updated_at')->nullable()->after('current_lng');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['dest_lat', 'dest_lng', 'route_coordinates']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['current_lat', 'current_lng', 'location_updated_at']);
        });
    }
};
