<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PasswordResetOtpMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $code,
        public string $name = 'Valued Customer',
        public int $expiresInMinutes = 5
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Your MoreBites Verification Code: {$this->code}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.password-reset-otp',
        );
    }
}

