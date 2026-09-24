<?php

namespace Tests\Feature;

use App\Models\DeliveryRate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DeliveryRateQuoteTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        DeliveryRate::syncFixedTiers();
    }

    public function test_quote_with_coordinates_within_range(): void
    {
        // Dangcagan coordinates (~1.7 km from store)
        $response = $this->getJson('/api/delivery-rates/quote?lat=7.6101&lng=125.0043');

        $response->assertOk()
            ->assertJsonPath('data.deliverable', true)
            ->assertJsonPath('data.error', null);

        $this->assertLessThanOrEqual(10, $response->json('data.distance_km'));
        $this->assertNotNull($response->json('data.delivery_fee'));
    }

    public function test_quote_with_coordinates_beyond_range(): void
    {
        // Cagayan de Oro coordinates (~104 km from store)
        $response = $this->getJson('/api/delivery-rates/quote?lat=8.48607&lng=124.6568');

        $response->assertOk()
            ->assertJsonPath('data.deliverable', false)
            ->assertJsonPath('data.error', 'Delivery not available beyond 10km');

        $this->assertGreaterThan(10, $response->json('data.distance_km'));
    }

    public function test_quote_with_cagayan_de_oro_address_is_rejected_beyond_range(): void
    {
        $response = $this->getJson('/api/delivery-rates/quote?address=' . urlencode('Barangay Nazareth, Cagayan de Oro City'));

        $response->assertOk()
            ->assertJsonPath('data.deliverable', false)
            ->assertJsonPath('data.error', 'Delivery not available beyond 10km');

        $this->assertGreaterThan(10, $response->json('data.distance_km'));
    }
}

