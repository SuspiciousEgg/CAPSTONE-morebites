<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\PasswordResetOtp;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class CustomerOtpPasswordResetTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::query()->create([
            'name' => 'Juan Dela Cruz',
            'phone' => '09171234567',
            'email' => 'juan@example.com',
            'password' => Hash::make('oldpassword123'),
            'role' => 'customer',
            'status' => 'Active',
        ]);

        $this->customer = Customer::query()->create([
            'user_id' => $this->user->id,
            'customer_code' => 'CUST-00999',
            'full_name' => 'Juan Dela Cruz',
            'phone' => '09171234567',
            'status' => 'ACTIVE',
        ]);
    }

    public function test_full_otp_password_reset_flow(): void
    {
        // 1. Request OTP
        $res = $this->postJson('/api/customer/forgot-password', [
            'phone' => '09171234567',
        ]);

        $res->assertStatus(200);
        $res->assertJsonFragment([
            'message' => 'If this phone number is registered, a 6-digit verification code has been sent.',
        ]);

        $otpRecord = PasswordResetOtp::query()->where('phone', '09171234567')->first();
        $this->assertNotNull($otpRecord);
        $this->assertNotNull($otpRecord->otp_hash);
        $this->assertEquals(0, $otpRecord->attempts);

        // 2. Cooldown enforcement (requesting again immediately gets 429)
        $resCooldown = $this->postJson('/api/customer/forgot-password', [
            'phone' => '09171234567',
        ]);
        $resCooldown->assertStatus(429);

        // 3. Verify OTP with incorrect code fails and increments attempts
        $badVerify = $this->postJson('/api/customer/verify-otp', [
            'phone' => '09171234567',
            'code' => '000000',
        ]);
        $badVerify->assertStatus(422);
        $this->assertEquals(1, $otpRecord->fresh()->attempts);

        // Set known OTP for testing
        $testCode = '654321';
        $otpRecord->update([
            'otp_hash' => Hash::make($testCode),
            'attempts' => 0,
        ]);

        // 4. Verify OTP with correct code returns reset_token
        $goodVerify = $this->postJson('/api/customer/verify-otp', [
            'phone' => '09171234567',
            'code' => $testCode,
        ]);
        $goodVerify->assertStatus(200);
        $resetToken = $goodVerify->json('reset_token');
        $this->assertNotEmpty($resetToken);

        // OTP should be cleared and reset_token_hash stored
        $this->assertNull($otpRecord->fresh()->otp_hash);
        $this->assertNotNull($otpRecord->fresh()->reset_token_hash);

        // 5. Reset password using the reset token
        $resetRes = $this->postJson('/api/customer/reset-password', [
            'reset_token' => $resetToken,
            'password' => 'newsecret456',
            'password_confirmation' => 'newsecret456',
        ]);
        $resetRes->assertStatus(200);

        // Verify password was updated
        $this->assertTrue(Hash::check('newsecret456', $this->user->fresh()->password));

        // Token is consumed and cannot be reused
        $reuseRes = $this->postJson('/api/customer/reset-password', [
            'reset_token' => $resetToken,
            'password' => 'anotherpass123',
            'password_confirmation' => 'anotherpass123',
        ]);
        $reuseRes->assertStatus(422);

        // 6. User can log in with new password
        $loginRes = $this->postJson('/api/customer/login', [
            'phone' => '09171234567',
            'password' => 'newsecret456',
            'device_id' => 'test-device-uuid',
        ]);
        $loginRes->assertStatus(200);
        $this->assertNotEmpty($loginRes->json('token'));
    }

    public function test_email_otp_password_reset_flow(): void
    {
        \Illuminate\Support\Facades\Mail::fake();

        // 1. Request OTP via email identifier
        $res = $this->postJson('/api/customer/forgot-password', [
            'identifier' => 'juan@example.com',
        ]);

        $res->assertStatus(200);
        $res->assertJsonFragment([
            'message' => 'If this email address is registered, a 6-digit verification code has been sent.',
            'delivery_channel' => 'email',
        ]);

        \Illuminate\Support\Facades\Mail::assertSent(\App\Mail\PasswordResetOtpMail::class, function ($mail) {
            return $mail->hasTo('juan@example.com')
                && strlen($mail->code) === 6;
        });

        // 2. Verify with email identifier
        $otpRecord = PasswordResetOtp::query()->where('phone', '09171234567')->first();
        $this->assertNotNull($otpRecord);
        $testCode = '888999';
        $otpRecord->update([
            'otp_hash' => Hash::make($testCode),
            'attempts' => 0,
        ]);

        $verifyRes = $this->postJson('/api/customer/verify-otp', [
            'identifier' => 'juan@example.com',
            'code' => $testCode,
        ]);

        $verifyRes->assertStatus(200);
        $this->assertNotEmpty($verifyRes->json('reset_token'));
    }
}

