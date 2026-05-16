<?php

namespace App\Http\Controllers;

use App\Models\PullRequest;
use App\Models\Review;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;

class DashboardController extends Controller
{
    /**
     * Render the dashboard with the user's PR review stats and recent activity.
     */
    public function index()
    {
        $user = Auth::user();

        $repoIds = $user->repositories()->pluck('id');

        $totalRepos = $repoIds->count();

        $totalPrs = PullRequest::whereIn('repository_id', $repoIds)->count();

        // Average score across the user's reviews (only completed ones have scores).
        $avgScore = Review::whereHas(
            'pullRequest',
            fn ($q) => $q->whereIn('repository_id', $repoIds)
        )->avg('overall_score');

        $recentPrs = PullRequest::with(['repository:id,name,full_name', 'review:id,pull_request_id,overall_score'])
            ->whereIn('repository_id', $repoIds)
            ->latest()
            ->limit(10)
            ->get()
            ->map(fn (PullRequest $pr) => [
                'id'         => $pr->id,
                'title'      => $pr->title,
                'author'     => $pr->author,
                'status'     => $pr->status,
                'pr_number'  => $pr->pr_number,
                'created_at' => optional($pr->created_at)->toIso8601String(),
                'repository' => [
                    'name'      => $pr->repository?->name,
                    'full_name' => $pr->repository?->full_name,
                ],
                'score'      => $pr->review?->overall_score,
            ]);

        return Inertia::render('Dashboard', [
            'total_repos' => $totalRepos,
            'total_prs'   => $totalPrs,
            'avg_score'   => $avgScore !== null ? round((float) $avgScore, 1) : null,
            'recent_prs'  => $recentPrs,
        ]);
    }
}
