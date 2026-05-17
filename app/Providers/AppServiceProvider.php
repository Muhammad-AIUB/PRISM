<?php

namespace App\Providers;

use GuzzleHttp\Client;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Facades\Vite;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Force https:// on all generated URLs when running on Render (or any
        // platform that terminates TLS at a reverse proxy). Without this the
        // app sees raw HTTP from the proxy and route()/url() helpers emit
        // http:// links — which break in browsers under HSTS and CSP.
        if ($this->app->environment('production')) {
            URL::forceScheme('https');
        }

        Vite::prefetch(concurrency: 3);

        // Disable SSL verification in local development (Windows SSL cert workaround)
        if (app()->environment('local')) {
            $this->app->bind(Client::class, function () {
                return new Client([
                    'verify' => false,
                ]);
            });
        }

        $this->configureRateLimiters();
    }

    /**
     * Named rate limiters used across routes.
     *  - webhook: 60/min per IP — generous, since GitHub may burst on busy repos
     *  - api:    100/min per user (falls back to IP for guests)
     *  - auth:    10/min per IP  — protects the OAuth handshake from brute force
     */
    protected function configureRateLimiters(): void
    {
        RateLimiter::for('webhook', function (Request $request) {
            return Limit::perMinute(60)->by($request->ip());
        });

        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(100)->by(optional($request->user())->id ?: $request->ip());
        });

        RateLimiter::for('auth', function (Request $request) {
            return Limit::perMinute(10)->by($request->ip());
        });
    }
}
