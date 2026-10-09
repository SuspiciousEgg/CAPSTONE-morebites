<?php

use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->json('allowed_pages')->nullable()->after('role_access');
        });

        $allPages = [
            'Dashboard',
            'Orders',
            'Menu',
            'Inventory',
            'Dispatch',
            'Reports',
            'Driver',
            'Customers',
            'Account',
            'Settings',
        ];

        $cashierPages = [
            'Dashboard',
            'Orders',
            'Menu',
            'Inventory',
            'Dispatch',
            'Reports',
            'Driver',
        ];

        foreach (DB::table('users')->get() as $user) {
            $pages = match ($user->role) {
                'super_admin', 'admin' => $allPages,
                'cashier' => $cashierPages,
                'driver' => ['Dashboard'],
                default => $allPages,
            };

            DB::table('users')->where('id', $user->id)->update([
                'allowed_pages' => json_encode($pages),
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('allowed_pages');
        });
    }
};

