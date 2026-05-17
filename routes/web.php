<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\RepositoryController;
use App\Http\Controllers\ReviewController;
use App\Http\Controllers\WebhookController;
use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return Inertia::render('Welcome', [
        'canLogin' => Route::has('login'),
        'canRegister' => Route::has('register'),
        'laravelVersion' => Application::VERSION,
        'phpVersion' => PHP_VERSION,
    ]);
});

Route::get('/dashboard', [DashboardController::class, 'index'])
    ->middleware(['auth', 'verified', 'throttle:api'])
    ->name('dashboard');

// ── Health check (no auth, no throttle) ──────────────────────────────
Route::get('/health', HealthController::class)
    ->withoutMiddleware(['web'])
    ->name('health');

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');

    // ── Repositories ─────────────────────────────────────────────────
    Route::middleware('throttle:api')->group(function () {
        Route::get('/repositories', [RepositoryController::class, 'index'])->name('repositories.index');
        Route::post('/repositories', [RepositoryController::class, 'store'])->name('repositories.store');
    });

    // ── Reviews ──────────────────────────────────────────────────────
    Route::middleware('throttle:api')->group(function () {
        Route::get('/reviews/{pullRequest}',             [ReviewController::class, 'show'])->name('reviews.show');
        Route::post('/reviews/{pullRequest}/re-analyze', [ReviewController::class, 'reAnalyze'])->name('reviews.reanalyze');
        Route::get('/reviews/{pullRequest}/diff',        [ReviewController::class, 'diff'])->name('reviews.diff');
        Route::get('/reviews/{pullRequest}/export',      [ReviewController::class, 'exportPdf'])->name('reviews.export');
    });
});

// ── GitHub Webhook ───────────────────────────────────────────────────
Route::post('/webhook/github', [WebhookController::class, 'handle'])
    ->middleware(['throttle:webhook', 'github.ip'])
    ->name('webhook.github');

// ── GitHub OAuth ─────────────────────────────────────────────────────
Route::middleware('throttle:auth')->group(function () {
    Route::get('/auth/github',          [AuthController::class, 'redirectToGithub'])->name('auth.github');
    Route::get('/auth/github/callback', [AuthController::class, 'handleGithubCallback'])->name('auth.github.callback');
});

require __DIR__.'/auth.php';
