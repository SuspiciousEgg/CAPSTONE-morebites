<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AccountCreationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    public function test_super_admin_can_create_admin_with_photo(): void
    {
        $superAdmin = User::factory()->create([
            'role' => 'super_admin',
            'role_access' => ['admin', 'super_admin'],
            'status' => 'Active',
        ]);

        $base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

        $response = $this->actingAs($superAdmin)->postJson('/api/accounts/admins', [
            'first_name' => 'John',
            'last_name' => 'Manager',
            'email' => 'admin@test.local',
            'username' => 'johnmanager',
            'phone' => '09123456789',
            'password' => 'secret123',
            'role_access' => ['admin'],
            'photo' => $base64Image,
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('users', [
            'email' => 'admin@test.local',
            'role' => 'admin',
        ]);

        $created = User::where('email', 'admin@test.local')->first();
        $this->assertNotNull($created->photo);
        $this->assertStringContainsString('/storage/avatars/', $created->photo);
    }

    public function test_super_admin_can_create_driver_with_photo_and_license_document(): void
    {
        $superAdmin = User::factory()->create([
            'role' => 'super_admin',
            'role_access' => ['admin', 'super_admin'],
            'status' => 'Active',
        ]);

        $base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        $base64Pdf = 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrp/Og0MTGCjQgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL0xlbmd0aCA4Mgo+PgpzdHJlYW0KeJwr5HLy93NxDXEM83R19nMNcVVIy8/NyckvV0hPzUssyU/PK1ZIKcovL1FIzsgvTUpVKMtMzFGwVYDzFUoSi3Ly83KxmgEAL28Tjwo+PgplbmRzdHJlYW0KZW5kb2JqCjEgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9UeXBlIC9QYWdlcwovS2lkcyBbMyAwIFJdCi9Db3VudCAxCj4+CmVuZG9iagozIDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9QYXJlbnQgMiAwIFIKL1Jlc291cmNlcyA8PAovRm9udCA8PAovRjEgNCAwIFIKPj4KPj4KL01lZGlhQm94IFswIDAgNTk1IDg0Ml0KL0NvbnRlbnRzIDUgMCBSCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9UeXBlIC9Gb250Ci9TdWJ0eXBlIC9UeXBlMQovQmFzZUZvbnQgL0hlbHZldGljYQo+PgplbmRvYmoKNCAwIG9iago8PAovVHlwZSAvRm9udAovU3VidHlwZSAvVHlwZTEKL0Jhc2VGb250IC9IZWx2ZXRpY2EKPj4KZW5kb2JqCjUgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL0xlbmd0aCA0Mgo+PgpzdHJlYW0KeJwr5HIqTcxTKM4vzSvxzFPwTixKTk0sSs7Py8tX0NQDAHhDCU4KZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAyMjUgMDAwMDAgbiAKMDAwMDAwMDI4MSAwMDAwMCBuIAowMDAwMDAwMzM4IDAwMDAwIG4gCjAwMDAwMDA0NDQgMDAwMDAgbiAKMDAwMDAwMDUwMSAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDYKL1Jvb3QgMSAwIFIKPj4Kc3RhcnR4cmVmCjYxNwolJUVPRgo=';

        $response = $this->actingAs($superAdmin)->postJson('/api/accounts/drivers', [
            'first_name' => 'Speedy',
            'last_name' => 'Rider',
            'email' => 'driver@test.local',
            'username' => 'speedyrider',
            'phone' => '09123456780',
            'password' => 'secret123',
            'license_number' => 'N01-23-456789',
            'license_expiry' => '2028-12-31',
            'role_access' => ['driver'],
            'photo' => $base64Image,
            'license_document' => $base64Pdf,
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('users', [
            'email' => 'driver@test.local',
            'role' => 'driver',
            'license_number' => 'N01-23-456789',
        ]);

        $created = User::where('email', 'driver@test.local')->first();
        $this->assertNotNull($created->photo);
        $this->assertStringContainsString('/storage/avatars/', $created->photo);
        $this->assertNotNull($created->license_document);
        $this->assertStringContainsString('/storage/documents/', $created->license_document);
    }
}

