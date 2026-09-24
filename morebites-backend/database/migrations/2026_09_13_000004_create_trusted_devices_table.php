<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('trusted_devices')) {
            Schema::create('trusted_devices', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->string('device_id');
                $table->timestamp('first_seen_at')->nullable();
                $table->timestamps();

                $table->unique(['user_id', 'device_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('trusted_devices');
    }
};

