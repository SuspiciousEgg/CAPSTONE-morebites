<?php

namespace Tests\Unit;

use App\Services\SmsOtpService;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class SmsOtpServiceTest extends TestCase
{
    public function test_format_message_without_app_hash(): void
    {
        Config::set('services.sms.app_hash', null);
        $service = new SmsOtpService();
        $message = $service->formatMessage('123456');

        $this->assertStringStartsWith('<#>', $message);
        $this->assertStringContainsString('123456', $message);
        $this->assertLessThanOrEqual(140, strlen($message));
        $this->assertEquals('<#> Your MoreBites verification code is 123456. It expires in 5 minutes.', $message);
    }

    public function test_format_message_with_google_android_app_hash(): void
    {
        Config::set('services.sms.app_hash', 'FA+9qCX9VSu');
        $service = new SmsOtpService();
        $message = $service->formatMessage('654321');

        $this->assertStringStartsWith('<#>', $message);
        $this->assertStringContainsString('654321', $message);
        $this->assertStringEndsWith('FA+9qCX9VSu', $message);
        $this->assertLessThanOrEqual(140, strlen($message));
        $this->assertStringContainsString("\n\nFA+9qCX9VSu", $message);
    }

    public function test_send_otp_logs_in_local_environment(): void
    {
        Config::set('services.sms.driver', 'log');
        Log::shouldReceive('info')
            ->once()
            ->withArgs(function ($log) {
                return str_contains($log, '[MoreBites OTP]')
                    && str_contains($log, '09171234567')
                    && str_contains($log, '123456')
                    && str_contains($log, '<#>');
            });

        $service = new SmsOtpService();
        $service->sendOtp('09171234567', '123456');
    }

    public function test_send_otp_with_placeholder_key_skips_http_and_logs(): void
    {
        Config::set('services.sms.driver', 'http');
        Config::set('services.sms.api_key', 'your_api_key_here');
        Config::set('services.sms.endpoint', 'https://api.semaphore.co/api/v4/messages');

        Log::shouldReceive('warning')
            ->once()
            ->withArgs(function ($msg) {
                return str_contains($msg, 'SMS_API_KEY is not configured');
            });

        Log::shouldReceive('info')
            ->once()
            ->withArgs(function ($log) {
                return str_contains($log, '[MoreBites OTP]')
                    && str_contains($log, '09171234567');
            });

        $service = new SmsOtpService();
        $service->sendOtp('09171234567', '123456');
    }

    public function test_send_otp_via_android_sms_gateway_appends_message_and_basic_auth(): void
    {
        Http::fake([
            'http://192.168.1.33:8080/message' => Http::response(['status' => 'success'], 200),
        ]);

        Config::set('services.sms.driver', 'http');
        Config::set('services.sms.endpoint', 'http://192.168.1.33:8080');
        Config::set('services.sms.user', 'myuser');
        Config::set('services.sms.password', 'secret123');

        $service = new SmsOtpService();
        $service->sendOtp('09168663494', '482910');

        Http::assertSent(function ($request) {
            return $request->url() === 'http://192.168.1.33:8080/message'
                && $request->hasHeader('Authorization', 'Basic ' . base64_encode('myuser:secret123'))
                && $request['phoneNumbers'][0] === '+639168663494'
                && str_contains($request['textMessage']['text'], '482910');
        });
    }
}

