<?php

namespace App\Http\Controllers;

use App\Models\PullRequest;
use App\Models\Review;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;

class DashboardController extends Controller
{
    public function index()
    {
        $user = Auth::user();
        $repoIds = $user->repositories()->pluck('id');

        $totalRepos = $repoIds->count();
        $totalPrs   = PullRequest::whereIn('repository_id', $repoIds)->count();

        $avgScore = Review::whereHas(
            'pullRequest',
            fn ($q) => $q->whereIn('repository_id', $repoIds)
        )->avg('overall_score');

        $recentPrs = PullRequest::query()
            ->select(['id', 'repository_id', 'pr_number', 'title', 'author', 'status', 'created_at'])
            ->with([
                'repository:id,name,full_name',
                'review:id,pull_request_id,overall_score',
            ])
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

        // Score timeline — every scored PR for the user, ordered by date.
        $timeline = Review::query()
            ->select(['id', 'pull_request_id', 'overall_score', 'created_at'])
            ->with('pullRequest:id,repository_id,pr_number')
            ->whereNotNull('overall_score')
            ->whereHas('pullRequest', fn ($q) => $q->whereIn('repository_id', $repoIds))
            ->orderBy('created_at')
            ->limit(50)
            ->get()
            ->map(fn (Review $r) => [
                'date'  => optional($r->created_at)->toIso8601String(),
                'score' => $r->overall_score,
                'pr'    => '#'.($r->pullRequest?->pr_number ?? '?'),
            ])
            ->values();

        return Inertia::render('Dashboard', [
            'total_repos' => $totalRepos,
            'total_prs'   => $totalPrs,
            'avg_score'   => $avgScore !== null ? round((float) $avgScore, 1) : null,
            'recent_prs'  => $recentPrs,
            'timeline'    => $timeline,
        ]);
    }
}
