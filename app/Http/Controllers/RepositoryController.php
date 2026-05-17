<?php

namespace App\Http\Controllers;

use App\Models\Repository;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Inertia\Inertia;

class RepositoryController extends Controller
{
    private const CACHE_GITHUB_REPOS    = 300;
    private const CACHE_CONNECTED_REPOS = 600;

    /**
     * Fetch the authenticated user's GitHub repositories and render the index.
     */
    public function index()
    {
        $user = Auth::user();

        $repos = Cache::remember(
            "user_repos_{$user->id}",
            self::CACHE_GITHUB_REPOS,
            function () use ($user) {
                $response = Http::withToken($user->github_token)
                    ->acceptJson()
                    ->get('https://api.github.com/user/repos', [
                        'per_page' => 100,
                        'sort'     => 'updated',
                    ]);
                return $response->successful() ? $response->json() : [];
            }
        );

        $connectedIds = Cache::remember(
            "user_connected_repos_{$user->id}",
            self::CACHE_CONNECTED_REPOS,
            fn () => Repository::where('user_id', $user->id)->pluck('github_repo_id')->all()
        );

        $connectedRepos = Repository::where('user_id', $user->id)
            ->get(['id', 'github_repo_id', 'full_name', 'review_mode', 'review_branches'])
            ->keyBy('github_repo_id');

        return Inertia::render('Repositories/Index', [
            'repos'           => $repos,
            'connectedIds'    => $connectedIds,
            'connectedRepos'  => $connectedRepos,
            'reviewModes'     => Repository::REVIEW_MODES,
        ]);
    }

    /**
     * Connect a repository: persist it locally, install the GitHub webhook
     * subscribing to the events implied by the chosen review_mode.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'github_repo_id'    => ['required', 'integer'],
            'name'              => ['required', 'string'],
            'full_name'         => ['required', 'string'],
            'review_mode'       => ['nullable', 'in:pr_only,commit_only,both'],
            'review_branches'   => ['nullable', 'array'],
            'review_branches.*' => ['string', 'max:255'],
        ]);

        $user           = Auth::user();
        $webhookSecret  = Str::random(40);
        $reviewMode     = $data['review_mode']     ?? 'pr_only';
        $reviewBranches = $data['review_branches'] ?? ['main', 'master'];

        $repository = Repository::create([
            'user_id'         => $user->id,
            'name'            => $data['name'],
            'full_name'       => $data['full_name'],
            'github_repo_id'  => $data['github_repo_id'],
            'webhook_secret'  => $webhookSecret,
            'is_active'       => true,
            'review_mode'     => $reviewMode,
            'review_branches' => $reviewBranches,
        ]);

        $webhookUrl = rtrim((string) config('app.url'), '/').'/webhook/github';
        Log::info('Installing webhook', ['repo' => $data['full_name'], 'events' => $repository->webhookEvents()]);

        $hookResponse = Http::withToken($user->github_token)
            ->acceptJson()
            ->post("https://api.github.com/repos/{$data['full_name']}/hooks", [
                'name'   => 'web',
                'active' => true,
                'events' => $repository->webhookEvents(),
                'config' => [
                    'url'          => $webhookUrl,
                    'content_type' => 'json',
                    'secret'       => $webhookSecret,
                ],
            ]);

        if ($hookResponse->successful()) {
            $repository->update(['webhook_id' => $hookResponse->json('id')]);
            $this->invalidateUserCaches($user->id);

            return redirect()
                ->route('repositories.index')
                ->with('success', "Connected {$data['full_name']} successfully.");
        }

        $repository->delete();
        $this->invalidateUserCaches($user->id);

        return redirect()
            ->route('repositories.index')
            ->with('error', 'Failed to install webhook: '.$hookResponse->json('message', 'Unknown error'));
    }

    /**
     * Show the settings page for a single connected repository.
     */
    public function settings(Repository $repository)
    {
        $this->authorise($repository);

        return Inertia::render('Repositories/Settings', [
            'repository' => [
                'id'              => $repository->id,
                'name'            => $repository->name,
                'full_name'       => $repository->full_name,
                'review_mode'     => $repository->review_mode,
                'review_branches' => $repository->watchedBranches(),
            ],
            'reviewModes' => Repository::REVIEW_MODES,
        ]);
    }

    /**
     * Update review mode and watched branches; patch the GitHub webhook so
     * its event subscriptions match the new mode.
     */
    public function update(Request $request, Repository $repository)
    {
        $this->authorise($repository);

        $data = $request->validate([
            'review_mode'       => ['required', 'in:pr_only,commit_only,both'],
            'review_branches'   => ['nullable', 'array'],
            'review_branches.*' => ['string', 'max:255'],
        ]);

        $repository->update([
            'review_mode'     => $data['review_mode'],
            'review_branches' => $data['review_branches'] ?? ['main', 'master'],
        ]);

        // Sync the webhook on GitHub so new events flow in.
        if ($repository->webhook_id) {
            try {
                $response = Http::withToken(Auth::user()->github_token)
                    ->acceptJson()
                    ->patch("https://api.github.com/repos/{$repository->full_name}/hooks/{$repository->webhook_id}", [
                        'events' => $repository->webhookEvents(),
                        'active' => true,
                    ]);
                if (! $response->successful()) {
                    Log::warning('GitHub webhook patch failed', [
                        'repo'   => $repository->full_name,
                        'status' => $response->status(),
                        'body'   => mb_substr($response->body(), 0, 300),
                    ]);
                }
            } catch (\Throwable $e) {
                Log::warning('GitHub webhook patch threw', ['error' => $e->getMessage()]);
            }
        }

        return redirect()
            ->route('repositories.settings', $repository)
            ->with('success', 'Repository settings updated.');
    }

    protected function authorise(Repository $repository): void
    {
        abort_unless($repository->user_id === Auth::id(), 403);
    }

    public static function invalidateUserCaches(int $userId): void
    {
        Cache::forget("user_repos_{$userId}");
        Cache::forget("user_connected_repos_{$userId}");
    }
}
