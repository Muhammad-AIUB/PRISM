<?php

namespace App\Http\Controllers;

use App\Jobs\ProcessCommitReview;
use App\Models\AuditLog;
use App\Models\CommitReview;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Inertia\Inertia;

class CommitReviewController extends Controller
{
    public function show(CommitReview $commitReview)
    {
        $commitReview->load('repository');

        abort_unless(
            $commitReview->repository && $commitReview->repository->user_id === Auth::id(),
            403
        );

        $cr = $commitReview;

        return Inertia::render('Reviews/CommitShow', [
            'commitReview' => [
                'id'                  => $cr->id,
                'commit_sha'          => $cr->commit_sha,
                'short_sha'           => $cr->shortSha(),
                'commit_message'      => $cr->commit_message,
                'author'              => $cr->author,
                'branch'              => $cr->branch,
                'status'              => $cr->status,
                'overall_score'       => $cr->overall_score,
                'summary'             => $cr->summary,
                'security_issues'     => $cr->security_issues     ?? [],
                'performance_issues'  => $cr->performance_issues  ?? [],
                'code_quality_issues' => $cr->code_quality_issues ?? [],
                'suggested_fixes'     => $cr->suggested_fixes,
                'detected_languages'  => $cr->detected_languages  ?? [],
                'ai_model_used'       => $cr->ai_model_used,
                'created_at'          => optional($cr->created_at)->toIso8601String(),
                'repository'          => [
                    'name'      => $cr->repository?->name,
                    'full_name' => $cr->repository?->full_name,
                ],
                'github_url'          => $cr->repository
                    ? "https://github.com/{$cr->repository->full_name}/commit/{$cr->commit_sha}"
                    : null,
            ],
        ]);
    }

    /**
     * Re-run the AI review for a commit. Wipes previous result and dispatches
     * a fresh ProcessCommitReview after the response is sent.
     */
    public function reAnalyze(CommitReview $commitReview)
    {
        $commitReview->load('repository');

        abort_unless(
            $commitReview->repository && $commitReview->repository->user_id === Auth::id(),
            403
        );

        $commitReview->update([
            'status'              => 'analyzing',
            'overall_score'       => null,
            'summary'             => null,
            'security_issues'     => null,
            'performance_issues'  => null,
            'code_quality_issues' => null,
            'suggested_fixes'     => null,
        ]);

        // Force a fresh diff fetch on retry.
        Cache::forget("commit_diff_{$commitReview->repository_id}_{$commitReview->commit_sha}");

        ProcessCommitReview::dispatchAfterResponse($commitReview);

        AuditLog::record(
            Auth::id(),
            'review_reanalyzed',
            "Re-analyzed commit {$commitReview->shortSha()} on {$commitReview->repository?->full_name}",
            ['commit_review_id' => $commitReview->id]
        );

        return redirect()->back()->with('success', 'Re-analyzing commit…');
    }
}
