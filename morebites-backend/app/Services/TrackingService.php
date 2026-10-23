<?php

namespace App\Services;

use App\Models\Order;
use App\Support\Media;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class TrackingService
{
    public function storePoint(): array
    {
        return [
            'latitude' => (float) config('services.maps.store_lat', 7.6094),
            'longitude' => (float) config('services.maps.store_lng', 124.9883),
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
        $order->update([
            'route_coordinates' => $route['coordinates'],
            'delivery_distance_km' => $storeDistanceKm,
            'delivery_minutes' => max(8, (int) round($storeDistanceKm * 4)),
        ]);

        return $order->fresh();
    }

    public function updateLivePosition(Order $order, float $lat, float $lng): Order
    {
        $order = $this->ensureDestination($order);
        $storeOrigin = $this->storePoint();
        $from = ['latitude' => $lat, 'longitude' => $lng];
        if ($this->haversineKm($storeOrigin, $from) > DeliveryRateService::MAX_DELIVERY_KM) {
            $from = $storeOrigin;
        }
        $dest = ['latitude' => (float) $order->dest_lat, 'longitude' => (float) $order->dest_lng];

        $distanceKm = $this->haversineKm($storeOrigin, $dest);
        $etaMins = max(8, (int) round($distanceKm * 4));

        $hasExistingRoute = is_array($order->route_coordinates) && count($order->route_coordinates) >= 2;

        $updates = [
            'current_lat' => $from['latitude'],
            'current_lng' => $from['longitude'],
            'delivery_distance_km' => $distanceKm,
            'delivery_minutes' => $etaMins,
        ];

        if (! $hasExistingRoute) {
            $route = $this->directions($from, $dest);
            $updates['route_coordinates'] = $route['coordinates'];
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

        return $this->deterministicOffset($query, $fallback);
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
            $response = Http::timeout(6)
                ->withHeaders([
                    'User-Agent' => 'MoreBitesCapstone/1.0 (delivery tracking)',
                    'Accept' => 'application/json',
                ])
                ->get('https://nominatim.openstreetmap.org/search', [
                    'q' => $searchQuery,
                    'format' => 'json',
                    'limit' => 1,
                    'countrycodes' => 'ph',
                ]);

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

        try {
            $path = sprintf(
                '%s,%s;%s,%s',
                $from['longitude'],
                $from['latitude'],
                $to['longitude'],
                $to['latitude']
            );

            $response = Http::timeout(10)->get(
                'https://router.project-osrm.org/route/v1/driving/'.$path,
                [
                    'overview' => 'full',
                    'geometries' => 'geojson',
                ]
            );

            if ($response->successful() && ($response->json('code') === 'Ok')) {
                $route = $response->json('routes.0');
                $line = $route['geometry']['coordinates'] ?? [];
                if ($line) {
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
            Log::warning('OSRM directions failed: '.$e->getMessage());
        }

        return [
            'coordinates' => $fallbackCoords,
            'distance_km' => $haversine,
            'eta_mins' => max(8, (int) round($haversine * 4)),
        ];
    }

    public function riderPoint(Order $order): ?array
    {
        $storeOrigin = $this->storePoint();

        if ($order->current_lat && $order->current_lng) {
            $candidate = [
                'latitude' => (float) $order->current_lat,
                'longitude' => (float) $order->current_lng,
                'updated_at' => $order->updated_at?->toIso8601String(),
            ];
            if ($this->haversineKm($storeOrigin, $candidate) <= DeliveryRateService::MAX_DELIVERY_KM) {
                return $candidate;
            }
        }

        $driver = $order->relationLoaded('driver') ? $order->driver : $order->driver()->first();
        if (! $driver || ! $driver->current_lat || ! $driver->current_lng) {
            return null;
        }

        $candidate = [
            'latitude' => (float) $driver->current_lat,
            'longitude' => (float) $driver->current_lng,
            'updated_at' => $driver->location_updated_at?->toIso8601String(),
        ];

        if ($this->haversineKm($storeOrigin, $candidate) > DeliveryRateService::MAX_DELIVERY_KM) {
            return null;
        }

        return $candidate;
    }

    public const ACTIVE_DELIVERY_STATUSES = [
        'Assigned',
        'Picked Up',
        'Out for Delivery',
        'Out For Delivery',
    ];

    public function trackingPayload(Order $order): array
    {
        $order = $this->ensureDestination($order->loadMissing(['driver', 'items.menuItem', 'customer']));
        $destination = [
            'latitude' => (float) $order->dest_lat,
            'longitude' => (float) $order->dest_lng,
        ];
        $rider = $this->riderPoint($order);
        if (! $rider && in_array($order->status, self::ACTIVE_DELIVERY_STATUSES, true)) {
            $rider = $this->storePoint();
        }
        $coords = [];
        $distanceKm = null;
        $etaMins = null;

        if ($rider) {
            $coords = $order->route_coordinates;
            if (! is_array($coords) || count($coords) < 2) {
                $order = $this->ensureRoute($order, $rider);
                $coords = $order->route_coordinates;
            }
            $distanceKm = (float) ($order->delivery_distance_km ?: $this->haversineKm($rider, $destination));
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
        $isPreparing = in_array($order->status, ['Preparing', 'Pending'], true);

        return [
            'order_id' => $order->order_code,
            'id' => $order->order_code,
            'db_id' => $order->id,
            'receipt_number' => $order->receiptNumber(),
            'status' => $status,
            'raw_status' => $order->status,
            'is_preparing' => $isPreparing,
            'prep_time_min' => $prepSetting->min_prep_time,
            'prep_time_max' => $prepSetting->max_prep_time,
            'prep_time_label' => $prepSetting->formattedLabel(),
            'prep_estimate_text' => $prepSetting->estimateText(),
            'date' => $order->created_at?->toIso8601String(),
            'dateLabel' => $order->created_at?->format('M j, Y · g:i A'),
            'ordered_at' => $order->created_at?->toIso8601String(),
            'ordered_at_label' => $order->created_at?->format('M j, Y · g:i A'),
            'customer' => $order->customer_name,
            'address' => $order->delivery_address,
            'driver' => $order->driver?->name,
            'driver_phone' => $order->driver?->phone,
            'driver_photo' => $order->driver?->photo ? Media::url($order->driver->photo) : null,
            'rider_photo' => $order->driver?->photo ? Media::url($order->driver->photo) : null,
            'reported_issues' => $order->reportedIssues(),
            'eta_mins' => $etaMins,
            'distance_km' => $distanceKm !== null ? round($distanceKm, 2) : null,
            'distance_label' => $distanceKm !== null ? number_format($distanceKm, 1).' km' : '—',
            'arrival_by' => $etaMins ? now()->addMinutes($etaMins)->format('g:i A') : null,
            'destination' => $destination,
            'rider' => $rider,
            'route' => is_array($coords) ? array_values($coords) : [],
            'updated_at' => $order->updated_at?->toIso8601String(),
            'timeline' => $this->timeline($order),
            'items' => $order->items->map(fn ($i) => [
                'id' => (string) $i->id,
                'name' => $i->name,
                'size' => $i->size,
                'quantity' => (int) $i->qty,
                'price' => (float) $i->unit_price,
                'image' => $i->menuItem?->image ? Media::url($i->menuItem->image) : null,
            ])->values(),
            'total' => (float) $order->total,
            'delivery_fee' => (float) ($order->delivery_fee ?? $rates->defaultFee()),
            'service_fee' => (float) ($order->service_fee ?? $rates->serviceFee()),
            'payment_method' => $order->payment_method ?: 'COD',
            'payment_status' => $isCompleted ? 'Paid' : ($order->payment_status ?: 'Unpaid'),
            'rated' => (bool) $order->rated_at,
            'can_rate' => $isCompleted && ! $order->rated_at,
            'proof_of_delivery' => Media::url($order->proof_of_delivery),
            'delivered_at' => $deliveredAt?->toIso8601String(),
            'delivered_at_label' => $deliveredAt?->format('M j, Y · g:i A'),
            'payment_confirmed_at' => $deliveredAt?->toIso8601String(),
            'payment_confirmed_at_label' => $deliveredAt?->format('M j, Y · g:i A'),
            'points_earned' => $order->loyaltyPointsEarned(),
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
                    'updated' => $order->updated_at?->format('g:i A'),
                    'updated_time' => $order->updated_at?->format('g:i A'),
                    'updated_date' => $order->updated_at?->format('M d, Y'),
                    'updated_at' => $payload['updated_at'],
                    'assigned_at' => $order->assigned_at?->format('M d, Y g:i A'),
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
        ];
    }

    private function timeline(Order $order): array
    {
        $status = $order->status === 'Completed' ? 'Delivered' : $order->status;
        $prepSetting = \App\Models\StoreSetting::current();
        $prepLabel = $prepSetting->formattedLabel();
        $steps = [
            ['key' => 'Pending', 'title' => 'Order Confirmed', 'description' => 'Your order has been received', 'icon' => 'checkmark'],
            ['key' => 'Preparing', 'title' => 'Preparing', 'description' => "Your food is being prepared · ready in {$prepLabel} (est.)", 'icon' => 'checkmark'],
            ['key' => 'Out for Delivery', 'title' => 'Out For Delivery', 'description' => 'Your order is on the way', 'icon' => 'bicycle'],
            ['key' => 'Delivered', 'title' => 'Delivered', 'description' => 'Order will be delivered soon', 'icon' => 'home-outline'],
        ];

        $rank = match ($status) {
            'Pending' => 0,
            'Preparing', 'Ready', 'Assigned' => 1,
            'Picked Up', 'Out for Delivery' => 2,
            'Delivered', 'Completed' => 3,
            default => 0,
        };

        return array_map(function ($step, $index) use ($rank, $order) {
            $state = $index < $rank ? 'complete' : ($index === $rank ? 'active' : 'pending');
            $timestamp = null;
            if ($index === 0 && $order->created_at) {
                $timestamp = $order->created_at->format('g:i A');
            } elseif ($index === 2 && $order->assigned_at) {
                $timestamp = $order->assigned_at->format('g:i A');
            } elseif ($index === 3 && $order->delivered_at) {
                $timestamp = $order->delivered_at->format('g:i A');
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
