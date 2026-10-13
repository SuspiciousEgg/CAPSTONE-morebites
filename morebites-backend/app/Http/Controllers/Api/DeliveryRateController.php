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
            'lat' => ['nullable', 'numeric'],
            'latitude' => ['nullable', 'numeric'],
            'lng' => ['nullable', 'numeric'],
            'longitude' => ['nullable', 'numeric'],
        ]);

        $lat = $data['lat'] ?? $data['latitude'] ?? null;
        $lng = $data['lng'] ?? $data['longitude'] ?? null;

        if ($lat !== null && $lng !== null) {
            return response()->json([
                'data' => $rates->quoteForCoordinates((float) $lat, (float) $lng, $data['address'] ?? null),
            ]);
        }

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
        $this->ensureSuperAdmin($request);
        abort(403, 'Delivery distance tiers are fixed and cannot be added.');
    }

    public function update(Request $request, DeliveryRate $deliveryRate)
    {
        $this->ensureSuperAdmin($request);
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
        $this->ensureSuperAdmin($request);
        abort(403, 'Delivery distance tiers are fixed and cannot be deleted.');
    }

    private function ensureSuperAdmin(Request $request): void
    {
        $user = $request->user();
        abort_unless($user && $user->role === 'super_admin', 403, 'Only the Owner can configure delivery settings.');
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
