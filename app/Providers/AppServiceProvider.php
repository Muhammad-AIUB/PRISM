<?php

namespace App\Providers;

use GuzzleHttp\Client;
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
        Vite::prefetch(concurrency: 3);

        // Disable SSL verification in local development (Windows SSL cert workaround)
        if (app()->environment('local')) {
            $this->app->bind(Client::class, function () {
                return new Client([
                    'verify' => false,
                ]);
            });
        }
    }
}
