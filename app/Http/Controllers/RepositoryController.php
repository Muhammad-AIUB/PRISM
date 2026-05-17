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
    /** Cache TTLs in seconds. */
    private const CACHE_GITHUB_REPOS    = 300;  // 5 minutes
    private const CACHE_CONNECTED_REPOS = 600;  // 10 minutes

    /**
     * Fetch the authenticated user's GitHub repositories and render
     * the Repositories/Index page with them.
     */
    public function index()
    {
        $user = Auth::user();

        // Cache the GitHub API response for 5 minutes — repo list is moderately
        // expensive and changes infrequently.
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

        return Inertia::render('Repositories/Index', [
            'repos'        => $repos,
            'connectedIds' => $connectedIds,
        ]);
    }

    /**
     * Connect a repository: persist it locally and install a GitHub webhook.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'github_repo_id' => ['required', 'integer'],
            'name'           => ['required', 'string'],
            'full_name'      => ['required', 'string'],
        ]);

        $user = Auth::user();
        $webhookSecret = Str::random(40);

        $repository = Repository::create([
            'user_id'        => $user->id,
            'name'           => $data['name'],
            'full_name'      => $data['full_name'],
            'github_repo_id' => $data['github_repo_id'],
            'webhook_secret' => $webhookSecret,
            'is_active'      => true,
        ]);

        $webhookUrl = rtrim((string) config('app.url'), '/').'/webhook/github';
        Log::info('Installing webhook at: '.$webhookUrl, ['repo' => $data['full_name']]);

        $hookResponse = Http::withToken($user->github_token)
            ->acceptJson()
            ->post("https://api.github.com/repos/{$data['full_name']}/hooks", [
                'name'   => 'web',
                'active' => true,
                'events' => ['pull_request'],
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
     * Forget cached repo lists for a user. Called after any connect/disconnect.
     */
    public static function invalidateUserCaches(int $userId): void
    {
        Cache::forget("user_repos_{$userId}");
        Cache::forget("user_connected_repos_{$userId}");
    }
}
