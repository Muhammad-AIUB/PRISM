<?php

use App\Http\Controllers\AuditController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CommitReviewController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DataController;
use App\Http\Controllers\DemoController;
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

// ── Public Security & Privacy page ───────────────────────────────────
// Intentionally outside the auth group so visitors can read the trust
// content BEFORE signing in — which is exactly when they need it.
Route::get('/security', [SecurityController::class, 'index'])->name('security.index');

// ── Public Demo Mode ─────────────────────────────────────────────────
// Lets evaluators explore the full UI with sample data, no GitHub
// authorisation required.
Route::get('/demo',                [DemoController::class, 'index'])->name('demo');
Route::get('/demo/review/{id}',    [DemoController::class, 'review'])->name('demo.review')->whereNumber('id');

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');

    // ── Repositories ─────────────────────────────────────────────────
    Route::middleware('throttle:api')->group(function () {
        Route::get('/repositories',                       [RepositoryController::class, 'index'])->name('repositories.index');
        Route::post('/repositories',                      [RepositoryController::class, 'store'])->name('repositories.store');
        Route::get('/repositories/branches',              [RepositoryController::class, 'branches'])->name('repositories.branches');
        Route::get('/repositories/{repository}/settings', [RepositoryController::class, 'settings'])->name('repositories.settings');
        Route::post('/repositories/{repository}/settings',[RepositoryController::class, 'update'])->name('repositories.update');
    });

    // ── Commit reviews ───────────────────────────────────────────────
    Route::middleware('throttle:api')->group(function () {
        Route::get('/commits/{commitReview}',             [CommitReviewController::class, 'show'])->name('commits.show');
        Route::post('/commits/{commitReview}/re-analyze', [CommitReviewController::class, 'reAnalyze'])->name('commits.reanalyze');
    });

    // ── Settings ─────────────────────────────────────────────────────
    Route::middleware('throttle:api')->group(function () {
        Route::get('/settings',             [SettingsController::class, 'index'])->name('settings.index');
        Route::post('/settings',            [SettingsController::class, 'update'])->name('settings.update');
        Route::post('/settings/test-slack', [SettingsController::class, 'testSlack'])->name('settings.test-slack');
        Route::post('/settings/api-tokens',             [SettingsController::class, 'createApiToken'])->name('settings.api-tokens.create');
        Route::delete('/settings/api-tokens/{tokenId}', [SettingsController::class, 'revokeApiToken'])->name('settings.api-tokens.revoke')->whereNumber('tokenId');
    });

    // ── Help ─────────────────────────────────────────────────────────
    Route::get('/help/how-to-use', [HelpController::class, 'howToUse'])->name('help.how-to-use');

    // ── Security › Data + Audit (auth-only; /security itself is public) ─
    Route::middleware('throttle:api')->group(function () {
        Route::get('/security/my-data',    [DataController::class,  'view'])->name('data.view');
        Route::delete('/security/my-data', [DataController::class,  'delete'])->name('data.delete');
        Route::get('/security/audit-log',  [AuditController::class, 'index'])->name('audit.index');
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
// Note: github.ip middleware temporarily removed — Render's edge proxy masks
// GitHub's real source IP even with trustProxies('*'), so GitHub webhooks
// were being rejected as "not in GitHub range". HMAC-SHA256 signature
// verification inside WebhookController is the real security boundary;
// without the right webhook_secret nothing gets past it.
Route::post('/webhook/github', [WebhookController::class, 'handle'])
    ->middleware(['throttle:webhook'])
    ->name('webhook.github');

// ── GitHub OAuth ─────────────────────────────────────────────────────
Route::middleware('throttle:auth')->group(function () {
    Route::get('/auth/github',          [AuthController::class, 'redirectToGithub'])->name('auth.github');
    Route::get('/auth/github/callback', [AuthController::class, 'handleGithubCallback'])->name('auth.github.callback');
});

require __DIR__.'/auth.php';
