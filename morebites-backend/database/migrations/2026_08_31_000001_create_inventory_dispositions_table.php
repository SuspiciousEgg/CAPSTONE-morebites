<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_dispositions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inventory_item_id')->constrained()->cascadeOnDelete();
            $table->string('disposition')->default('pending');
            $table->foreignId('promo_menu_item_id')->nullable()->constrained('menu_items')->nullOnDelete();
            $table->decimal('promo_discount_percent', 5, 2)->nullable();
            $table->text('notes')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });

        Schema::table('menu_items', function (Blueprint $table) {
            $table->boolean('promo_active')->default(false)->after('archived');
            $table->decimal('promo_discount_percent', 5, 2)->nullable()->after('promo_active');
            $table->string('promo_label')->nullable()->after('promo_discount_percent');
        });
    }

    public function down(): void
    {
        Schema::table('menu_items', function (Blueprint $table) {
            $table->dropColumn(['promo_active', 'promo_discount_percent', 'promo_label']);
        });

        Schema::dropIfExists('inventory_dispositions');
    }
};
