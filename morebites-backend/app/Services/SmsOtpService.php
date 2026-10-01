<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * PROMPT 46 — Single-Point SMS OTP Delivery Service
 *
 * Centralizes outbound OTP delivery behind `sendOtp()` so a live Philippine SMS gateway
 * (e.g. Semaphore, Vonage, Twilio) can be plugged in via `config/services.php` (`SMS_*` env vars)
 * without touching controller logic.
 *
 * Current State:
 * - No third-party SMS gateway credentials are configured in `.env`.
 * - When no external SMS provider is configured, writes the 6-digit OTP to `storage/logs/laravel.log`
 *   in `local` / `testing` environments ONLY so the forgot-password flow can be demonstrated end to end,
 *   while never exposing the OTP in any HTTP API response.
 */
class SmsOtpService
{
    public function sendOtp(string $phone, string $code): void
    {
        $driver = strtolower((string) config('services.sms.driver', 'log'));
        $apiKey = config('services.sms.api_key');
        $endpoint = config('services.sms.endpoint');
        $senderId = config('services.sms.sender_id', 'MoreBites');
        $message = "Your MoreBites password reset OTP is {$code}. It expires in 5 minutes. Do not share this code.";

        if ($driver !== 'log' && ! empty($apiKey) && ! empty($endpoint)) {
            try {
                Http::timeout(8)->post($endpoint, [
                    'apikey' => $apiKey,
                    'number' => $phone,
                    'message' => $message,
                    'sendername' => $senderId,
                ]);

                return;
            } catch (\Throwable $e) {
                Log::error('SMS gateway delivery failed for '.$phone.': '.$e->getMessage());
            }
        }

        if (app()->environment(['local', 'testing'])) {
            Log::info("[MoreBites OTP] Password reset OTP for {$phone}: {$code} (valid for 5 minutes)");
        }
    }
}
