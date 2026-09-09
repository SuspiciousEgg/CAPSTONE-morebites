<?php

namespace App\Support;

class Media
{
    public static function url(?string $path): ?string
    {
        if (! $path) {
            return null;
        }

        if (
            str_starts_with($path, 'http://')
            || str_starts_with($path, 'https://')
            || str_starts_with($path, 'blob:')
            || str_starts_with($path, 'data:')
        ) {
            return $path;
        }

        return request()->getSchemeAndHttpHost().'/'.ltrim($path, '/');
    }
}
