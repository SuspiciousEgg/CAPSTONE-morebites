<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('order_sequences')) {
            Schema::create('order_sequences', function (Blueprint $table) {
                $table->id();
            });
        }

        // Correct outlier '#ORD-00101' to '#ORD-00021' to keep the historical sequence 00021..00027 clean
        DB::table('orders')
            ->where('order_code', '#ORD-00101')
            ->update(['order_code' => '#ORD-00021']);

        DB::table('notifications')
            ->where('title', 'like', '%ORD-00101%')
            ->update([
                'title' => DB::raw("REPLACE(title, 'ORD-00101', 'ORD-00021')"),
            ]);

        // Find the current max integer from existing orders (e.g. 27 from '#ORD-00027')
        $maxNum = 0;
        $orders = DB::table('orders')->pluck('order_code');
        foreach ($orders as $code) {
            if (preg_match('/(\d+)/', $code, $matches)) {
                $val = (int) $matches[1];
                if ($val > $maxNum && $val < 10000) {
                    $maxNum = $val;
                }
            }
        }

        // Baseline sequence to at least 27 so next order created is 28
        $targetMax = max($maxNum, 27);
        $currentSeqCount = DB::table('order_sequences')->count();
        if ($currentSeqCount < $targetMax) {
            $insertData = [];
            for ($i = $currentSeqCount + 1; $i <= $targetMax; $i++) {
                $insertData[] = ['id' => $i];
            }
            DB::table('order_sequences')->insert($insertData);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('order_sequences');
    }
};

