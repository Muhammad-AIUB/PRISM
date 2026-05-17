<?php

use App\Http\Controllers\AuditController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CommitReviewController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DataController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\HelpController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\RepositoryController;
use App\Http\Controllers\ReviewController;
use App\Http\Controllers\SecurityController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\WebhookController;
use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    if (auth()->check()) {
        return redirect()->route('dashboard');
    }
    return redirect()->route('login');
})->name('home');

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
        Route::get('/repositories',                       [RepositoryController::class, 'index'])->name('repositories.index');
        Route::post('/repositories',                      [RepositoryController::class, 'store'])->name('repositories.store');
        Route::get('/repositories/{repository}/settings', [RepositoryController::class, 'settings'])->name('repositories.settings');
        Route::post('/repositories/{repository}/settings',[RepositoryController::class, 'update'])->name('repositories.update');
    });

    // ── Commit reviews ───────────────────────────────────────────────
    Route::middleware('throttle:api')->group(function () {
        Route::get('/commits/{commitReview}', [CommitReviewController::class, 'show'])->name('commits.show');
    });

    // ── Settings ─────────────────────────────────────────────────────
    Route::middleware('throttle:api')->group(function () {
        Route::get('/settings',             [SettingsController::class, 'index'])->name('settings.index');
        Route::post('/settings',            [SettingsController::class, 'update'])->name('settings.update');
        Route::post('/settings/test-slack', [SettingsController::class, 'testSlack'])->name('settings.test-slack');
    });

    // ── Help ─────────────────────────────────────────────────────────
    Route::get('/help/how-to-use', [HelpController::class, 'howToUse'])->name('help.how-to-use');

    // ── Security / Privacy / Data ─────────────────────────────────────
    Route::middleware('throttle:api')->group(function () {
        Route::get('/security',             [SecurityController::class, 'index'])->name('security.index');
        Route::get('/security/my-data',     [DataController::class,     'view'])->name('data.view');
        Route::delete('/security/my-data',  [DataController::class,     'delete'])->name('data.delete');
        Route::get('/security/audit-log',   [AuditController::class,    'index'])->name('audit.index');
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
