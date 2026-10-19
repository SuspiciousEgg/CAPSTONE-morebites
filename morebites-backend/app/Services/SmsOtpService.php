<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * PROMPT 46 / GOOGLE ANDROID SMS — Single-Point SMS OTP Delivery Service
 *
 * Centralizes outbound OTP delivery behind `sendOtp()` so a live Philippine SMS gateway
 * (e.g. Semaphore, Vonage, Twilio) can be plugged in via `config/services.php` (`SMS_*` env vars)
 * without touching controller logic.
 *
 * Google Android SMS Retriever API & SMS Autofill Support:
 * - Message format complies with Google Android SMS Retriever requirements:
 *   1. Starts with `<#>` prefix.
 *   2. Contains the 6-digit OTP verification code.
 *   3. Concise message body strictly within 140 bytes limit.
 *   4. Appends optional 11-character Android app hash (`ANDROID_SMS_APP_HASH`) for zero-user-interaction retrieval.
 *
 * Fallback & Environment Safety:
 * - When no external SMS provider is configured, writes the formatted SMS to `storage/logs/laravel.log`
 *   in `local` / `testing` environments ONLY so the flow can be verified end to end,
 *   while never exposing the OTP in any HTTP API response.
 */
class SmsOtpService
{
    /**
     * Build Google Android SMS Retriever-compliant message text.
     */
    public function formatMessage(string $code): string
    {
        $appHash = trim((string) config('services.sms.app_hash', ''));
        $body = "<#> Your MoreBites verification code is {$code}. It expires in 5 minutes.";

        if ($appHash !== '') {
            return "{$body}\n\n{$appHash}";
        }

        return $body;
    }

    public function sendOtp(string $phone, string $code): void
    {
        $driver = strtolower((string) config('services.sms.driver', 'log'));
        $apiKey = trim((string) config('services.sms.api_key', ''));
        $endpoint = config('services.sms.endpoint');
        $senderId = config('services.sms.sender_id', 'SEMAPHORE');
        $message = $this->formatMessage($code);

        $hasRealApiKey = ! empty($apiKey) && $apiKey !== 'your_api_key_here';

        if ($driver !== 'log' && ! empty($endpoint)) {
            try {
                if (str_contains($endpoint, 'semaphore.co')) {
                    if (! $hasRealApiKey) {
                        Log::warning("SMS_DRIVER is '{$driver}' but SMS_API_KEY is not configured (contains placeholder 'your_api_key_here').");
                    } else {
                        $response = Http::withOptions([
                            'curl' => [CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4],
                        ])->timeout(8)->post($endpoint, [
                            'apikey' => $apiKey,
                            'number' => $phone,
                            'message' => $message,
                            'sendername' => $senderId ?: 'SEMAPHORE',
                        ]);

                        if ($response->successful()) {
                            Log::info("SMS OTP successfully sent to {$phone} via Semaphore.");
                            return;
                        }

                        Log::error("Semaphore rejected {$phone}: HTTP {$response->status()} - {$response->body()}");
                    }
                } else {
                    // Android SMS Gateway (capcom6/android-sms-gateway) or generic HTTP endpoint
                    $url = trim($endpoint);
                    if (! str_starts_with($url, 'http://') && ! str_starts_with($url, 'https://')) {
                        $url = 'http://' . $url;
                    }
                    $url = rtrim($url, '/');
                    if (! str_ends_with($url, '/message') && ! str_ends_with($url, '/messages')) {
                        $url .= '/message';
                    }

                    $headers = [
                        'Content-Type' => 'application/json',
                        'Accept' => 'application/json',
                    ];

                    $user = trim((string) config('services.sms.user', ''));
                    $password = trim((string) config('services.sms.password', ''));

                    if (! empty($user) && ! empty($password)) {
                        $headers['Authorization'] = 'Basic ' . base64_encode("{$user}:{$password}");
                    } elseif ($hasRealApiKey) {
                        if (str_contains($apiKey, ':')) {
                            $headers['Authorization'] = 'Basic ' . base64_encode($apiKey);
                        } else {
                            $headers['Authorization'] = 'Basic ' . base64_encode("sms:{$apiKey}");
                        }
                    }

                    $international = $this->formatInternational($phone);

                    $response = Http::timeout(8)
                        ->withHeaders($headers)
                        ->post($url, [
                            'phoneNumbers' => [$international],
                            'textMessage' => [
                                'text' => $message,
                            ],
                        ]);

                    if ($response->successful()) {
                        Log::info("SMS OTP successfully sent to {$phone} via SMS Gateway ({$url}).");
                        return;
                    }

                    Log::error("SMS Gateway rejected {$phone}: HTTP {$response->status()} - {$response->body()}");
                }
            } catch (\Throwable $e) {
                Log::error("SMS gateway delivery failed for {$phone}: {$e->getMessage()}");
            }
        }

        if (app()->environment(['local', 'testing'])) {
            Log::info("[MoreBites OTP] Password reset OTP for {$phone}: {$code} (valid for 5 minutes) | SMS: {$message}");
        }
    }

    private function formatInternational(string $phone): string
    {
        $clean = preg_replace('/\D/', '', $phone);
        if (str_starts_with($clean, '09') && strlen($clean) === 11) {
            return '+63' . substr($clean, 1);
        }
        if (str_starts_with($clean, '63') && strlen($clean) === 12) {
            return '+' . $clean;
        }

        return $phone;
    }
}
