<?php

namespace App\Http\Controllers;

use App\Jobs\ProcessPullRequestReview;
use App\Models\PullRequest;
use App\Models\Repository;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class WebhookController extends Controller
{
    /**
     * Receive GitHub PR webhook, verify HMAC signature, persist the PR,
     * and queue the AI review job.
     */
    public function handle(Request $request)
    {
        $payload   = $request->getContent();
        $signature = $request->header('X-Hub-Signature-256');
        $data      = json_decode($payload, true) ?: [];

        $githubRepoId = data_get($data, 'repository.id');
        if (! $githubRepoId) {
            return response()->json(['message' => 'Missing repository id'], 400);
        }

        $repository = Repository::where('github_repo_id', $githubRepoId)->first();
        if (! $repository) {
            return response()->json(['message' => 'Repository not connected'], 404);
        }

        // Verify HMAC-SHA256 signature using a timing-safe comparison.
        $expected = 'sha256='.hash_hmac('sha256', $payload, $repository->webhook_secret);
        if (! is_string($signature) || ! hash_equals($expected, $signature)) {
            Log::warning('Invalid GitHub webhook signature', ['repo' => $repository->full_name]);
            return response()->json(['message' => 'Invalid signature'], 401);
        }

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

        ProcessPullRequestReview::dispatch($pullRequest);

        return response()->json(['message' => 'Review queued', 'pr_id' => $pullRequest->id], 200);
    }
}
