<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->json('role_access')->nullable()->after('role');
        });

        foreach (DB::table('users')->get() as $user) {
            $access = match ($user->role) {
                'super_admin' => ['admin', 'driver', 'cashier'],
                'admin' => ['admin'],
                'driver' => ['driver'],
                'cashier' => ['cashier'],
                default => [],
            };

            DB::table('users')->where('id', $user->id)->update([
                'role_access' => json_encode($access),
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('role_access');
        });
    }
};
