<?php

namespace App\Http\Controllers;

use App\Jobs\ProcessCommitReview;
use App\Jobs\ProcessPullRequestReview;
use App\Models\CommitReview;
use App\Models\PullRequest;
use App\Models\Repository;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class WebhookController extends Controller
{
    /**
     * Receive GitHub webhook, verify HMAC, then dispatch the right review job
     * based on the X-GitHub-Event header.
     */
    public function handle(Request $request)
    {
        $payload    = $request->getContent();
        $signature  = $request->header('X-Hub-Signature-256');
        $deliveryId = $request->header('X-GitHub-Delivery');
        $event      = $request->header('X-GitHub-Event');
        $data       = json_decode($payload, true) ?: [];

        Log::info('webhook_received', [
            'delivery_id' => $deliveryId,
            'event'       => $event,
            'action'      => data_get($data, 'action'),
            'repo_id'     => data_get($data, 'repository.id'),
        ]);

        $githubRepoId = data_get($data, 'repository.id');
        if (! $githubRepoId) {
            return response()->json(['message' => 'Missing repository id'], 400);
        }

        $repository = Repository::where('github_repo_id', $githubRepoId)->first();
        if (! $repository) {
            return response()->json(['message' => 'Repository not connected'], 404);
        }

        // HMAC-SHA256 verify (timing-safe).
        $expected = 'sha256='.hash_hmac('sha256', $payload, $repository->webhook_secret);
        if (! is_string($signature) || ! hash_equals($expected, $signature)) {
            Log::warning('Invalid GitHub webhook signature', ['repo' => $repository->full_name]);
            return response()->json(['message' => 'Invalid signature'], 401);
        }

        return match ($event) {
            'pull_request' => $this->handlePullRequest($repository, $data),
            'push'         => $this->handlePush($repository, $data),
            'ping'         => response()->json(['message' => 'pong'], 200),
            default        => response()->json(['message' => 'Ignored event: '.$event], 200),
        };
    }

    protected function handlePullRequest(Repository $repository, array $data)
    {
        $action = data_get($data, 'action');
        if (! in_array($action, ['opened', 'synchronize'], true)) {
            return response()->json(['message' => 'Ignored action: '.$action], 200);
        }

        $pr = data_get($data, 'pull_request');
        $pullRequest = PullRequest::updateOrCreate(
            [
                'repository_id' => $repository->id,
                'github_pr_id'  => data_get($pr, 'id'),
            ],
            [
                'pr_number'   => data_get($pr, 'number'),
                'title'       => data_get($pr, 'title'),
                'author'      => data_get($pr, 'user.login'),
                'base_branch' => data_get($pr, 'base.ref'),
                'head_branch' => data_get($pr, 'head.ref'),
                'status'      => 'pending',
                'diff_url'    => data_get($pr, 'diff_url'),
            ]
        );

        // dispatchAfterResponse so the AI call doesn't keep GitHub's webhook
        // waiting (10s timeout) and doesn't fail the webhook with the job.
        ProcessPullRequestReview::dispatchAfterResponse($pullRequest);

        return response()->json(['message' => 'Review queued', 'pr_id' => $pullRequest->id], 200);
    }

    /**
     * Push event: dispatch one ProcessCommitReview per head commit, but only
     * on branches the repository owner asked us to watch.
     */
    protected function handlePush(Repository $repository, array $data)
    {
        $ref    = (string) data_get($data, 'ref', '');             // e.g. "refs/heads/main"
        $branch = preg_replace('#^refs/heads/#', '', $ref);

        if ($repository->review_mode === 'pr_only') {
            return response()->json(['message' => 'Repository set to PR-only mode'], 200);
        }

        if (! in_array($branch, $repository->watchedBranches(), true)) {
            return response()->json(['message' => 'Branch not watched: '.$branch], 200);
        }

        // Skip branch creation / deletion pushes (no commits to review).
        if (data_get($data, 'deleted') === true) {
            return response()->json(['message' => 'Branch deleted, skipping'], 200);
        }

        $headSha = data_get($data, 'after');
        if (! $headSha || $headSha === str_repeat('0', 40)) {
            return response()->json(['message' => 'No head commit'], 200);
        }

        // We review the head commit of the push; if a developer pushed several
        // commits at once, the head represents the cumulative state.
        $headCommit = collect(data_get($data, 'commits', []))
            ->firstWhere('id', $headSha) ?? data_get($data, 'head_commit');

        $review = CommitReview::firstOrCreate(
            ['repository_id' => $repository->id, 'commit_sha' => $headSha],
            [
                'branch'         => $branch,
                'commit_message' => data_get($headCommit, 'message'),
                'author'         => data_get($headCommit, 'author.username')
                                 ?? data_get($headCommit, 'author.name')
                                 ?? data_get($data, 'pusher.name'),
                'status'         => 'pending',
            ]
        );

        // dispatchAfterResponse so the AI call doesn't keep GitHub's webhook
        // waiting and doesn't fail the webhook with the job.
        ProcessCommitReview::dispatchAfterResponse($review);

        return response()->json(['message' => 'Commit review queued', 'review_id' => $review->id], 200);
    }
}
