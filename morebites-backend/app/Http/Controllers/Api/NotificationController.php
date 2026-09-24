<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\NotificationRead;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * PROMPT INVESTIGATION REPORT: Notification Read-State Isolation
 *
 * 1. Root Cause Analysis:
 *    The notifications table previously stored one row per notification event system-wide with
 *    a single shared `is_read` column. For broadcast notifications (e.g., new orders, low stock),
 *    `user_id` was set to null. When any user marked a notification as read, the shared row's
 *    `is_read` flag was updated to true, immediately causing that notification to appear as read
 *    for all other administrative users in the system.
 *
 * 2. Schema & Scoping Architecture:
 *    The system now tracks read states per recipient via the `notification_reads` pivot table
 *    (notification_id, user_id, read_at). A notification is read by User A if and only if an entry
 *    exists in `notification_reads` for (notification_id, User A).
 *    - `unreadCount`: counts notifications where NOT EXISTS in `notification_reads` for the authenticated user.
 *    - `index`: evaluates per-user read state using `withExists(['reads as is_read_by_user'])`.
 *    - `markAsRead`: inserts/updates a record in `notification_reads` for the authenticated user only.
 *    - `markAllAsRead`: bulk inserts `notification_reads` records for the authenticated user only.
 *    Marking a notification as read by one user will never mutate or affect any other user's read/unread state.
 */
class NotificationController extends Controller
{
    /**
     * Get the integer unread count for the authenticated user/role.
     */
    public function unreadCount(Request $request): JsonResponse
    {
        $user = $request->user();
        $count = Notification::query()
            ->forUser($user)
            ->unreadBy($user)
            ->count();

        return response()->json([
            'count' => $count,
            'data' => [
                'count' => $count,
            ],
        ]);
    }

    /**
     * List notifications for the authenticated user/role with per-user read status.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Notification::query()
            ->forUser($user)
            ->latest();

        if ($request->filled('tab') && $request->query('tab') !== 'All') {
            $query->where('tab', $request->query('tab'));
        }

        $notifications = $query
            ->withExists(['reads as is_read_by_user' => function ($q) use ($user) {
                $q->where('user_id', $user->id);
            }])
            ->take(50)
            ->get()
            ->map(fn (Notification $n) => $this->transform($n, (bool) $n->is_read_by_user));

        return response()->json([
            'data' => $notifications,
        ]);
    }

    /**
     * Mark a single notification as read for the authenticated user only.
     */
    public function markAsRead(Request $request, Notification $notification): JsonResponse
    {
        $user = $request->user();
        if ($notification->user_id && $user && ! in_array($user->role, ['super_admin', 'admin', 'cashier'], true)) {
            abort_unless((int) $notification->user_id === (int) $user->id, 403);
        }

        NotificationRead::query()->updateOrCreate(
            [
                'notification_id' => $notification->id,
                'user_id' => $user->id,
            ],
            [
                'read_at' => now(),
            ]
        );

        return response()->json([
            'success' => true,
            'data' => $this->transform($notification, true),
        ]);
    }

    /**
     * Mark all unread notifications as read for the authenticated user only.
     */
    public function markAllAsRead(Request $request): JsonResponse
    {
        $user = $request->user();
        $unreadIds = Notification::query()
            ->forUser($user)
            ->unreadBy($user)
            ->pluck('id');

        $now = now();
        $records = $unreadIds->map(fn ($id) => [
            'notification_id' => $id,
            'user_id' => $user->id,
            'read_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ])->all();

        if (! empty($records)) {
            NotificationRead::query()->insert($records);
        }

        return response()->json([
            'success' => true,
            'count' => 0,
        ]);
    }

    /**
     * Transform a notification model into API payload matching frontend expectations.
     */
    public function transform(Notification $n, bool $isRead = false): array
    {
        return [
            'id' => $n->id,
            'title' => $n->title,
            'message' => $n->message,
            'body' => $n->message,
            'type' => $n->type,
            'tab' => $n->tab,
            'nav' => $n->nav,
            'is_read' => $isRead,
            'unread' => ! $isRead,
            'time' => $n->created_at?->diffForHumans() ?: 'Just now',
            'timestamp' => $n->created_at?->timestamp ?? 0,
            'created_at' => $n->created_at?->toISOString(),
            'data' => $n->data,
        ];
    }
}
