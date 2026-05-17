<?php

namespace App\Http\Controllers;

use App\Models\CommitReview;
use Illuminate\Support\Facades\Auth;
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
}
