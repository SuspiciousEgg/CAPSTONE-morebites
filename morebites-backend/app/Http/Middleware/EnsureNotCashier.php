<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureNotCashier
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->role === 'cashier') {
            abort(403, 'Cashiers cannot access this resource.');
        }

        return $next($request);
    }
}
