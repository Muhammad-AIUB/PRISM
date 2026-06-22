<?php

namespace App\Http\Controllers;

use App\Jobs\ProcessPullRequestReview;
use App\Models\AuditLog;
use App\Models\PullRequest;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
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
     * Re-analyze the PR: drop the existing review + comments, clear the cached
     * diff, and dispatch a fresh review job. The UI will show "analyzing"
     * while the queue worker picks the job back up.
     */
    public function reAnalyze(PullRequest $pullRequest)
    {
        $this->authorisePr($pullRequest);

        $pullRequest->update(['status' => 'analyzing']);

        // Delete prior review row + comments so the page reflects in-flight state.
        if ($pullRequest->review) {
            $pullRequest->review->comments()->delete();
            $pullRequest->review->delete();
        }

        // Clear cached diff. The job's cache key is composite (sha + updated_at);
        // bumping the PR's status above already invalidates the composite key
        // by changing updated_at, but we forget the simple key too so manually
        // primed caches don't leak.
        Cache::forget("pr_diff_{$pullRequest->id}");

        // Queue so the user gets an instant "Re-analyzing PR…" redirect while
        // the AI job runs in the dedicated worker process.
        ProcessPullRequestReview::dispatch($pullRequest);

        AuditLog::record(Auth::id(), 'review_reanalyzed',
            "Re-analyzed PR #{$pullRequest->pr_number} on {$pullRequest->repository?->full_name}",
            ['pull_request_id' => $pullRequest->id]);

        return redirect()->back()->with('success', 'Re-analyzing PR…');
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
     * Generate and download a PDF of the review.
     */
    public function exportPdf(PullRequest $pullRequest)
    {
        $this->authorisePr($pullRequest);
        $pullRequest->load(['repository', 'review.comments']);

        $pdf = Pdf::loadView('pdf.review', [
            'pr'     => $pullRequest,
            'review' => $pullRequest->review,
        ]);

        AuditLog::record(Auth::id(), 'data_exported',
            "Exported PDF for PR #{$pullRequest->pr_number} on {$pullRequest->repository?->full_name}",
            ['pull_request_id' => $pullRequest->id]);

        return $pdf->download("PRism-Review-PR{$pullRequest->pr_number}.pdf");
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
            'status'             => $pr->status,
            'diff_url'           => $pr->diff_url,
            'detected_languages' => $pr->detected_languages ?? [],
            'created_at'         => optional($pr->created_at)->toIso8601String(),
            'repository'         => [
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
