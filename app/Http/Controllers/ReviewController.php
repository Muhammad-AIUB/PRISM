<?php

namespace App\Http\Controllers;

use App\Models\PullRequest;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;

class ReviewController extends Controller
{
    /**
     * Show the AI review for a specific pull request.
     * Authorises that the PR belongs to one of the user's repositories.
     */
    public function show(PullRequest $pullRequest)
    {
        $pullRequest->load(['repository', 'review.comments']);

        abort_unless(
            $pullRequest->repository && $pullRequest->repository->user_id === Auth::id(),
            403
        );

        $review = $pullRequest->review;

        return Inertia::render('Reviews/Show', [
            'pullRequest' => [
                'id'          => $pullRequest->id,
                'title'       => $pullRequest->title,
                'author'      => $pullRequest->author,
                'pr_number'   => $pullRequest->pr_number,
                'base_branch' => $pullRequest->base_branch,
                'head_branch' => $pullRequest->head_branch,
                'status'      => $pullRequest->status,
                'diff_url'    => $pullRequest->diff_url,
                'created_at'  => optional($pullRequest->created_at)->toIso8601String(),
                'repository'  => [
                    'name'      => $pullRequest->repository?->name,
                    'full_name' => $pullRequest->repository?->full_name,
                ],
            ],
            'review' => $review ? [
                'id'                  => $review->id,
                'overall_score'       => $review->overall_score,
                'summary'             => $review->summary,
                'ai_model_used'       => $review->ai_model_used,
                'security_issues'     => $review->security_issues     ?? [],
                'performance_issues'  => $review->performance_issues  ?? [],
                'code_quality_issues' => $review->code_quality_issues ?? [],
                'comments'            => $review->comments->map(fn ($c) => [
                    'id'          => $c->id,
                    'file_path'   => $c->file_path,
                    'line_number' => $c->line_number,
                    'layer'       => $c->layer,
                    'severity'    => $c->severity,
                    'comment'     => $c->comment,
                ]),
            ] : null,
        ]);
    }
}
