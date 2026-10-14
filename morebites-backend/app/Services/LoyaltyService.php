<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\LoyaltyLedger;
use App\Models\LoyaltySetting;
use App\Models\Order;
use Illuminate\Support\Facades\DB;

class LoyaltyService
{
    /**
     * Credit loyalty points when an Online Order reaches Completed (using customer_id)
     * or a walk-in order reaches Completed (using loyalty_customer_id).
     * Credits floor(food subtotal after any points discount ÷ spend_per_point).
     * Delivery and service fees never count.
     * Credits nothing if loyalty is disabled.
     * Walk-in orders without loyalty_customer_id earn nothing.
     */
    public function creditForOrder(Order $order): ?LoyaltyLedger
    {
        // Must be in completed/delivered status
        if (! in_array($order->status, ['Completed', 'Delivered'], true)) {
            return null;
        }

        // Online orders credit customer_id; walk-in orders credit loyalty_customer_id
        $targetCustomerId = $order->order_type === 'Online Order'
            ? $order->customer_id
            : $order->loyalty_customer_id;

        if (! $targetCustomerId) {
            return null;
        }

        $settings = LoyaltySetting::current();
        if (! $settings->enabled || (float) $settings->spend_per_point <= 0) {
            return null;
        }

        // Check if an earn entry already exists for this order (idempotent, once per order)
        $existing = LoyaltyLedger::query()
            ->where('order_id', $order->id)
            ->where('type', 'earn')
            ->first();

        if ($existing) {
            return $existing;
        }

        // Food subtotal: sum of order item line totals, or total minus delivery/service fees
        $itemTotal = (float) $order->items()->sum('line_total');
        $foodSubtotal = $itemTotal > 0
            ? $itemTotal
            : max(0, (float) $order->total - (float) ($order->delivery_fee ?? 0) - (float) ($order->service_fee ?? 0));

        $pointsDiscount = (float) ($order->points_discount ?? $order->discount ?? 0);
        $netFood = max(0, $foodSubtotal - $pointsDiscount);

        $pointsToCredit = (int) floor($netFood / (float) $settings->spend_per_point);
        if ($pointsToCredit <= 0) {
            return null;
        }

        return DB::transaction(function () use ($order, $targetCustomerId, $pointsToCredit, $settings) {
            // Re-check under lock
            $existing = LoyaltyLedger::query()
                ->where('order_id', $order->id)
                ->where('type', 'earn')
                ->first();

            if ($existing) {
                return $existing;
            }

            $customer = Customer::query()
                ->where('id', $targetCustomerId)
                ->lockForUpdate()
                ->first();

            if (! $customer) {
                return null;
            }

            // Lazy check expiry on customer before applying new balance
            $this->lazyCheckExpiry($customer);

            $newBalance = (int) $customer->loyalty_points + $pointsToCredit;
            $expiryDays = (int) $settings->points_expiry_days;
            $expiryAt = $expiryDays > 0 ? now()->addDays($expiryDays) : null;

            $customer->update([
                'loyalty_points' => $newBalance,
                'points_expire_at' => $expiryAt,
            ]);

            $note = $order->order_type === 'Online Order'
                ? "Earned from order {$order->order_code}"
                : "Earned from walk-in order {$order->order_code}";

            return LoyaltyLedger::query()->create([
                'customer_id' => $customer->id,
                'order_id' => $order->id,
                'type' => 'earn',
                'points' => $pointsToCredit,
                'balance_after' => $newBalance,
                'note' => $note,
                'created_at' => now(),
            ]);
        });
    }

    /**
     * Lazy check for points expiry on customer read/use under row lock.
     * If expired, writes one expire ledger entry that zeroes the balance.
     */
    public function lazyCheckExpiry(Customer $customer): bool
    {
        if ($customer->points_expire_at === null || now()->lessThanOrEqualTo($customer->points_expire_at)) {
            return false;
        }

        if ((int) $customer->loyalty_points <= 0) {
            return false;
        }

        return DB::transaction(function () use ($customer) {
            $locked = Customer::query()->where('id', $customer->id)->lockForUpdate()->first();
            if (! $locked) {
                return false;
            }

            if ($locked->points_expire_at === null || now()->lessThanOrEqualTo($locked->points_expire_at)) {
                return false;
            }

            $expiredPoints = (int) $locked->loyalty_points;
            if ($expiredPoints <= 0) {
                return false;
            }

            LoyaltyLedger::query()->create([
                'customer_id' => $locked->id,
                'order_id' => null,
                'type' => 'expire',
                'points' => -$expiredPoints,
                'balance_after' => 0,
                'note' => 'Points expired due to inactivity',
                'created_at' => now(),
            ]);

            $locked->update([
                'loyalty_points' => 0,
                'points_expire_at' => null,
            ]);

            $customer->loyalty_points = 0;
            $customer->points_expire_at = null;

            return true;
        });
    }

