@php
    $logoPath = public_path('images/logo.png');
    $logoSrc = '';
    if (file_exists($logoPath)) {
        if (isset($message) && is_object($message) && method_exists($message, 'embed')) {
            try {
                $logoSrc = $message->embed($logoPath);
            } catch (\Throwable $e) {
                $logoSrc = 'data:image/png;base64,' . base64_encode(file_get_contents($logoPath));
            }
        } else {
            $logoSrc = 'data:image/png;base64,' . base64_encode(file_get_contents($logoPath));
        }
    }
@endphp
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MoreBites Verification Code</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8F9FA; margin: 0; padding: 40px 16px; color: #333333;">
    <div style="max-width: 520px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); border: 1px solid #ECECEC;">
        <!-- Header Banner -->
        <div style="background-color: #F97000; padding: 24px 20px; text-align: center;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto;">
                <tr>
                    @if (!empty($logoSrc))
                    <td style="vertical-align: middle; padding-right: 12px;">
                        <img src="{{ $logoSrc }}" alt="MoreBites Logo" width="50" height="42" style="display: block; width: 50px; height: auto; max-height: 48px; border: 0; outline: none; text-decoration: none;" />
                    </td>
                    @endif
                    <td style="vertical-align: middle; text-align: left;">
                        <h1 style="color: #FFFFFF; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; line-height: 1;">MoreBites</h1>
                    </td>
                </tr>
            </table>
            <p style="color: rgba(255,255,255,0.92); margin: 8px 0 0 0; font-size: 13.5px; font-weight: 500; letter-spacing: 0.2px;">Password Reset Verification</p>
        </div>

        <!-- Body Content -->
        <div style="padding: 32px 28px;">
            <p style="font-size: 16px; margin: 0 0 16px 0; color: #1F2937;">Hello <strong>{{ $name }}</strong>,</p>
            <p style="font-size: 14px; line-height: 22px; color: #4B5563; margin: 0 0 24px 0;">
                We received a request to reset your MoreBites account password. Enter the verification code below in the app to continue:
            </p>

            <!-- 6-digit OTP Box -->
            <div style="background-color: #FFF7ED; border: 2px dashed #F97000; border-radius: 12px; padding: 20px 16px; text-align: center; margin: 28px 0;">
                <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #C2410C;">Your Verification Code</p>
                <div style="font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #F97000; font-family: 'Courier New', Courier, monospace;">
                    {{ $code }}
                </div>
                <p style="margin: 8px 0 0 0; font-size: 12px; color: #9A3412;">Expires in {{ $expiresInMinutes }} minutes</p>
            </div>

            <p style="font-size: 13px; line-height: 20px; color: #6B7280; margin: 24px 0 0 0;">
                For your security, never share this code with anyone. If you didn't make this request, you can safely ignore this email &mdash; your account remains completely secure.
            </p>
        </div>

        <!-- Footer -->
        <div style="background-color: #F9FAFB; padding: 18px 24px; text-align: center; border-top: 1px solid #F3F4F6;">
            <p style="margin: 0; font-size: 12px; color: #9CA3AF;">&copy; {{ date('Y') }} MoreBites. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
