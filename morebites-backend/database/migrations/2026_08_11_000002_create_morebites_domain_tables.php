<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->string('customer_code')->unique();
            $table->string('full_name');
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            $table->string('delivery_address')->nullable();
            $table->string('status')->default('ACTIVE'); // ACTIVE, INACTIVE
            $table->timestamp('registered_at')->nullable();
            $table->timestamps();
        });

        Schema::create('menu_items', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('category');
            $table->string('image')->nullable();
            $table->boolean('has_sizes')->default(false);
            $table->decimal('price', 10, 2)->default(0);
            $table->boolean('available')->default(true);
            $table->boolean('archived')->default(false);
            $table->timestamps();
        });

        Schema::create('menu_item_sizes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('menu_item_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->decimal('price', 10, 2);
            $table->timestamps();
        });

        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_code')->unique();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->string('customer_name');
            $table->string('order_type'); // Online Order, Walk-in, Takeout, Dine-in, Room Service
            $table->decimal('total', 10, 2)->default(0);
            $table->string('status')->default('Pending');
            $table->string('payment_method')->nullable();
            $table->string('payment_status')->nullable();
            $table->string('delivery_address')->nullable();
            $table->foreignId('driver_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('assigned_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->unsignedInteger('delivery_minutes')->nullable();
            $table->decimal('delivery_distance_km', 8, 2)->nullable();
            $table->timestamps();
        });

        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('menu_item_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('size')->nullable();
            $table->unsignedInteger('qty')->default(1);
            $table->decimal('unit_price', 10, 2);
            $table->decimal('line_total', 10, 2);
            $table->timestamps();
        });

        Schema::create('inventory_items', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('category');
            $table->decimal('stock', 10, 2)->default(0);
            $table->string('unit')->default('pcs');
            $table->decimal('reorder_level', 10, 2)->default(0);
            $table->string('status')->default('Sufficient');
            $table->timestamps();
        });

        Schema::create('inventory_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inventory_item_id')->nullable()->constrained()->nullOnDelete();
            $table->string('item_name');
            $table->string('category')->nullable();
            $table->string('stock_level');
            $table->string('log_type'); // Added, Removed
            $table->string('status')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('driver_blacklist', function (Blueprint $table) {
            $table->id();
            $table->foreignId('driver_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('driver_code')->nullable();
            $table->string('name');
            $table->string('license_number')->nullable();
            $table->string('phone')->nullable();
            $table->string('reason');
            $table->text('notes')->nullable();
            $table->string('attachment_name')->nullable();
            $table->string('attachment_meta')->nullable();
            $table->timestamp('blacklisted_at')->nullable();
            $table->timestamps();
        });

        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->string('actor')->nullable();
            $table->string('action');
            $table->timestamps();
        });

        Schema::create('driver_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('driver_id')->constrained('users')->cascadeOnDelete();
            $table->text('text');
            $table->unsignedTinyInteger('rating')->default(5);
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('exported_reports', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('format')->default('PDF');
            $table->string('size')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('exported_reports');
        Schema::dropIfExists('driver_reviews');
        Schema::dropIfExists('activity_logs');
        Schema::dropIfExists('driver_blacklist');
        Schema::dropIfExists('inventory_logs');
        Schema::dropIfExists('inventory_items');
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('orders');
        Schema::dropIfExists('menu_item_sizes');
        Schema::dropIfExists('menu_items');
        Schema::dropIfExists('customers');
    }
};
