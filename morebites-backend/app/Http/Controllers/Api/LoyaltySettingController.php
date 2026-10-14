<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LoyaltyLedger;
use App\Models\LoyaltySetting;
use Illuminate\Http\Request;

class LoyaltySettingController extends Controller
{
    /**
     * Owner-only: get full loyalty settings.
     */
    public function show(Request $request)
    {
        $this->ensureSuperAdmin($request);

        $setting = LoyaltySetting::current();
        $setting->load('updatedBy');

        return response()->json([
            'data' => $this->transform($setting),
        ]);
    }

    /**
     * Owner-only: update loyalty settings.
     */
    public function update(Request $request)
    {
        $this->ensureSuperAdmin($request);

        $data = $request->validate([
            'spend_per_point' => ['required', 'numeric', 'gt:0'],
            'peso_value_per_point' => ['required', 'numeric', 'gt:0'],
            'minimum_points_to_redeem' => ['required', 'integer', 'min:1'],
            'points_expiry_days' => ['required', 'integer', 'min:0', 'max:365'],
            'enabled' => ['required', 'boolean'],
        ]);

        $setting = LoyaltySetting::current();
        $setting->update([
            'spend_per_point' => $data['spend_per_point'],
            'peso_value_per_point' => $data['peso_value_per_point'],
            'minimum_points_to_redeem' => $data['minimum_points_to_redeem'],
            'points_expiry_days' => $data['points_expiry_days'],
            'enabled' => (bool) $data['enabled'],
            'updated_by' => $request->user()->id,
        ]);

        $setting->load('updatedBy');

        return response()->json([
            'message' => 'Loyalty program settings updated successfully.',
            'data' => $this->transform($setting),
        ]);
    }

    /**
     * Owner-only: view paginated loyalty ledger history.
     */
    public function history(Request $request)
    {
        $this->ensureSuperAdmin($request);

        $query = LoyaltyLedger::query()
            ->with(['customer', 'order'])
            ->latest('id');

        if ($type = $request->query('type')) {
            $normType = strtolower(trim($type));
            if ($normType !== 'all' && in_array($normType, ['earn', 'redeem', 'refund', 'expire'])) {
                $query->where('type', $normType);
            }
        }

        if ($search = trim((string) $request->query('search', ''))) {
            $query->whereHas('customer', function ($q) use ($search) {
                $q->where('full_name', 'like', "%{$search}%")
                    ->orWhere('customer_code', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        $perPage = max(1, min(50, (int) $request->query('per_page', 5)));
        $paginated = $query->paginate($perPage);

        $items = collect($paginated->items())->map(function (LoyaltyLedger $l) {
            $customerName = $l->customer?->full_name ?? 'Unknown Customer';
            $customerCode = $l->customer?->customer_code ?? '—';
            $orderCode = $l->order?->order_code ?? ($l->order_id ? "Order #{$l->order_id}" : '—');

            return [
                'id' => $l->id,
                'customer_id' => $l->customer_id,
                'customer_name' => $customerName,
                'customer_code' => $customerCode,
                'type' => $l->type,
                'points' => (int) $l->points,
                'signed_points' => $l->points > 0 ? '+'.$l->points : (string) $l->points,
                'balance_after' => (int) $l->balance_after,
                'order_id' => $l->order_id,
                'order_code' => $orderCode,
                'note' => $l->note,
                'date' => $l->created_at?->format('M d, Y h:i A') ?? '—',
                'created_at' => $l->created_at?->toIso8601String(),
            ];
        });

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
            ],
        ]);
    }

    /**
     * Authenticated read-only: current active rates for apps.
     */
    public function rates()
    {
        $setting = LoyaltySetting::current();

        return response()->json([
            'data' => [
                'spend_per_point' => (float) $setting->spend_per_point,
                'peso_value_per_point' => (float) $setting->peso_value_per_point,
                'minimum_points_to_redeem' => (int) $setting->minimum_points_to_redeem,
                'points_expiry_days' => (int) $setting->points_expiry_days,
                'enabled' => (bool) $setting->enabled,
                'percent_back' => $setting->percentBack(),
            ],
        ]);
    }

    private function ensureSuperAdmin(Request $request): void
    {
        $user = $request->user();
        abort_unless($user && $user->role === 'super_admin', 403, 'Only the Owner can configure loyalty settings.');
    }

    private function transform(LoyaltySetting $s): array
    {
        return [
            'id' => $s->id,
            'spend_per_point' => (float) $s->spend_per_point,
            'peso_value_per_point' => (float) $s->peso_value_per_point,
            'minimum_points_to_redeem' => (int) $s->minimum_points_to_redeem,
            'points_expiry_days' => (int) $s->points_expiry_days,
            'enabled' => (bool) $s->enabled,
            'percent_back' => $s->percentBack(),
            'updated_by' => $s->updated_by,
            'updated_by_name' => $s->updatedBy?->name ?? 'System',
            'created_at' => $s->created_at?->toIso8601String(),
            'updated_at' => $s->updated_at?->toIso8601String(),
        ];
    }
}

