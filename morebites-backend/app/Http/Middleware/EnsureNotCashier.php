<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureNotCashier
{
    public function handle(Request $request, Closure $next, ?string $page = null): Response
    {
        $user = $request->user();

        if ($user?->role === 'super_admin' || $user?->hasRoleAccess('admin')) {
            return $next($request);
        }

        if ($page && $user?->hasPageAccess($page)) {
            return $next($request);
        }

        if ($user?->role === 'cashier') {
            abort(403, 'Cashiers cannot access this resource.');
        }

        return $next($request);
    }
}
