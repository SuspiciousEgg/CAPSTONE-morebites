<?php

namespace App\Events;

use App\Models\Notification;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Event broadcast when a new notification is created.
 *
 * NOTE: Real-time broadcasting requires Laravel Reverb and Laravel Echo to be installed and configured.
 * Currently, Reverb and Echo are NOT installed in this project.
 * To enable real-time websocket broadcasting:
 * 1. Backend: composer require laravel/reverb
 *    php artisan reverb:install
 *    Set BROADCAST_CONNECTION=reverb in .env
 * 2. Frontend: npm install laravel-echo pusher-js
 *    Configure Echo in src/api/echo.js with VITE_REVERB_APP_KEY, VITE_REVERB_HOST, etc.
 * 3. Subscribe to the channel: Echo.private(`notifications.${userId}`) or Echo.private('admin-notifications')
 */
class NotificationCreated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Notification $notification)
    {
    }

    public function broadcastOn(): array
    {
        if ($this->notification->user_id) {
            return [
                new PrivateChannel('notifications.'.$this->notification->user_id),
            ];
        }

        return [
            new PrivateChannel('admin-notifications'),
        ];
    }

    public function broadcastWith(): array
    {
        return [
            'id' => $this->notification->id,
            'title' => $this->notification->title,
            'message' => $this->notification->message,
            'body' => $this->notification->message,
            'type' => $this->notification->type,
            'tab' => $this->notification->tab,
            'nav' => $this->notification->nav,
            'is_read' => $this->notification->is_read,
            'unread' => ! $this->notification->is_read,
            'time' => $this->notification->created_at?->diffForHumans() ?: 'Just now',
            'timestamp' => $this->notification->created_at?->timestamp ?? time(),
        ];
    }
}

