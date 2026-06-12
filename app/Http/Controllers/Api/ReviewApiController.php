<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\ProcessCommitReview;
use App\Jobs\ProcessPullRequestReview;
use App\Models\AuditLog;
use App\Models\CommitReview;
use App\Models\PullRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * Token-authenticated REST API (v1) consumed by the PRism MCP server.
 * Every endpoint scopes strictly to repositories owned by the token's user.
 */
class ReviewApiController extends Controller
{
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'name'            => $user->name,
            'github_username' => $user->github_username,
            'repositories'    => $user->repositories()->get(['id', 'name', 'full_name'])->map(fn ($r) => [
                'id'        => $r->id,
                'name'      => $r->name,
                'full_name' => $r->full_name,
            ]),
        ]);
    }

    /**
     * Recent reviews (commits + PRs interleaved, newest first).
     * Optional filters: ?repo=full_name&limit=10
     */
    public function index(Request $request): JsonResponse
    {
        $user  = $request->user();
        $limit = min((int) $request->query('limit', 10), 50);
        $repo  = $request->query('repo');

        $repoIds = $user->repositories()
            ->when($repo, fn ($q) => $q->where('full_name', $repo))
            ->pluck('id');

        $commits = CommitReview::with('repository:id,full_name')
            ->whereIn('repository_id', $repoIds)
            ->latest()->limit($limit)->get()
            ->map(fn ($c) => $this->commitSummary($c));

        $prs = PullRequest::with(['repository:id,full_name', 'review:id,pull_request_id,overall_score,summary'])
            ->whereIn('repository_id', $repoIds)
            ->latest()->limit($limit)->get()
            ->map(fn ($p) => $this->prSummary($p));

        $merged = $commits->concat($prs)
            ->sortByDesc('created_at')
            ->take($limit)
            ->values();

        return response()->json(['reviews' => $merged]);
    }

    /**
     * The single most recent review (commit or PR) — the MCP "what did PRism
     * say about my last push?" call.
     */
    public function latest(Request $request): JsonResponse
    {
        $user    = $request->user();
        $repoIds = $user->repositories()->pluck('id');

        $commit = CommitReview::with('repository:id,full_name')
            ->whereIn('repository_id', $repoIds)->latest()->first();
        $pr = PullRequest::with(['repository:id,full_name', 'review'])
            ->whereIn('repository_id', $repoIds)->latest()->first();

        if (! $commit && ! $pr) {
            return response()->json(['message' => 'No reviews yet'], 404);
        }

        // Whichever is newer wins.
        if ($commit && (! $pr || $commit->created_at->gte($pr->created_at))) {
            return response()->json(['type' => 'commit', 'review' => $this->commitDetail($commit)]);
        }

        return response()->json(['type' => 'pull_request', 'review' => $this->prDetail($pr)]);
    }

    public function showCommit(Request $request, CommitReview $commitReview): JsonResponse
    {
        $this->authorizeOwnership($request, $commitReview->repository?->user_id);

        return response()->json(['review' => $this->commitDetail($commitReview)]);
    }

    public function showPullRequest(Request $request, PullRequest $pullRequest): JsonResponse
    {
        $this->authorizeOwnership($request, $pullRequest->repository?->user_id);

        return response()->json(['review' => $this->prDetail($pullRequest)]);
    }

    public function reAnalyzeCommit(Request $request, CommitReview $commitReview): JsonResponse
    {
        $this->authorizeOwnership($request, $commitReview->repository?->user_id);

        $commitReview->update([
            'status'              => 'analyzing',
            'overall_score'       => null,
            'summary'             => null,
            'security_issues'     => null,
            'performance_issues'  => null,
            'code_quality_issues' => null,
            'suggested_fixes'     => null,
        ]);
        Cache::forget("commit_diff_{$commitReview->repository_id}_{$commitReview->commit_sha}");
        ProcessCommitReview::dispatchAfterResponse($commitReview);

        AuditLog::record($request->user()->id, 'review_reanalyzed',
            "Re-analyzed commit {$commitReview->shortSha()} via API",
            ['commit_review_id' => $commitReview->id, 'source' => 'api']);

        return response()->json(['message' => 'Re-analysis queued', 'id' => $commitReview->id]);
    }

    public function reAnalyzePullRequest(Request $request, PullRequest $pullRequest): JsonResponse
    {
        $this->authorizeOwnership($request, $pullRequest->repository?->user_id);

        $pullRequest->update(['status' => 'analyzing']);
        ProcessPullRequestReview::dispatchAfterResponse($pullRequest);

        AuditLog::record($request->user()->id, 'review_reanalyzed',
            "Re-analyzed PR #{$pullRequest->pr_number} via API",
            ['pull_request_id' => $pullRequest->id, 'source' => 'api']);

        return response()->json(['message' => 'Re-analysis queued', 'id' => $pullRequest->id]);
    }

    // ── Shapers ──────────────────────────────────────────────────────────

    protected function authorizeOwnership(Request $request, ?int $ownerId): void
    {
        abort_unless($ownerId === $request->user()->id, 403, 'Not your repository');
    }

    protected function commitSummary(CommitReview $c): array
    {
        return [
            'type'           => 'commit',
            'id'             => $c->id,
            'repository'     => $c->repository?->full_name,
            'commit_sha'     => $c->shortSha(),
            'commit_message' => $c->commit_message,
            'branch'         => $c->branch,
            'status'         => $c->status,
            'overall_score'  => $c->overall_score,
            'created_at'     => optional($c->created_at)->toIso8601String(),
        ];
    }

    protected function prSummary(PullRequest $p): array
    {
        return [
            'type'          => 'pull_request',
            'id'            => $p->id,
            'repository'    => $p->repository?->full_name,
            'pr_number'     => $p->pr_number,
            'title'         => $p->title,
            'status'        => $p->status,
            'overall_score' => $p->review?->overall_score,
            'created_at'    => optional($p->created_at)->toIso8601String(),
        ];
    }

    protected function commitDetail(CommitReview $c): array
    {
        return $this->commitSummary($c) + [
            'commit_sha_full'     => $c->commit_sha,
            'author'              => $c->author,
            'summary'             => $c->summary,
            'security_issues'     => $c->security_issues     ?? [],
            'performance_issues'  => $c->performance_issues  ?? [],
            'code_quality_issues' => $c->code_quality_issues ?? [],
            'suggested_fixes'     => data_get($c->suggested_fixes, 'fixes', []),
            'detected_languages'  => $c->detected_languages  ?? [],
            'ai_model_used'       => $c->ai_model_used,
        ];
    }

    protected function prDetail(PullRequest $p): array
    {
        $r = $p->review;

        return $this->prSummary($p) + [
            'author'              => $p->author,
            'base_branch'         => $p->base_branch,
            'head_branch'         => $p->head_branch,
            'summary'             => $r?->summary,
            'security_issues'     => $r?->security_issues     ?? [],
            'performance_issues'  => $r?->performance_issues  ?? [],
            'code_quality_issues' => $r?->code_quality_issues ?? [],
            'suggested_fixes'     => data_get($r?->suggested_fixes, 'fixes', []),
            'detected_languages'  => $p->detected_languages   ?? [],
            'ai_model_used'       => $r?->ai_model_used,
        ];
    }
}
