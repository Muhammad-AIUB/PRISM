<?php

namespace App\Http\Controllers;

use App\Jobs\ProcessPullRequestReview;
use App\Models\PullRequest;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Inertia\Inertia;

class ReviewController extends Controller
{
    /**
     * Show the AI review for a specific pull request.
     */
    public function show(PullRequest $pullRequest)
    {
        $this->authorisePr($pullRequest);
        $pullRequest->load(['repository', 'review.comments']);

        return Inertia::render('Reviews/Show', [
            'pullRequest' => $this->prPayload($pullRequest),
            'review'      => $this->reviewPayload($pullRequest->review),
        ]);
    }

    /**
     * Re-analyze the PR: re-dispatch the review job. The job uses
     * updateOrCreate so the existing review record is overwritten.
     */
    public function reanalyze(PullRequest $pullRequest)
    {
        $this->authorisePr($pullRequest);

        $pullRequest->update(['status' => 'pending']);
        ProcessPullRequestReview::dispatch($pullRequest);

        return back()->with('success', 'Re-analysis queued. The page will update once it completes.');
    }

    /**
     * Proxy the GitHub diff so the browser can render it.
     */
    public function diff(PullRequest $pullRequest)
    {
        $this->authorisePr($pullRequest);
        $repo = $pullRequest->repository;
        $user = $repo->user;

        $response = Http::withToken($user->github_token)
            ->withHeaders(['Accept' => 'application/vnd.github.v3.diff'])
            ->get("https://api.github.com/repos/{$repo->full_name}/pulls/{$pullRequest->pr_number}");

        return response($response->body(), $response->status())
            ->header('Content-Type', 'text/plain; charset=utf-8');
    }

    /**
     * Generate a PDF of the review.
     */
    public function pdf(PullRequest $pullRequest)
    {
        $this->authorisePr($pullRequest);
        $pullRequest->load(['repository', 'review.comments']);

        $pdf = Pdf::loadView('pdf.review', [
            'pr'     => $pullRequest,
            'review' => $pullRequest->review,
        ]);

        $filename = "prism-review-pr{$pullRequest->pr_number}.pdf";
        return $pdf->stream($filename);
    }

    protected function authorisePr(PullRequest $pr): void
    {
        $pr->loadMissing('repository');
        abort_unless(
            $pr->repository && $pr->repository->user_id === Auth::id(),
            403
        );
    }

    protected function prPayload(PullRequest $pr): array
    {
        return [
            'id'          => $pr->id,
            'title'       => $pr->title,
            'author'      => $pr->author,
            'pr_number'   => $pr->pr_number,
            'base_branch' => $pr->base_branch,
            'head_branch' => $pr->head_branch,
            'status'      => $pr->status,
            'diff_url'    => $pr->diff_url,
            'created_at'  => optional($pr->created_at)->toIso8601String(),
            'repository'  => [
                'name'      => $pr->repository?->name,
                'full_name' => $pr->repository?->full_name,
            ],
        ];
    }

    protected function reviewPayload($review): ?array
    {
        if (! $review) return null;

        return [
            'id'                  => $review->id,
            'overall_score'       => $review->overall_score,
            'summary'             => $review->summary,
            'ai_model_used'       => $review->ai_model_used,
            'security_issues'     => $review->security_issues     ?? [],
            'performance_issues'  => $review->performance_issues  ?? [],
            'code_quality_issues' => $review->code_quality_issues ?? [],
            'suggested_fixes'     => $review->suggested_fixes,
            'comments'            => $review->comments->map(fn ($c) => [
                'id'          => $c->id,
                'file_path'   => $c->file_path,
                'line_number' => $c->line_number,
                'layer'       => $c->layer,
                'severity'    => $c->severity,
                'comment'     => $c->comment,
            ]),
        ];
    }
}
