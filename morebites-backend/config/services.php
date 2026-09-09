<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'maps' => [
        'store_lat' => env('MAPS_STORE_LAT', env('MAPBOX_STORE_LAT', 7.6094)),
        'store_lng' => env('MAPS_STORE_LNG', env('MAPBOX_STORE_LNG', 124.9883)),
    ],

    'fees' => [
        'service_fee' => env('SERVICE_FEE', 20),
        'default_delivery_fee' => env('DEFAULT_DELIVERY_FEE', 40),
    ],

];
