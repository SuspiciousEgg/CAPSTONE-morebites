<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePageAccess
{
    public function handle(Request $request, Closure $next, string $page): Response
    {
        $user = $request->user();

        if (! $user) {
            abort(401, 'Unauthenticated.');
        }

        if (! $user->hasPageAccess($page)) {
            return response()->json([
                'message' => "You do not have permission to access the {$page} page.",
            ], 403);
        }

        return $next($request);
    }
}

