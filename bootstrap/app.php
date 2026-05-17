<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Trust Render's (and any other) reverse-proxy headers so $request->isSecure(),
        // $request->ip(), and route()/url() resolve correctly behind TLS termination.
        $middleware->trustProxies(at: '*', headers:
            Request::HEADER_X_FORWARDED_FOR |
            Request::HEADER_X_FORWARDED_HOST |
            Request::HEADER_X_FORWARDED_PORT |
            Request::HEADER_X_FORWARDED_PROTO
        );

        // Applied to every request.
        $middleware->prepend([
            \App\Http\Middleware\LogRequests::class,
        ]);
        $middleware->append([
            \App\Http\Middleware\SecurityHeaders::class,
        ]);

        $middleware->alias([
            'github.ip' => \App\Http\Middleware\VerifyGithubIp::class,
        ]);

        $middleware->web(append: [
            \App\Http\Middleware\HandleInertiaRequests::class,
            \Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets::class,
        ]);

        // GitHub webhooks send their own HMAC signature; no CSRF token to verify.
        $middleware->validateCsrfTokens(except: [
            'webhook/github',
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
