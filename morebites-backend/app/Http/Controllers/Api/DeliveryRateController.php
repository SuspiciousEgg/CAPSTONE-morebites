<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DeliveryRate;
use App\Services\DeliveryRateService;
use Illuminate\Http\Request;

class DeliveryRateController extends Controller
{
    public function index()
    {
        DeliveryRate::syncFixedTiers();

        $rates = DeliveryRate::query()
            ->orderBy('sort_order')
            ->orderBy('min_km')
            ->get()
            ->map(fn (DeliveryRate $r) => $this->transform($r));

        return response()->json(['data' => $rates]);
    }

    public function quote(Request $request, DeliveryRateService $rates)
    {
        $data = $request->validate([
            'km' => ['nullable', 'numeric', 'min:0'],
            'address' => ['nullable', 'string', 'max:500'],
        ]);

        if (! empty($data['address'])) {
            return response()->json([
                'data' => $rates->quoteForAddress($data['address']),
            ]);
        }

        return response()->json([
            'data' => $rates->quote(isset($data['km']) ? (float) $data['km'] : null),
        ]);
    }

    public function store(Request $request)
    {
        $this->ensureAdmin($request);
        abort(403, 'Delivery distance tiers are fixed and cannot be added.');
    }

    public function update(Request $request, DeliveryRate $deliveryRate)
    {
        $this->ensureAdmin($request);
        $data = $request->validate([
            'fee' => ['required', 'numeric', 'min:0'],
            'active' => ['sometimes', 'boolean'],
        ]);

        $deliveryRate->update([
            'fee' => $data['fee'],
            'active' => $data['active'] ?? $deliveryRate->active,
        ]);

        return response()->json(['data' => $this->transform($deliveryRate->fresh())]);
    }

    public function destroy(Request $request, DeliveryRate $deliveryRate)
    {
        $this->ensureAdmin($request);
        abort(403, 'Delivery distance tiers are fixed and cannot be deleted.');
    }

    private function ensureAdmin(Request $request): void
    {
        $user = $request->user();
        abort_unless($user && in_array($user->role, ['super_admin', 'admin'], true), 403);
    }

    private function transform(DeliveryRate $r): array
    {
        return [
            'id' => $r->id,
            'min_km' => (float) $r->min_km,
            'max_km' => $r->max_km !== null ? (float) $r->max_km : null,
            'fee' => (float) $r->fee,
            'active' => (bool) $r->active,
            'sort_order' => (int) $r->sort_order,
            'label' => $r->label(),
            'fee_label' => '₱'.number_format((float) $r->fee, 2),
        ];
    }
}
