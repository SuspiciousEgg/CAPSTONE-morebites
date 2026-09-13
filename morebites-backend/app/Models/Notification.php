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
        $isCompleted = $order->status === 'Completed';
        $isDispatch = in_array($order->status, ['Out for Delivery', 'Ready'], true);
        $tab = $isDispatch ? 'Dispatch' : 'Orders';
        $type = $explicitType ?: ($isCompleted ? 'order_completed' : ($isDispatch ? 'dispatch' : 'order_new'));

        // Normalize order code so it always has exactly one leading '#'
        $rawCode = (string) $order->order_code;
        $code = str_starts_with($rawCode, '#') ? $rawCode : '#'.$rawCode;

        $title = $isCompleted
            ? "Order {$code} completed"
            : ($isDispatch ? "Order {$code} out for delivery" : "New order {$code} received");
        $message = $isCompleted
            ? "The order for {$order->customer_name} has been completed."
            : ($isDispatch ? "Delivery is in progress for {$order->customer_name}." : "A new order has been placed by {$order->customer_name}.");

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

        $customerUserId = $order->customer?->user_id;
        if (! $customerUserId && $order->customer_id) {
            $customerUserId = Customer::query()->where('id', $order->customer_id)->value('user_id');
        }

        if ($customerUserId) {
            $custMessage = match ($order->status) {
                'Out for Delivery' => "Order {$code} is out for delivery. Track your rider live.",
                'Preparing' => "Order {$code} is now being prepared by the kitchen.",
                'Assigned' => "Order {$code} has been assigned to a delivery rider.",
                'Delivered', 'Completed' => "Order {$code} has been delivered. Enjoy your meal!",
                'Cancelled' => "Order {$code} has been cancelled.",
                default => "Order {$code} confirmed. Your order is being processed",
            };

            $custTitle = match ($order->status) {
                'Out for Delivery' => "Order {$code} out for delivery",
                'Preparing' => "Order {$code} is being prepared",
                'Assigned' => "Order {$code} assigned",
                'Delivered', 'Completed' => "Order {$code} delivered",
                'Cancelled' => "Order {$code} cancelled",
                default => "Order {$code} confirmed",
            };

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
