<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('password_reset_otps', function (Blueprint $table) {
            $table->string('email', 191)->nullable()->after('phone')->index();
        });
    }

    public function down(): void
    {
        Schema::table('password_reset_otps', function (Blueprint $table) {
            $table->dropColumn('email');
        });
    }
};

