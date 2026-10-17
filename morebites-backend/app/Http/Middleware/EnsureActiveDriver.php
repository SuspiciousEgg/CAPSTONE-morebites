<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureActiveDriver
{
    /**
     * Handle an incoming request.
     *
     * Reject driver accounts that are not Active, reading the already-loaded
     * user record so there is zero extra query.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && ($user->role === 'driver' || ($user->role !== 'super_admin' && $user->hasRoleAccess('driver')))) {
            $isBlacklisted = $user->archived_at !== null
                || in_array($user->status, ['Blacklisted', 'Blocklisted'], true);

            if ($isBlacklisted) {
                abort(403, 'Your account has been blocklisted. Please contact the shop.');
            }

            if ($user->status !== 'Active') {
                abort(403, 'Your account is suspended. Please contact the shop.');
            }
        }

        return $next($request);
    }
}

