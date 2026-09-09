<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DriverBlacklist extends Model
{
    protected $table = 'driver_blacklist';

    protected $fillable = [
        'driver_id', 'driver_code', 'name', 'license_number', 'phone',
        'reason', 'notes', 'attachment_name', 'attachment_meta', 'blacklisted_at',
    ];

    protected function casts(): array
    {
        return ['blacklisted_at' => 'datetime'];
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'driver_id');
    }
}