    /**
     * If staff cancel an order that used points, write one refund entry,
     * restore the points, and restart the expiry clock.
     */
    public function refundForOrder(Order $order): ?LoyaltyLedger
    {
        if ($order->order_type !== 'Online Order' || ! $order->customer_id) {
            return null;
        }

        // Idempotent: check if already refunded
        $existingRefund = LoyaltyLedger::query()
            ->where('order_id', $order->id)
            ->where('type', 'refund')
            ->first();

        if ($existingRefund) {
            return $existingRefund;
        }

        $redeemEntry = LoyaltyLedger::query()
            ->where('order_id', $order->id)
            ->where('type', 'redeem')
            ->first();

        $pointsToRefund = $redeemEntry ? abs((int) $redeemEntry->points) : (int) ($order->points_used ?? 0);
        if ($pointsToRefund <= 0) {
            return null;
        }

        return DB::transaction(function () use ($order, $pointsToRefund) {
            $customer = Customer::query()->where('id', $order->customer_id)->lockForUpdate()->first();
            if (! $customer) {
                return null;
            }

            $settings = LoyaltySetting::current();
            $newBalance = (int) $customer->loyalty_points + $pointsToRefund;
            $expiryDays = (int) $settings->points_expiry_days;
            $expiryAt = $expiryDays > 0 ? now()->addDays($expiryDays) : null;

            $customer->update([
                'loyalty_points' => $newBalance,
                'points_expire_at' => $expiryAt,
            ]);

            return LoyaltyLedger::query()->create([
                'customer_id' => $customer->id,
                'order_id' => $order->id,
                'type' => 'refund',
                'points' => $pointsToRefund,
                'balance_after' => $newBalance,
                'note' => "Refunded {$pointsToRefund} points from cancelled order {$order->order_code}",
                'created_at' => now(),
            ]);
        });
    }

    /**
     * Safe & idempotent backfill for existing completed Online Orders.
     * Creates an "opening balance" earn entry using old round(total ÷ 2).
     * Sets expiry from go-live plus setting so nobody loses points on day one.
     */
    public function backfill(): array
    {
        $settings = LoyaltySetting::current();
        $expiryDays = (int) ($settings->points_expiry_days ?? 30);
        $expiryDate = $expiryDays > 0 ? now()->addDays($expiryDays) : null;

        $orders = Order::query()
            ->where('order_type', 'Online Order')
            ->whereNotNull('customer_id')
            ->whereIn('status', ['Completed', 'Delivered'])
            ->orderBy('id')
            ->get();

        $creditedOrders = 0;

        foreach ($orders as $order) {
            $exists = LoyaltyLedger::query()
                ->where('order_id', $order->id)
                ->where('type', 'earn')
                ->exists();

            if (! $exists) {
                $points = (int) round(((float) $order->total) / 2);
                $prevBalance = (int) (LoyaltyLedger::query()
                    ->where('customer_id', $order->customer_id)
                    ->orderByDesc('id')
                    ->value('balance_after') ?? 0);

                $newBalance = $prevBalance + $points;

                LoyaltyLedger::query()->create([
                    'customer_id' => $order->customer_id,
                    'order_id' => $order->id,
                    'type' => 'earn',
                    'points' => $points,
                    'balance_after' => $newBalance,
                    'note' => "Opening balance from order {$order->order_code}",
                    'created_at' => $order->delivered_at ?? $order->updated_at ?? now(),
                ]);

                $creditedOrders++;
            }
        }

        $customers = Customer::query()->get();
        foreach ($customers as $c) {
            $lastBalance = LoyaltyLedger::query()
                ->where('customer_id', $c->id)
                ->orderByDesc('id')
                ->value('balance_after');

            $points = (int) ($lastBalance ?? 0);
            $c->update([
                'loyalty_points' => $points,
                'points_expire_at' => $points > 0 ? $expiryDate : null,
            ]);
        }

        return [
            'orders_processed' => $orders->count(),
            'orders_credited' => $creditedOrders,
            'customers_updated' => $customers->count(),
        ];
    }
}

