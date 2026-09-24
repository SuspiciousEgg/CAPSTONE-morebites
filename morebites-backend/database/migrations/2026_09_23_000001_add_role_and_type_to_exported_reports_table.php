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
        Schema::table('exported_reports', function (Blueprint $table) {
            $table->string('type')->nullable()->after('format');
            $table->string('role')->nullable()->after('size');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('exported_reports', function (Blueprint $table) {
            $table->dropColumn(['type', 'role']);
        });
    }
};

