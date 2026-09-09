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
        $from ??= $this->riderPoint($order) ?? $this->storePoint();
        $to = [
            'latitude' => (float) $order->dest_lat,
            'longitude' => (float) $order->dest_lng,
        ];

        $route = $this->directions($from, $to);
        $order->update([
            'route_coordinates' => $route['coordinates'],
            'delivery_distance_km' => $route['distance_km'] ?? $order->delivery_distance_km,
            'delivery_minutes' => $route['eta_mins'] ?? $order->delivery_minutes,
        ]);

        return $order->fresh();
    }

    public function geocode(?string $address): array
    {
        $fallback = $this->storePoint();
        $query = trim((string) $address);
        if ($query === '') {
            return $fallback;
        }

        try {
            $response = Http::timeout(10)
                ->withHeaders([
                    'User-Agent' => 'MoreBitesCapstone/1.0 (delivery tracking)',
                    'Accept' => 'application/json',
                ])
                ->get('https://nominatim.openstreetmap.org/search', [
                    'q' => $query.', Philippines',
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
            Log::warning('Nominatim geocode failed: '.$e->getMessage());
        }

        return $this->deterministicOffset($query, $fallback);
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
        $order = $this->ensureDestination($order->loadMissing(['driver', 'items', 'customer']));
        $destination = [
            'latitude' => (float) $order->dest_lat,
            'longitude' => (float) $order->dest_lng,
        ];
        $rider = $this->riderPoint($order) ?? $this->storePoint();
        $coords = $order->route_coordinates;
        if (! is_array($coords) || count($coords) < 2) {
            $order = $this->ensureRoute($order, $rider);
            $coords = $order->route_coordinates;
        }

        $distanceKm = (float) ($order->delivery_distance_km ?: $this->haversineKm($rider, $destination));
        $etaMins = (int) ($order->delivery_minutes ?: max(8, (int) round($distanceKm * 4)));
        $status = $order->status === 'Completed' ? 'Delivered' : $order->status;

        return [
            'order_id' => $order->order_code,
            'db_id' => $order->id,
            'status' => $status,
            'customer' => $order->customer_name,
            'address' => $order->delivery_address,
            'driver' => $order->driver?->name,
            'driver_phone' => $order->driver?->phone,
            'eta_mins' => $etaMins,
            'distance_km' => round($distanceKm, 2),
            'distance_label' => number_format($distanceKm, 1).' km',
            'arrival_by' => now()->addMinutes($etaMins)->format('g:i A'),
            'destination' => $destination,
            'rider' => $rider,
            'route' => is_array($coords) ? array_values($coords) : [$rider, $destination],
            'store' => $this->storePoint(),
            'updated_at' => $order->updated_at?->toIso8601String(),
            'timeline' => $this->timeline($order),
            'items' => $order->items->map(fn ($i) => [
                'id' => (string) $i->id,
                'name' => $i->name,
                'size' => $i->size,
                'quantity' => (int) $i->qty,
                'price' => (float) $i->unit_price,
            ])->values(),
            'total' => (float) $order->total,
            'rated' => (bool) $order->rated_at,
            'can_rate' => in_array($status, ['Delivered', 'Completed'], true) && ! $order->rated_at,
            'proof_of_delivery' => Media::url($order->proof_of_delivery),
            'delivered_at' => $order->delivered_at?->toIso8601String(),
            'delivered_at_label' => $order->delivered_at?->format('M j, Y · g:i A'),
        ];
    }

    public function fleetPayload(): array
    {
        $orders = Order::query()
            ->with('driver')
            ->whereNotNull('driver_id')
            ->whereIn('status', ['Assigned', 'Picked Up', 'Out for Delivery'])
            ->latest()
            ->take(20)
            ->get()
            ->map(function (Order $order) {
                $payload = $this->trackingPayload($order);

                return [
                    'db_id' => $payload['db_id'],
                    'order_id' => $payload['order_id'],
                    'status' => $payload['status'],
                    'driver' => $payload['driver'],
                    'customer' => $payload['customer'],
                    'destination' => $payload['destination'],
                    'rider' => $payload['rider'],
                    'route' => $payload['route'],
                    'eta_mins' => $payload['eta_mins'],
                    'distance_km' => $payload['distance_km'],
                ];
            })
            ->values();

        return [
            'store' => $this->storePoint(),
            'deliveries' => $orders,
        ];
    }

    private function timeline(Order $order): array
    {
        $status = $order->status === 'Completed' ? 'Delivered' : $order->status;
        $steps = [
            ['key' => 'Pending', 'title' => 'Order Confirmed', 'description' => 'Your order has been received', 'icon' => 'checkmark'],
            ['key' => 'Preparing', 'title' => 'Preparing', 'description' => 'Your food is being prepared', 'icon' => 'checkmark'],
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
