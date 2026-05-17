<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        /** @var Response $response */
        $response = $next($request);

        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-XSS-Protection', '1; mode=block');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

        // HSTS only when actually served over HTTPS in production.
        if (app()->environment('production') && $request->isSecure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        // Content-Security-Policy
        //
        // 'self' covers whatever host the response is served from — same origin
        // works on localhost, the cloudflared tunnel, *.onrender.com, etc., so
        // no per-environment branching needed.
        //
        // 'unsafe-inline' on script-src is required by the theme bootstrapper in
        // resources/views/app.blade.php which must run before any external JS to
        // avoid a flash-of-unstyled-theme. 'unsafe-eval' supports Vite's React
        // runtime (HMR + lazy chunk loading). Tightening either would require a
        // nonce-based middleware — tracked as a follow-up.
        $csp = implode('; ', [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' data: https://fonts.gstatic.com",
            "img-src 'self' data: https: https://avatars.githubusercontent.com",
            "connect-src 'self' https://api.github.com https://openrouter.ai",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self' https://github.com",
        ]);

        $response->headers->set('Content-Security-Policy', $csp);

        return $response;
    }
}
