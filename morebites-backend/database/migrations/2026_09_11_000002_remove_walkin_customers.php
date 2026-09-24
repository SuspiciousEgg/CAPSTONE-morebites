<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Unlink any orders associated with walk-in customers (or Dine-in / Takeout)
        $walkinCustomerIds = DB::table('customers')->whereNull('user_id')->pluck('id');
        if ($walkinCustomerIds->isNotEmpty()) {
            DB::table('orders')->whereIn('customer_id', $walkinCustomerIds)->update(['customer_id' => null]);
        }
        DB::table('orders')->whereIn('order_type', ['Dine-in', 'Takeout'])->update(['customer_id' => null]);

        // 2. Delete walk-in customer records that were created without a mobile app user account
        DB::table('customers')->whereNull('user_id')->delete();

        // 3. Re-sequence genuine registered customers
        $registered = DB::table('customers')->orderBy('id')->get();
        $idx = 1;
        foreach ($registered as $c) {
            DB::table('customers')->where('id', $c->id)->update([
                'customer_code' => sprintf('C-%04d', $idx++),
            ]);
        }
    }

    public function down(): void
    {
    }
};

