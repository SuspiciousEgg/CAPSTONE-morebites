<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('first_name')->nullable()->after('name');
            $table->string('last_name')->nullable()->after('first_name');
            $table->string('username')->nullable()->unique()->after('email');
            $table->string('phone')->nullable()->after('username');
            $table->string('role')->default('admin')->after('phone'); // super_admin, admin, driver
            $table->string('status')->default('Active')->after('role'); // Active, Inactive
            $table->string('gender')->nullable()->after('status');
            $table->date('birthday')->nullable()->after('gender');
            $table->string('license_number')->nullable()->after('birthday');
            $table->date('license_expiry')->nullable()->after('license_number');
            $table->string('vehicle_type')->nullable()->after('license_expiry');
            $table->string('plate_no')->nullable()->after('vehicle_type');
            $table->decimal('rating', 3, 1)->default(0)->after('plate_no');
            $table->unsignedInteger('completed_orders')->default(0)->after('rating');
            $table->unsignedInteger('years_experience')->default(0)->after('completed_orders');
            $table->unsignedTinyInteger('success_rate')->default(0)->after('years_experience');
            $table->timestamp('archived_at')->nullable()->after('remember_token');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'first_name', 'last_name', 'username', 'phone', 'role', 'status',
                'gender', 'birthday', 'license_number', 'license_expiry', 'vehicle_type',
                'plate_no', 'rating', 'completed_orders', 'years_experience', 'success_rate',
                'archived_at',
            ]);
        });
    }
};
