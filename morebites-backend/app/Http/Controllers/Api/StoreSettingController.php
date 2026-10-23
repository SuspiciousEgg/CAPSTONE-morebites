<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\StoreSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StoreSettingController extends Controller
{
    /**
     * Get the current store/kitchen preparation settings.
     */
    public function show(): JsonResponse
    {
        $setting = StoreSetting::current();
        $setting->load('updatedBy:id,name,role');

        return response()->json([
            'data' => [
                'min_prep_time' => $setting->min_prep_time,
                'max_prep_time' => $setting->max_prep_time,
                'prep_time_label' => $setting->formattedLabel(),
                'prep_estimate_text' => $setting->estimateText(),
                'updated_by' => $setting->updatedBy?->name,
                'updated_at' => $setting->updated_at?->toIso8601String(),
            ],
        ]);
    }

    /**
     * Owner-only: update the kitchen preparation time settings.
     */
    public function update(Request $request): JsonResponse
    {
        $this->ensureSuperAdmin($request);

        $validated = $request->validate([
            'min_prep_time' => ['required', 'integer', 'min:1', 'max:180'],
            'max_prep_time' => ['required', 'integer', 'min:1', 'max:180', 'gte:min_prep_time'],
        ], [
            'max_prep_time.gte' => 'The maximum preparation time must be greater than or equal to the minimum preparation time.',
            'min_prep_time.min' => 'Minimum preparation time must be at least 1 minute.',
            'max_prep_time.max' => 'Maximum preparation time cannot exceed 180 minutes.',
        ]);

        $setting = StoreSetting::current();
        $setting->update([
            'min_prep_time' => (int) $validated['min_prep_time'],
            'max_prep_time' => (int) $validated['max_prep_time'],
            'updated_by' => $request->user()?->id,
        ]);

        $actor = $request->user()?->name ?: 'Owner';
        ActivityLog::query()->create([
            'actor' => $actor,
            'action' => "Updated average preparation time to {$setting->min_prep_time}–{$setting->max_prep_time} minutes",
        ]);

        $setting->load('updatedBy:id,name,role');

        return response()->json([
            'message' => 'Average preparation time updated successfully.',
            'data' => [
                'min_prep_time' => $setting->min_prep_time,
                'max_prep_time' => $setting->max_prep_time,
                'prep_time_label' => $setting->formattedLabel(),
                'prep_estimate_text' => $setting->estimateText(),
                'updated_by' => $setting->updatedBy?->name,
                'updated_at' => $setting->updated_at?->toIso8601String(),
            ],
        ]);
    }

    private function ensureSuperAdmin(Request $request): void
    {
        $user = $request->user();
        abort_unless(
            $user && (
                in_array($user->role, ['super_admin', 'owner'], true) ||
                $user->hasRoleAccess('super_admin') ||
                $user->hasRoleAccess('owner')
            ),
            403,
            'Unauthorized. Only the Owner can configure store settings.'
        );
    }
}

