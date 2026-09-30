<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PasswordResetOtp extends Model
{
    public const OTP_EXPIRY_MINUTES = 5;

    public const RESEND_COOLDOWN_SECONDS = 20;

    public const MAX_ATTEMPTS = 5;

    public const RESET_TOKEN_EXPIRY_MINUTES = 10;

    protected $fillable = [
        'phone',
        'user_id',
        'otp_hash',
        'otp_expires_at',
        'attempts',
        'last_sent_at',
        'reset_token_hash',
        'reset_token_expires_at',
        'consumed_at',
    ];

    protected function casts(): array
    {
        return [
            'otp_expires_at' => 'datetime',
            'last_sent_at' => 'datetime',
            'reset_token_expires_at' => 'datetime',
            'consumed_at' => 'datetime',
            'attempts' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
