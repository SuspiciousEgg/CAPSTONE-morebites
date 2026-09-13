<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('notification_reads')) {
            Schema::create('notification_reads', function (Blueprint $table) {
                $table->id();
                $table->foreignId('notification_id')->constrained('notifications')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->timestamp('read_at');
                $table->timestamps();

                $table->unique(['notification_id', 'user_id']);
            });
        }

        // Clean up any doubled '##' in existing notification titles and messages
        DB::table('notifications')
            ->where('title', 'like', '%##%')
            ->update([
                'title' => DB::raw("REPLACE(title, '##', '#')"),
            ]);

        DB::table('notifications')
            ->where('message', 'like', '%##%')
            ->update([
                'message' => DB::raw("REPLACE(message, '##', '#')"),
            ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_reads');
    }
};

