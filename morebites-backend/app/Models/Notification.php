<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Notification extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'title',
        'message',
        'type',
        'tab',
        'nav',
        'is_read',
        'read_at',
        'data',
    ];

    protected function casts(): array
    {
        return [
            'is_read' => 'boolean',
            'read_at' => 'datetime',
            'data' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function reads(): HasMany
    {
        return $this->hasMany(NotificationRead::class);
    }

    public function scopeForUser($query, ?User $user = null)
    {
        if (! $user) {
            return $query->whereNull('user_id');
        }

        if (in_array($user->role, ['super_admin', 'admin', 'cashier'], true)) {
            return $query->where(function ($q) use ($user) {
                $q->whereNull('user_id')->orWhere('user_id', $user->id);
            });
        }

        return $query->where('user_id', $user->id);
    }

    public function scopeUnread($query)
    {
        return $query->where('is_read', false);
    }

    public function scopeUnreadBy($query, User $user)
    {
        return $query->whereDoesntHave('reads', function ($q) use ($user) {
            $q->where('user_id', $user->id);
        });
    }

    public function isReadBy(User $user): bool
    {
        return $this->reads()->where('user_id', $user->id)->exists();
    }

    public function markAsRead(?User $user = null): bool
    {
        if ($user) {
            NotificationRead::query()->updateOrCreate(
                [
                    'notification_id' => $this->id,
                    'user_id' => $user->id,
                ],
                [
                    'read_at' => now(),
                ]
            );

            return true;
        }

        return $this->update([
            'is_read' => true,
            'read_at' => now(),
        ]);
    }

    public static function createOrderNotification(Order $order, ?string $explicitType = null): self
    {
        // Normalize order code so it always has exactly one leading '#'
        $rawCode = (string) $order->order_code;
        $code = str_starts_with($rawCode, '#') ? $rawCode : '#'.$rawCode;

        $hasExistingAdminNotif = self::query()
            ->whereNull('user_id')
            ->where(function ($q) use ($order, $code) {
                $q->where('data->order_id', $order->id)
                    ->orWhere('data->order_id', (string) $order->id)
                    ->orWhere('data->order_code', $code);
            })
            ->exists();

        $isOnline = ($order->order_type === 'Online Order');

        // Determine Admin Title, Message, Tab, Type
        $isDispatch = $isOnline && in_array($order->status, ['Out for Delivery', 'Picked Up', 'Ready', 'Assigned'], true);
        $tab = $isDispatch ? 'Dispatch' : 'Orders';

        if ($explicitType) {
            $type = $explicitType;
        } elseif ($isDispatch) {
            $type = 'dispatch';
        } elseif ($order->status === 'Completed' || $order->status === 'Delivered') {
            $type = 'order_completed';
        } elseif ($order->status === 'Cancelled') {
            $type = 'order_cancelled';
        } elseif (! $hasExistingAdminNotif || $order->status === 'Pending') {
            $type = 'order_new';
        } else {
            $type = 'order_status';
        }

        $readyTitle = $isOnline
            ? "Order {$code} ready for delivery"
            : ($order->order_type === 'Takeout'
                ? "Order {$code} ready for pickup"
                : "Order {$code} ready to serve");

        $title = match ($order->status) {
            'Completed', 'Delivered' => "Order {$code} completed",
            'Out for Delivery', 'Picked Up' => $isOnline ? "Order {$code} out for delivery" : "Order {$code} updated",
            'Ready' => $readyTitle,
            'Assigned' => $isOnline ? "Order {$code} rider assigned" : "Order {$code} updated",
            'Cancelled' => "Order {$code} cancelled",
            'Preparing' => $hasExistingAdminNotif ? "Order {$code} is being prepared" : "New order {$code} received",
            'Pending' => "New order {$code} received",
            default => $hasExistingAdminNotif ? "Order {$code} updated" : "New order {$code} received",
        };

        $readyMessage = $isOnline
            ? "Order {$code} for {$order->customer_name} is packed and ready for dispatch."
            : ($order->order_type === 'Takeout'
                ? "Order {$code} for {$order->customer_name} is packed and ready for pickup."
                : "Order {$code} for {$order->customer_name} is prepared and ready to be served.");

        $message = match ($order->status) {
            'Completed', 'Delivered' => "The order for {$order->customer_name} has been completed.",
            'Out for Delivery', 'Picked Up' => $isOnline ? "Delivery is in progress for {$order->customer_name}." : "Order {$code} for {$order->customer_name} status updated to {$order->status}.",
            'Ready' => $readyMessage,
            'Assigned' => $isOnline ? "Order {$code} has been assigned to a delivery rider." : "Order {$code} for {$order->customer_name} status updated to {$order->status}.",
            'Cancelled' => "Order {$code} for {$order->customer_name} has been cancelled.",
            'Preparing' => $hasExistingAdminNotif ? "Order {$code} for {$order->customer_name} is now being prepared in the kitchen." : "A new order has been placed by {$order->customer_name}.",
            'Pending' => "A new order has been placed by {$order->customer_name}.",
            default => "Order {$code} for {$order->customer_name} status updated to {$order->status}.",
        };

        // Idempotency Guard for Admin Notification
        $existingAdmin = self::query()
            ->whereNull('user_id')
            ->where(function ($q) use ($order, $code) {
                $q->where('data->order_id', $order->id)
                    ->orWhere('data->order_id', (string) $order->id)
                    ->orWhere('data->order_code', $code);
            })
            ->where(function ($q) use ($order, $title) {
                $q->where('data->status', $order->status)
                    ->orWhere('title', $title);
            })
            ->latest('id')
            ->first();

        if ($existingAdmin) {
            $adminNotification = $existingAdmin;
        } else {
            $adminNotification = self::create([
                'user_id' => null,
                'title' => $title,
                'message' => $message,
                'type' => $type,
                'tab' => $tab,
                'nav' => $tab,
                'is_read' => false,
                'data' => [
                    'order_id' => $order->id,
                    'order_code' => $code,
                    'status' => $order->status,
                ],
            ]);
        }

        // Customer Notification Handling
        $customerUserId = $order->customer?->user_id;
        if (! $customerUserId && $order->customer_id) {
            $customerUserId = Customer::query()->where('id', $order->customer_id)->value('user_id');
        }

        if ($customerUserId) {
            $custTitle = match ($order->status) {
                'Out for Delivery', 'Picked Up' => $isOnline ? "Order {$code} out for delivery" : "Order {$code} updated",
                'Ready' => $isOnline ? "Order {$code} is ready" : ($order->order_type === 'Takeout' ? "Order {$code} ready for pickup" : "Order {$code} is ready"),
                'Preparing' => "Order {$code} is being prepared",
                'Assigned' => $isOnline ? "Order {$code} assigned" : "Order {$code} updated",
                'Delivered', 'Completed' => "Order {$code} delivered",
                'Cancelled' => "Order {$code} cancelled",
                'Pending' => "Order {$code} placed",
                default => "Order {$code} confirmed",
            };

            $custMessage = match ($order->status) {
                'Out for Delivery', 'Picked Up' => $isOnline ? "Order {$code} is out for delivery. Track your rider live." : "Order {$code} status updated to {$order->status}.",
                'Ready' => $isOnline
                    ? "Your order {$code} is packed and ready for delivery."
                    : ($order->order_type === 'Takeout'
                        ? "Your order {$code} is packed and ready for pickup."
                        : "Your order {$code} is ready to be served."),
                'Preparing' => "Order {$code} is now being prepared by the kitchen.",
                'Assigned' => $isOnline ? "Order {$code} has been assigned to a delivery rider." : "Order {$code} status updated to {$order->status}.",
                'Delivered', 'Completed' => "Order {$code} has been delivered. Enjoy your meal!",
                'Cancelled' => "Order {$code} has been cancelled.",
                'Pending' => "Your order {$code} has been received and is awaiting confirmation.",
                default => "Order {$code} confirmed. Your order is being processed",
            };

            // Idempotency Guard for Customer Notification
            $existingCust = self::query()
                ->where('user_id', $customerUserId)
                ->where(function ($q) use ($order, $code) {
                    $q->where('data->order_id', $order->id)
                        ->orWhere('data->order_id', (string) $order->id)
                        ->orWhere('data->order_code', $code);
                })
                ->where(function ($q) use ($order, $custTitle) {
                    $q->where('data->status', $order->status)
                        ->orWhere('title', $custTitle);
                })
                ->latest('id')
                ->first();

            if (! $existingCust) {
                self::create([
                    'user_id' => $customerUserId,
                    'title' => $custTitle,
                    'message' => $custMessage,
                    'type' => 'customer_order_status',
                    'tab' => 'Orders',
                    'nav' => 'Orders',
                    'is_read' => false,
                    'data' => [
                        'order_id' => $order->id,
                        'order_code' => $code,
                        'status' => $order->status,
                    ],
                ]);
            }
        }

        return $adminNotification;
    }

    public static function createLowStockNotification(InventoryItem $item): self
    {
        return self::create([
            'user_id' => null,
            'title' => "Low stock alert: {$item->name}",
            'message' => "Only {$item->stock} {$item->unit} remaining in stock.",
            'type' => 'low_stock',
            'tab' => 'Inventory',
            'nav' => 'Inventory',
            'is_read' => false,
            'data' => [
                'inventory_item_id' => $item->id,
                'item_name' => $item->name,
                'stock' => $item->stock,
            ],
        ]);
    }
}
