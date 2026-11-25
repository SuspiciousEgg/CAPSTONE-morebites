<?php

namespace App\Services;

use App\Models\Order;
use App\Support\Media;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class TrackingService
{
    public function storePoint(): array
    {
        return [
            'latitude' => (float) config('services.maps.store_lat', 7.610688),
            'longitude' => (float) config('services.maps.store_lng', 125.005047),
        ];
    }

    public function ensureDestination(Order $order): Order
    {
        if ($order->dest_lat && $order->dest_lng) {
            return $order;
        }

        $point = $this->geocode($order->delivery_address ?: 'Dangcagan, Bukidnon');
        $order->update([
            'dest_lat' => $point['latitude'],
            'dest_lng' => $point['longitude'],
        ]);

        return $order->fresh();
    }

    public function ensureRoute(Order $order, ?array $from = null): Order
    {
        $order = $this->ensureDestination($order);
        $storeOrigin = $this->storePoint();
        $from ??= $this->riderPoint($order) ?? $storeOrigin;
        $to = [
            'latitude' => (float) $order->dest_lat,
            'longitude' => (float) $order->dest_lng,
        ];

        $route = $this->directions($from, $to);
        $storeDistanceKm = $this->haversineKm($storeOrigin, $to);
        $etaMins = max(8, (int) round($storeDistanceKm * 4));
        $order->update([
            'route_coordinates' => $route['coordinates'],
            'delivery_distance_km' => $storeDistanceKm,
            'delivery_minutes' => $etaMins,
            'estimated_delivery_minutes' => $order->estimated_delivery_minutes ?: $etaMins,
        ]);

        return $order->fresh();
    }

    public function updateLivePosition(Order $order, float $lat, float $lng): Order
    {
        $order = $this->ensureDestination($order);
        $storeOrigin = $this->storePoint();
        $dest = ['latitude' => (float) $order->dest_lat, 'longitude' => (float) $order->dest_lng];

        $distanceKm = $this->haversineKm($storeOrigin, $dest);
        $etaMins = max(8, (int) round($distanceKm * 4));

        $hasRealRoute = is_array($order->route_coordinates) && count($order->route_coordinates) > 2;

        $updates = [
            'current_lat' => $lat,
            'current_lng' => $lng,
            'delivery_distance_km' => $distanceKm,
            'delivery_minutes' => $etaMins,
            'estimated_delivery_minutes' => $order->estimated_delivery_minutes ?: $etaMins,
        ];

        if (! $hasRealRoute && (
            ! is_array($order->route_coordinates)
            || count($order->route_coordinates) < 2
            || Cache::add('tracking_route_retry:'.$order->id, true, 20)
        )) {
            $route = $this->directions($storeOrigin, $dest);
            if (count($route['coordinates']) > 2 || ! is_array($order->route_coordinates) || count($order->route_coordinates) < 2) {
                $updates['route_coordinates'] = $route['coordinates'];
            }
        }

        $order->update($updates);

        return $order->fresh();
    }

    public function geocode(?string $address): array
    {
        $fallback = $this->storePoint();
        $query = trim((string) $address);
        if ($query === '') {
            return $fallback;
        }

        // 1. Try full address query
        $coords = $this->nominatimLookup($query);
        if ($coords !== null) {
            return $coords;
        }

        // 2. Progressive fallback: split by commas and retry sub-components
        $parts = array_values(array_filter(array_map('trim', explode(',', $query))));
        $count = count($parts);

        // If 3 or more components (e.g. Street/Purok, Barangay, City, Landmark)
        if ($count >= 3) {
            // Try middle components (e.g. Barangay, City) without first (street) and last (landmark)
            $sub = implode(', ', array_slice($parts, 1, $count - 2));
            if (($coords = $this->nominatimLookup($sub)) !== null) {
                return $coords;
            }

            // Try without first part (e.g. Barangay, City, Province)
            $sub = implode(', ', array_slice($parts, 1));
            if (($coords = $this->nominatimLookup($sub)) !== null) {
                return $coords;
            }
        }

        // Try individual components in reverse order (typically city, then barangay)
        if ($count >= 2) {
            for ($i = $count - 1; $i >= 0; $i--) {
                $candidate = $parts[$i];
                if (strcasecmp($candidate, 'philippines') === 0) {
                    continue;
                }
                // Skip obvious landmark prefixes
                if (preg_match('/^(near|beside|in front|opposite|behind|across)/i', $candidate)) {
                    continue;
                }
                if (($coords = $this->nominatimLookup($candidate)) !== null) {
                    return $coords;
                }
            }
        }

        // 3. Offline / SSL-failure fallback for known Philippine & Bukidnon/Mindanao locations
        if (($known = $this->knownPlaceLookup($query)) !== null) {
            return $known;
        }

        return $this->deterministicOffset($query, $fallback);
    }

    private function knownPlaceLookup(string $query): ?array
    {
        $normalized = strtolower(trim(preg_replace('/\s+/', ' ', $query)));
        if ($normalized === '') {
            return null;
        }

        // Known cities & municipalities (more specific names checked first)
        $places = [
            'cagayan de oro' => ['latitude' => 8.4542, 'longitude' => 124.6319],
            'cdo' => ['latitude' => 8.4542, 'longitude' => 124.6319],
            'davao' => ['latitude' => 7.1907, 'longitude' => 125.4553],
            'iligan' => ['latitude' => 8.2280, 'longitude' => 124.2452],
            'cebu' => ['latitude' => 10.3157, 'longitude' => 123.8854],
            'manila' => ['latitude' => 14.5995, 'longitude' => 120.9842],
            'quezon city' => ['latitude' => 14.6760, 'longitude' => 121.0437],
            'caloocan' => ['latitude' => 14.6488, 'longitude' => 120.9840],
            'general santos' => ['latitude' => 6.1164, 'longitude' => 125.1716],
            'butuan' => ['latitude' => 8.9475, 'longitude' => 125.5406],
            'zamboanga' => ['latitude' => 6.9214, 'longitude' => 122.0790],
            'tagum' => ['latitude' => 7.4479, 'longitude' => 125.8078],
            'cotabato' => ['latitude' => 7.2236, 'longitude' => 124.2464],
            'malaybalay' => ['latitude' => 8.1575, 'longitude' => 125.1278],
            'valencia' => ['latitude' => 7.9064, 'longitude' => 125.0942],
            'maramag' => ['latitude' => 7.7628, 'longitude' => 125.0047],
            'don carlos' => ['latitude' => 7.6844, 'longitude' => 124.9969],
            'quezon, bukidnon' => ['latitude' => 7.7306, 'longitude' => 125.0989],
            'pangantucan' => ['latitude' => 7.8358, 'longitude' => 124.8325],
            'kibawe' => ['latitude' => 7.5686, 'longitude' => 124.9878],
            'damulog' => ['latitude' => 7.4822, 'longitude' => 124.9394],
            'kitaotao' => ['latitude' => 7.6400, 'longitude' => 125.0122],
            'dangcagan' => ['latitude' => 7.610688, 'longitude' => 125.005047],
        ];

        foreach ($places as $needle => $coords) {
            if (preg_match('/\b'.preg_quote($needle, '/').'\b/i', $normalized)) {
                return $coords;
            }
        }

        return null;
    }

    private function resilientGet(string $url, array $query = [], int $timeout = 8, array $headers = [])
    {
        $defaultHeaders = array_merge([
            'User-Agent' => 'MoreBitesCapstone/1.0 (delivery tracking)',
            'Accept' => 'application/json',
        ], $headers);

        try {
            return Http::timeout($timeout)->withHeaders($defaultHeaders)->get($url, $query);
        } catch (\Throwable $e) {
            $msg = $e->getMessage();
            if (
                stripos($msg, 'cURL error 60') !== false
                || stripos($msg, 'SSL certificate') !== false
                || stripos($msg, 'unable to get local issuer certificate') !== false
            ) {
                return Http::withoutVerifying()->timeout($timeout)->withHeaders($defaultHeaders)->get($url, $query);
            }

            throw $e;
        }
    }

    public function nominatimLookup(string $query): ?array
    {
        $clean = trim($query);
        if ($clean === '') {
            return null;
        }

        $searchQuery = str_ends_with(strtolower($clean), 'philippines')
            ? $clean
            : $clean.', Philippines';

        try {
            $response = $this->resilientGet('https://nominatim.openstreetmap.org/search', [
                'q' => $searchQuery,
                'format' => 'json',
                'limit' => 1,
                'countrycodes' => 'ph',
            ], 6);

            if ($response->successful()) {
                $hit = $response->json('0');
                if (is_array($hit) && isset($hit['lat'], $hit['lon'])) {
                    return [
                        'latitude' => (float) $hit['lat'],
                        'longitude' => (float) $hit['lon'],
                    ];
                }
            }
        } catch (\Throwable $e) {
            Log::warning('Nominatim geocode failed for "'.$searchQuery.'": '.$e->getMessage());
        }

        return null;
    }


    public function directions(array $from, array $to): array
    {
        $fallbackCoords = [$from, $to];
        $haversine = $this->haversineKm($from, $to);

        $path = sprintf(
            '%s,%s;%s,%s',
            $from['longitude'],
            $from['latitude'],
            $to['longitude'],
            $to['latitude']
        );

        $endpoints = [
            'https://router.project-osrm.org/route/v1/driving/'.$path,
            'https://routing.openstreetmap.de/routed-car/route/v1/driving/'.$path,
        ];

        foreach ($endpoints as $endpoint) {
            try {
                $response = $this->resilientGet($endpoint, [
                    'overview' => 'full',
                    'geometries' => 'geojson',
                ], 8);

                if ($response->successful() && ($response->json('code') === 'Ok')) {
                    $route = $response->json('routes.0');
                    $line = $route['geometry']['coordinates'] ?? [];
                    if (is_array($line) && count($line) >= 2) {
                        $coordinates = array_map(
                            fn ($c) => ['longitude' => (float) $c[0], 'latitude' => (float) $c[1]],
                            $line
                        );

                        return [
                            'coordinates' => $coordinates,
                            'distance_km' => round(((float) ($route['distance'] ?? 0)) / 1000, 2),
                            'eta_mins' => max(1, (int) round(((float) ($route['duration'] ?? 0)) / 60)),
                        ];
                    }
                }
            } catch (\Throwable $e) {
                Log::warning('OSRM directions failed ('.$endpoint.'): '.$e->getMessage());
            }
        }

        return [
            'coordinates' => $fallbackCoords,
            'distance_km' => $haversine,
            'eta_mins' => max(8, (int) round($haversine * 4)),
        ];
    }

    public const ACTIVE_DELIVERY_STATUSES = [
        'Assigned',
        'Picked Up',
        'Out for Delivery',
        'Out For Delivery',
    ];

    public const RIDER_ACCEPTED_STATUSES = [
        'Picked Up',
        'Out for Delivery',
        'Out For Delivery',
        'Delivered',
        'Completed',
    ];

    public function isRiderAccepted(Order $order): bool
    {
        return in_array($order->status, self::RIDER_ACCEPTED_STATUSES, true);
    }

    public function riderPoint(Order $order): ?array
    {
        if (! $this->isRiderAccepted($order)) {
            return null;
        }

        if ($order->current_lat && $order->current_lng) {
            return [
                'latitude' => (float) $order->current_lat,
                'longitude' => (float) $order->current_lng,
                'updated_at' => $order->updated_at?->toIso8601String(),
            ];
        }

        $driver = $order->relationLoaded('driver') ? $order->driver : $order->driver()->first();
        if (! $driver || ! $driver->current_lat || ! $driver->current_lng) {
            return null;
        }

        return [
            'latitude' => (float) $driver->current_lat,
            'longitude' => (float) $driver->current_lng,
            'updated_at' => $driver->location_updated_at?->toIso8601String(),
        ];
    }

    public function trackingPayload(Order $order): array
    {
        $order = $this->ensureDestination($order->loadMissing(['driver', 'items.menuItem', 'customer']));
        $destination = [
            'latitude' => (float) $order->dest_lat,
            'longitude' => (float) $order->dest_lng,
        ];
        $riderAccepted = $this->isRiderAccepted($order);
        $rider = $riderAccepted ? ($this->riderPoint($order) ?? $this->storePoint()) : null;
        $coords = [];
        $distanceKm = null;
        $etaMins = null;

        if ($riderAccepted && $rider) {
            $coords = $order->route_coordinates;
            $needsRoute = ! is_array($coords) || count($coords) < 2;
            $needsRoadUpgrade = is_array($coords)
                && count($coords) === 2
                && Cache::add('tracking_route_retry:'.$order->id, true, 20);

            if ($needsRoute || $needsRoadUpgrade) {
                $order = $this->ensureRoute($order, $rider);
                $coords = $order->route_coordinates;
            }
            $distanceKm = (float) ($order->delivery_distance_km ?: $this->haversineKm($this->storePoint(), $destination));
            $etaMins = (int) ($order->delivery_minutes ?: max(1, (int) round($distanceKm * 3.5)));
        }

        $status = match ($order->status) {
            'Completed', 'Delivered' => 'Delivered',
            'Out For Delivery', 'Out for Delivery' => 'Out for Delivery',
            default => $order->status,
        };
        $isCompleted = in_array($status, ['Delivered', 'Completed'], true);
        $deliveredAt = $order->delivered_at ?? ($isCompleted ? $order->updated_at : null);
        $rates = app(DeliveryRateService::class);
        $prepSetting = \App\Models\StoreSetting::current();
        $isPreparing = $order->status === 'Preparing';

        return [
            'order_id' => $order->order_code,
            'id' => $order->order_code,
            'db_id' => $order->id,
            'receipt_number' => $order->receiptNumber(),
            'status' => $status,
            'raw_status' => $order->status,
            'rider_accepted' => $riderAccepted,
            'is_preparing' => $isPreparing,
            'prep_time_min' => $prepSetting->min_prep_time,
            'prep_time_max' => $prepSetting->max_prep_time,
            'prep_time_label' => $prepSetting->formattedLabel(),
            'prep_estimate_text' => $prepSetting->estimateText(),
            'date' => $order->created_at?->toIso8601String(),
            'dateLabel' => \App\Support\ManilaTime::format($order->created_at, 'M j, Y · g:i A'),
            'ordered_at' => $order->created_at?->toIso8601String(),
            'ordered_at_label' => \App\Support\ManilaTime::format($order->created_at, 'M j, Y · g:i A'),
            'customer' => $order->customer_name,
            'address' => $order->delivery_address,
            'driver' => $order->driver?->name,
            'driver_phone' => $order->driver?->phone,
            'driver_photo' => $order->driver?->photo ? Media::url($order->driver->photo) : null,
            'rider_photo' => $order->driver?->photo ? Media::url($order->driver->photo) : null,
            'reported_issues' => $order->reportedIssues(),
            'eta_mins' => $etaMins,
            'distance_km' => $distanceKm !== null ? round($distanceKm, 2) : null,
            'distance_label' => $distanceKm !== null ? number_format($distanceKm, 1).' km' : null,
            'arrival_by' => $etaMins ? \App\Support\ManilaTime::now()->addMinutes($etaMins)->format('g:i A') : null,
            'store' => $this->storePoint(),
            'destination' => $destination,
            'rider' => $rider,
            'route' => ($riderAccepted && is_array($coords)) ? array_values($coords) : [],
            'updated_at' => $order->updated_at?->toIso8601String(),
            'timeline' => $this->timeline($order),
            'items' => $order->items->map(fn ($i) => [
                'id' => (string) $i->id,
                'name' => $i->name,
                'size' => $i->size,
                'quantity' => (int) $i->qty,
                'price' => (float) $i->unit_price,
                'line_total' => (float) ($i->line_total ?? ((float) $i->unit_price * (int) $i->qty)),
                'removed_ingredients' => $i->removed_ingredients ?? [],
                'special_instructions' => $i->special_instructions ?? null,
                'image' => $i->menuItem?->image ? Media::url($i->menuItem->image) : null,
            ])->values(),
            'food_name' => $order->items->first()?->name ?: 'Your order',
            'food_price' => (float) ($order->items->first()?->unit_price ?? $order->total),
            'food_image' => $order->items->first()?->menuItem?->image ? Media::url($order->items->first()->menuItem->image) : null,
            'total' => (float) $order->total,
            'delivery_fee' => (float) ($order->delivery_fee ?? $rates->defaultFee()),
            'service_fee' => (float) ($order->service_fee ?? $rates->serviceFee()),
            'payment_method' => $order->payment_method ?: 'COD',
            'payment_status' => $isCompleted ? 'Paid' : ($order->payment_status ?: 'Unpaid'),
            'rated' => (bool) $order->rated_at,
            'can_rate' => $isCompleted && ! $order->rated_at,
            'proof_of_delivery' => Media::url($order->proof_of_delivery),
            'delivered_at' => $deliveredAt?->toIso8601String(),
            'delivered_at_label' => \App\Support\ManilaTime::format($deliveredAt, 'M j, Y · g:i A'),
            'payment_confirmed_at' => $deliveredAt?->toIso8601String(),
            'payment_confirmed_at_label' => \App\Support\ManilaTime::format($deliveredAt, 'M j, Y · g:i A'),
            'points_used' => (int) ($order->points_used ?? 0),
            'points_discount' => (float) ($order->points_discount ?? 0),
            'points_earned' => $order->loyaltyPointsEarned(),
            'estimated_delivery_minutes' => (int) ($order->estimated_delivery_minutes ?: $order->delivery_minutes ?: 0),
            'late_minutes' => (int) ($order->late_minutes ?? 0),
            'late_discount_percent' => (int) ($order->late_discount_percent ?? 0),
            'late_discount' => (float) ($order->late_discount ?? 0),
        ];
    }

    /**
     * Unified active deliveries query & payload shared by both the Live Delivery Map
     * and the Delivery Status Monitoring table on the Dispatch page (Prompt 43).
     */
    public function activeDeliveriesPayload(): array
    {
        return Order::query()
            ->with(['driver', 'items.menuItem', 'customer'])
            ->whereNotNull('driver_id')
            ->where('order_type', 'Online Order')
            ->whereIn('status', self::ACTIVE_DELIVERY_STATUSES)
            ->latest('updated_at')
            ->take(20)
            ->get()
            ->map(function (Order $order) {
                $payload = $this->trackingPayload($order);
                $normalizedStatus = match ($order->status) {
                    'Picked Up' => 'Picked Up',
                    'Assigned' => 'Assigned',
                    default => 'Out for Delivery',
                };

                return [
                    'id' => $order->order_code,
                    'order_id' => $payload['order_id'],
                    'db_id' => $payload['db_id'],
                    'order_type' => $order->order_type ?: 'Online Order',
                    'type' => $order->order_type ?: 'Online Order',
                    'status' => $normalizedStatus,
                    'raw_status' => $order->status,
                    'name' => $order->driver?->name ?? 'Unknown',
                    'driver' => $payload['driver'] ?? ($order->driver?->name ?? 'Unknown'),
                    'phone' => $order->driver?->phone ?: '+63 912 345 6789',
                    'driver_photo' => $order->driver?->photo ? Media::url($order->driver->photo) : null,
                    'rider_photo' => $order->driver?->photo ? Media::url($order->driver->photo) : null,
                    'reported_issues' => $order->reportedIssues(),
                    'customer' => $payload['customer'],
                    'customer_phone' => $order->customer?->phone ?: '',
                    'address' => $order->delivery_address ?: 'N/A',
                    'total' => (float) $order->total,
                    'payment_method' => $order->payment_method ?: 'COD',
                    'items' => $order->items->map(fn ($i) => $i->qty.'x '.$i->name)->implode(', '),
                    'updated' => \App\Support\ManilaTime::format($order->updated_at, 'g:i A'),
                    'updated_time' => \App\Support\ManilaTime::format($order->updated_at, 'g:i A'),
                    'updated_date' => \App\Support\ManilaTime::format($order->updated_at, 'M d, Y'),
                    'updated_at' => $payload['updated_at'],
                    'assigned_at' => \App\Support\ManilaTime::format($order->assigned_at, 'M d, Y g:i A'),
                    'store' => $payload['store'],
                    'destination' => $payload['destination'],
                    'rider' => $payload['rider'],
                    'route' => $payload['route'],
                    'dest_lat' => isset($payload['destination']['latitude']) ? (float) $payload['destination']['latitude'] : null,
                    'dest_lng' => isset($payload['destination']['longitude']) ? (float) $payload['destination']['longitude'] : null,
                    'rider_lat' => isset($payload['rider']['latitude']) ? (float) $payload['rider']['latitude'] : null,
                    'rider_lng' => isset($payload['rider']['longitude']) ? (float) $payload['rider']['longitude'] : null,
                    'eta_mins' => $payload['eta_mins'],
                    'distance_km' => $payload['distance_km'],
                ];
            })
            ->values()
            ->all();
    }

    public function fleetPayload(): array
    {
        $deliveries = $this->activeDeliveriesPayload();

        return [
            'deliveries' => $deliveries,
            'monitoring' => $deliveries,
            'store' => $this->storePoint(),
        ];
    }

    private function timeline(Order $order): array
    {
        $status = $order->status === 'Completed' ? 'Delivered' : $order->status;
        $prepSetting = \App\Models\StoreSetting::current();
        $prepLabel = $prepSetting->formattedLabel();
        $steps = [
            ['key' => 'Confirmed', 'title' => 'Order Confirmed', 'description' => 'Your order has been received', 'icon' => 'checkmark'],
            ['key' => 'Preparing', 'title' => 'Preparing', 'description' => "Your food is being prepared · ready in {$prepLabel} (est.)", 'icon' => 'checkmark'],
            ['key' => 'Out for Delivery', 'title' => 'Out For Delivery', 'description' => 'Your order is on the way', 'icon' => 'bicycle'],
            ['key' => 'Delivered', 'title' => 'Delivered', 'description' => $status === 'Delivered' ? 'Your order has been delivered' : 'Order will be delivered soon', 'icon' => 'home-outline'],
        ];

        $stepStates = match ($status) {
            'Pending' => ['pending', 'pending', 'pending', 'pending'],
            'Confirmed' => ['complete', 'pending', 'pending', 'pending'],
            'Preparing' => ['complete', 'active', 'pending', 'pending'],
            'Ready', 'Assigned' => ['complete', 'complete', 'pending', 'pending'],
            'Picked Up', 'Out for Delivery', 'Out For Delivery' => ['complete', 'complete', 'active', 'pending'],
            'Delivered', 'Completed' => ['complete', 'complete', 'complete', 'complete'],
            default => ['pending', 'pending', 'pending', 'pending'],
        };

        return array_map(function ($step, $index) use ($stepStates, $order) {
            $state = $stepStates[$index] ?? 'pending';
            $timestamp = null;
            if ($state !== 'pending') {
                if ($index === 0 && $order->created_at) {
                    $timestamp = \App\Support\ManilaTime::format($order->created_at, 'g:i A');
                } elseif ($index === 2) {
                    $timeSource = $order->updated_at ?? $order->assigned_at;
                    $timestamp = \App\Support\ManilaTime::format($timeSource, 'g:i A');
                } elseif ($index === 3) {
                    $timeSource = $order->delivered_at ?? $order->updated_at;
                    $timestamp = \App\Support\ManilaTime::format($timeSource, 'g:i A');
                }
            }

            return [...$step, 'state' => $state, 'timestamp' => $timestamp];
        }, $steps, array_keys($steps));
    }

    private function deterministicOffset(string $query, array $base): array
    {
        $hash = crc32(strtolower($query));
        $latOffset = (($hash % 200) - 100) / 10000;
        $lngOffset = ((((int) ($hash / 200)) % 200) - 100) / 10000;

        return [
            'latitude' => $base['latitude'] + $latOffset,
            'longitude' => $base['longitude'] + $lngOffset,
        ];
    }

    public function distanceKm(array $from, array $to): float
    {
        return $this->haversineKm($from, $to);
    }

    public function haversineKm(array $from, array $to): float
    {
        $earth = 6371;
        $dLat = deg2rad($to['latitude'] - $from['latitude']);
        $dLng = deg2rad($to['longitude'] - $from['longitude']);
        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($from['latitude'])) * cos(deg2rad($to['latitude'])) * sin($dLng / 2) ** 2;

        return round(2 * $earth * asin(min(1, sqrt($a))), 2);
    }
}
