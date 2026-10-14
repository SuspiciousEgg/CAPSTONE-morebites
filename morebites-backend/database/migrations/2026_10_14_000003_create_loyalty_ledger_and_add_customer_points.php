<?php

use App\Models\Customer;
use App\Models\LoyaltySetting;
use App\Models\Order;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->unsignedInteger('loyalty_points')->default(0)->after('status');
            $table->timestamp('points_expire_at')->nullable()->after('loyalty_points');
        });

        Schema::create('loyalty_ledger', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->string('type'); // earn, redeem, refund, expire, adjust
            $table->integer('points');
            $table->integer('balance_after');
            $table->string('note')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['order_id', 'type']);
            $table->index(['customer_id', 'created_at']);
        });

        // Safe & idempotent backfill for existing completed online orders
        $settings = LoyaltySetting::current();
        $expiryDays = (int) ($settings->points_expiry_days ?? 30);
        $expiryDate = $expiryDays > 0 ? now()->addDays($expiryDays) : null;

        $orders = Order::query()
            ->where('order_type', 'Online Order')
            ->whereNotNull('customer_id')
            ->whereIn('status', ['Completed', 'Delivered'])
            ->orderBy('id')
            ->get();

        foreach ($orders as $order) {
            $exists = DB::table('loyalty_ledger')
                ->where('order_id', $order->id)
                ->where('type', 'earn')
                ->exists();

            if (! $exists) {
                $points = (int) round(((float) $order->total) / 2);
                $prevBalance = (int) (DB::table('loyalty_ledger')
                    ->where('customer_id', $order->customer_id)
                    ->orderByDesc('id')
                    ->value('balance_after') ?? 0);

                $newBalance = $prevBalance + $points;

                DB::table('loyalty_ledger')->insert([
                    'customer_id' => $order->customer_id,
                    'order_id' => $order->id,
                    'type' => 'earn',
                    'points' => $points,
                    'balance_after' => $newBalance,
                    'note' => "Opening balance from order {$order->order_code}",
                    'created_at' => $order->delivered_at ?? $order->updated_at ?? now(),
                ]);
            }
        }

        // Set customer balances and initial expiry date from go-live
        $customers = Customer::query()->get();
        foreach ($customers as $c) {
            $lastBalance = DB::table('loyalty_ledger')
                ->where('customer_id', $c->id)
                ->orderByDesc('id')
                ->value('balance_after');

            $points = (int) ($lastBalance ?? 0);
            DB::table('customers')->where('id', $c->id)->update([
                'loyalty_points' => $points,
                'points_expire_at' => $points > 0 ? $expiryDate : null,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('loyalty_ledger');

        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn(['loyalty_points', 'points_expire_at']);
        });
    }
};

