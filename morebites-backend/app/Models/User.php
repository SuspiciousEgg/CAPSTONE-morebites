<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    public const ASSIGNABLE_ROLES = ['admin', 'driver', 'cashier'];

    protected $fillable = [
        'name',
        'first_name',
        'last_name',
        'email',
        'photo',
        'username',
        'phone',
        'password',
        'role',
        'role_access',
        'status',
        'gender',
        'birthday',
        'license_number',
        'license_expiry',
        'license_document',
        'vehicle_type',
        'plate_no',
        'current_lat',
        'current_lng',
        'location_updated_at',
        'rating',
        'completed_orders',
        'years_experience',
        'success_rate',
        'archived_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'birthday' => 'date',
            'license_expiry' => 'date',
            'archived_at' => 'datetime',
            'location_updated_at' => 'datetime',
            'rating' => 'float',
            'current_lat' => 'float',
            'current_lng' => 'float',
            'role_access' => 'array',
        ];
    }

    public function resolvedRoleAccess(): array
    {
        if (is_array($this->role_access) && count($this->role_access) > 0) {
            return array_values(array_intersect($this->role_access, self::ASSIGNABLE_ROLES));
        }

        return match ($this->role) {
            'super_admin' => self::ASSIGNABLE_ROLES,
            'admin' => ['admin'],
            'driver' => ['driver'],
            'cashier' => ['cashier'],
            default => [],
        };
    }

    public function hasRoleAccess(string $role): bool
    {
        if ($this->role === 'super_admin') {
            return true;
        }

        return in_array($role, $this->resolvedRoleAccess(), true);
    }

    public function syncRoleAccess(array $roles): void
    {
        $normalized = array_values(array_unique(array_intersect($roles, self::ASSIGNABLE_ROLES)));
        $this->role_access = $normalized;

        if ($this->role !== 'super_admin' && count($normalized) === 1) {
            $this->role = $normalized[0];
        }
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(DriverReview::class, 'driver_id');
    }

    public function assignedOrders(): HasMany
    {
        return $this->hasMany(Order::class, 'driver_id');
    }

    public function blacklistEntries(): HasMany
    {
        return $this->hasMany(DriverBlacklist::class, 'driver_id');
    }

    public function trustedDevices(): HasMany
    {
        return $this->hasMany(TrustedDevice::class, 'user_id');
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }

    public function adminDisplayId(): string
    {
        $seq = static::query()
            ->whereIn('role', ['super_admin', 'admin'])
            ->where('id', '<=', $this->id)
            ->count();

        return 'ADMIN-'.str_pad((string) $seq, 3, '0', STR_PAD_LEFT);
    }

    public function driverDisplayId(): string
    {
        $seq = static::query()
            ->where('role', 'driver')
            ->where('id', '<=', $this->id)
            ->count();

        return 'DRIVER-'.str_pad((string) $seq, 3, '0', STR_PAD_LEFT);
    }

    public function cashierDisplayId(): string
    {
        $seq = static::query()
            ->where('role', 'cashier')
            ->where('id', '<=', $this->id)
            ->count();

        return 'CASHIER-'.str_pad((string) $seq, 3, '0', STR_PAD_LEFT);
    }
}
