<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('login', function (Request $request) {
            $rawIdentifier = (string) (
                $request->input('email')
                ?? $request->input('phone')
                ?? $request->input('username')
                ?? $request->input('identifier')
                ?? ''
            );
            $normalizedIdentifier = strtolower(str_replace([' ', '-'], '', trim($rawIdentifier)));
            $key = ($normalizedIdentifier !== '' ? $normalizedIdentifier : 'guest').'|'.$request->ip();

            return Limit::perMinute(5)
                ->by($key)
                ->response(function (Request $request, array $headers) {
                    $retryAfter = max(1, (int) ($headers['Retry-After'] ?? 60));

                    return response()->json([
                        'message' => "Too many login attempts. Please try again in {$retryAfter} seconds.",
                        'retry_after' => $retryAfter,
                    ], 429, $headers);
                });
        });

        RateLimiter::for('registration', function (Request $request) {
            return Limit::perMinute(10)
                ->by($request->ip())
                ->response(function (Request $request, array $headers) {
                    $retryAfter = max(1, (int) ($headers['Retry-After'] ?? 60));

                    return response()->json([
                        'message' => "Too many registration attempts. Please try again in {$retryAfter} seconds.",
                        'retry_after' => $retryAfter,
                    ], 429, $headers);
                });
        });

        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(240)
                ->by($request->user()?->id ?: $request->ip())
                ->response(function (Request $request, array $headers) {
                    $retryAfter = max(1, (int) ($headers['Retry-After'] ?? 60));

                    return response()->json([
                        'message' => "Too many requests. Please try again in {$retryAfter} seconds.",
                        'retry_after' => $retryAfter,
                    ], 429, $headers);
                });
        });
    }
}
