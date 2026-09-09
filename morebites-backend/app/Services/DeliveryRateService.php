<?php

namespace App\Services;

use App\Models\DeliveryRate;

class DeliveryRateService
{
    public function serviceFee(): float
    {
        return (float) config('services.fees.service_fee', 20);
    }

    public function defaultFee(): float
    {
        return (float) config('services.fees.default_delivery_fee', 40);
    }

    public function feeForKm(?float $km): float
    {
        $tier = $this->tierForKm($km);

        return $tier ? (float) $tier->fee : $this->defaultFee();
    }

    public function quote(?float $km): array
    {
        $distance = $km !== null ? round(max(0, $km), 2) : null;
        $tier = $this->tierForKm($distance);
        $delivery = $tier ? (float) $tier->fee : $this->defaultFee();
        $service = $this->serviceFee();
        $peso = fn (float $n) => '₱'.number_format($n, 2);

        $steps = [];
        if ($distance === null) {
            $steps[] = 'Distance is not known yet, so the default delivery fee is used.';
            $steps[] = 'Default delivery fee = '.$peso($this->defaultFee());
        } else {
            $steps[] = 'Distance from store to address = '.$distance.' km';
            if ($tier) {
                $steps[] = 'This falls in the '.$tier->label().' tier';
                $steps[] = 'Delivery fee for that tier = '.$peso((float) $tier->fee);
            } else {
                $steps[] = 'No matching rate tier, so the default fee applies';
                $steps[] = 'Default delivery fee = '.$peso($this->defaultFee());
            }
        }
        $steps[] = 'Service fee = '.$peso($service);
        $steps[] = 'Total fees = '.$peso($delivery).' + '.$peso($service).' = '.$peso($delivery + $service);

        return [
            'distance_km' => $distance,
            'delivery_fee' => $delivery,
            'service_fee' => $service,
            'fees_total' => $delivery + $service,
            'tier_label' => $tier?->label(),
            'formula' => $distance === null
                ? 'Default fee (no distance) + service fee'
                : $distance.' km → '.($tier?->label() ?: 'default').' = '.$peso($delivery),
            'calculation' => $steps,
        ];
    }

    public function quoteForAddress(string $address): array
    {
        $tracking = app(TrackingService::class);
        $dest = $tracking->geocode($address);
        $km = $tracking->haversineKm($tracking->storePoint(), $dest);
        $quote = $this->quote($km);
        $quote['address'] = $address;

        return $quote;
    }

    public function tierLabelForKm(?float $km): ?string
    {
        return $this->tierForKm($km)?->label();
    }

    private function tierForKm(?float $km): ?DeliveryRate
    {
        if ($km === null || $km < 0) {
            return null;
        }

        return DeliveryRate::query()
            ->where('active', true)
            ->where('min_km', '<=', $km)
            ->where(function ($q) use ($km) {
                $q->whereNull('max_km')->orWhere('max_km', '>=', $km);
            })
            ->orderByDesc('min_km')
            ->first();
    }
}
