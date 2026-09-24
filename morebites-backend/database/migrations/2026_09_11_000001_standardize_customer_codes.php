<?php

use App\Models\Customer;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $customers = Customer::query()->orderBy('id')->get();
        $index = 1;
        foreach ($customers as $customer) {
            $formatted = sprintf('C-%04d', $index);
            DB::table('customers')->where('id', $customer->id)->update([
                'customer_code' => $formatted,
            ]);
            $index++;
        }
    }

    public function down(): void
    {
    }
};

