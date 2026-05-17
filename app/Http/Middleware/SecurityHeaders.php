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

        // CSP — Inertia + Vite need 'unsafe-inline' for the @viteReactRefresh script,
        // and we allow Google Fonts CSS, fonts.gstatic.com fonts, and GitHub avatars.
        //
        // Note: script-src includes 'unsafe-inline' because the theme bootstrapper
        // in resources/views/app.blade.php must run before any external JS to avoid
        // a flash-of-unstyled-theme. Tightening this would require a nonce-based
        // CSP applied via a middleware that injects the nonce into the inline
        // script — tracked as a follow-up. The inline script never touches user
        // data; it only reads the `prism-theme` localStorage key.
        $csp = "default-src 'self'; "
             . "script-src 'self' 'unsafe-inline' cdn.jsdelivr.net; "
             . "style-src 'self' 'unsafe-inline' fonts.googleapis.com; "
             . "font-src 'self' fonts.gstatic.com data:; "
             . "img-src 'self' data: blob: avatars.githubusercontent.com; "
             . "connect-src 'self' https://openrouter.ai https://api.github.com; "
             . "frame-ancestors 'none';";
        $response->headers->set('Content-Security-Policy', $csp);

        return $response;
    }
}
