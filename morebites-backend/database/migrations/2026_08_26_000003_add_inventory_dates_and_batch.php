<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->string('batch_no')->nullable()->after('name');
            $table->date('date_placed')->nullable()->after('status');
            $table->date('expiry_date')->nullable()->after('date_placed');
        });

        Schema::table('inventory_logs', function (Blueprint $table) {
            $table->date('date_placed')->nullable()->after('batch_no');
            $table->date('expiry_date')->nullable()->after('date_placed');
        });
    }

    public function down(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->dropColumn(['batch_no', 'date_placed', 'expiry_date']);
        });

        Schema::table('inventory_logs', function (Blueprint $table) {
            $table->dropColumn(['date_placed', 'expiry_date']);
        });
    }
};
