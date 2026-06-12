<?php

use App\Http\Controllers\Api\ReviewApiController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes (v1)
|--------------------------------------------------------------------------
| Token-authenticated REST API consumed by the PRism MCP server (and any
| other integration). Tokens are issued from Settings → API Tokens and
| sent as "Authorization: Bearer <token>".
*/

Route::prefix('v1')->middleware(['auth:sanctum', 'throttle:api'])->group(function () {
    Route::get('/me',                       [ReviewApiController::class, 'me']);
    Route::get('/reviews',                  [ReviewApiController::class, 'index']);
    Route::get('/reviews/latest',           [ReviewApiController::class, 'latest']);
    Route::get('/commits/{commitReview}',   [ReviewApiController::class, 'showCommit']);
    Route::get('/pull-requests/{pullRequest}', [ReviewApiController::class, 'showPullRequest']);
    Route::post('/commits/{commitReview}/re-analyze',      [ReviewApiController::class, 'reAnalyzeCommit']);
    Route::post('/pull-requests/{pullRequest}/re-analyze', [ReviewApiController::class, 'reAnalyzePullRequest']);
});
