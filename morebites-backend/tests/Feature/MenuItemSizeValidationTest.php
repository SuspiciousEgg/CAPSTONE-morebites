<?php

namespace Tests\Feature;

use App\Models\MenuItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MenuItemSizeValidationTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::query()->create([
            'name' => 'Admin User',
            'email' => 'admin@test.com',
            'password' => Hash::make('password'),
            'role' => 'admin',
            'status' => 'Active',
        ]);
    }

    public function test_store_menu_item_rejects_duplicate_size_names(): void
    {
        Sanctum::actingAs($this->admin);

        $response = $this->postJson('/api/menu', [
            'name' => 'Test Garlic Pizza',
            'category' => 'Pizza',
            'has_sizes' => true,
            'sizes' => [
                ['name' => '30', 'price' => 444],
                ['name' => '30', 'price' => 500],
            ],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['sizes']);
        $this->assertStringContainsString('Each size option must have a unique name.', $response->json('errors.sizes.0'));
    }

    public function test_store_menu_item_rejects_duplicate_size_names_case_insensitive(): void
    {
        Sanctum::actingAs($this->admin);

        $response = $this->postJson('/api/menu', [
            'name' => 'Test Hawaiian Pizza',
            'category' => 'Pizza',
            'has_sizes' => true,
            'sizes' => [
                ['name' => 'Regular', 'price' => 300],
                ['name' => '  regular  ', 'price' => 450],
            ],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['sizes']);
        $this->assertStringContainsString('Each size option must have a unique name.', $response->json('errors.sizes.0'));
    }

    public function test_store_menu_item_rejects_duplicate_size_prices(): void
    {
        Sanctum::actingAs($this->admin);

        $response = $this->postJson('/api/menu', [
            'name' => 'Test Pepperoni Pizza',
            'category' => 'Pizza',
            'has_sizes' => true,
            'sizes' => [
                ['name' => '30', 'price' => 444],
                ['name' => '35', 'price' => 444],
            ],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['sizes']);
        $this->assertStringContainsString('Each size option must have a unique price.', $response->json('errors.sizes.0'));
    }

    public function test_store_menu_item_allows_unique_sizes_and_prices(): void
    {
        Sanctum::actingAs($this->admin);

        $response = $this->postJson('/api/menu', [
            'name' => 'Valid Pizza',
            'category' => 'Pizza',
            'has_sizes' => true,
            'sizes' => [
                ['name' => '30', 'price' => 444],
                ['name' => '35', 'price' => 500],
            ],
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('menu_items', ['name' => 'Valid Pizza']);
        $this->assertDatabaseHas('menu_item_sizes', ['name' => '30', 'price' => 444]);
        $this->assertDatabaseHas('menu_item_sizes', ['name' => '35', 'price' => 500]);
    }

    public function test_update_menu_item_rejects_duplicate_size_names(): void
    {
        Sanctum::actingAs($this->admin);

        $item = MenuItem::query()->create([
            'name' => 'Existing Pizza',
            'category' => 'Pizza',
            'has_sizes' => true,
            'price' => 0,
            'available' => true,
            'archived' => false,
        ]);

        $response = $this->putJson("/api/menu/{$item->id}", [
            'name' => 'Existing Pizza',
            'category' => 'Pizza',
            'has_sizes' => true,
            'sizes' => [
                ['name' => 'Medium', 'price' => 200],
                ['name' => 'medium', 'price' => 300],
            ],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['sizes']);
    }

    public function test_update_menu_item_rejects_duplicate_size_prices(): void
    {
        Sanctum::actingAs($this->admin);

        $item = MenuItem::query()->create([
            'name' => 'Existing Pizza 2',
            'category' => 'Pizza',
            'has_sizes' => true,
            'price' => 0,
            'available' => true,
            'archived' => false,
        ]);

        $response = $this->putJson("/api/menu/{$item->id}", [
            'name' => 'Existing Pizza 2',
            'category' => 'Pizza',
            'has_sizes' => true,
            'sizes' => [
                ['name' => 'Medium', 'price' => 250],
                ['name' => 'Large', 'price' => 250],
            ],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['sizes']);
    }
}
