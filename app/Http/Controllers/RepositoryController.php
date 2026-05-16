<?php

namespace App\Http\Controllers;

use App\Models\Repository;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Inertia\Inertia;

class RepositoryController extends Controller
{
    /**
     * Fetch the authenticated user's GitHub repositories and render
     * the Repositories/Index page with them.
     */
    public function index()
    {
        $user = Auth::user();

        $response = Http::withToken($user->github_token)
            ->acceptJson()
            ->get('https://api.github.com/user/repos', [
                'per_page' => 100,
                'sort'     => 'updated',
            ]);

        $repos = $response->successful() ? $response->json() : [];

        // Mark which repos the user has already connected so the UI can hide the button.
        $connectedIds = Repository::where('user_id', $user->id)
            ->pluck('github_repo_id')
            ->all();

        return Inertia::render('Repositories/Index', [
            'repos'        => $repos,
            'connectedIds' => $connectedIds,
        ]);
    }

    /**
     * Connect a repository: persist it locally and install a GitHub webhook
     * so we get notified about pull-request events.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'github_repo_id' => ['required', 'integer'],
            'name'           => ['required', 'string'],
            'full_name'      => ['required', 'string'],
        ]);

        $user = Auth::user();

        // Generate a random secret used to verify webhook payloads later.
        $webhookSecret = Str::random(40);

        $repository = Repository::create([
            'user_id'        => $user->id,
            'name'           => $data['name'],
            'full_name'      => $data['full_name'],
            'github_repo_id' => $data['github_repo_id'],
            'webhook_secret' => $webhookSecret,
            'is_active'      => true,
        ]);

        // Install the webhook on GitHub.
        $hookResponse = Http::withToken($user->github_token)
            ->acceptJson()
            ->post("https://api.github.com/repos/{$data['full_name']}/hooks", [
                'name'   => 'web',
                'active' => true,
                'events' => ['pull_request'],
                'config' => [
                    'url'          => url('/webhook/github'),
                    'content_type' => 'json',
                    'secret'       => $webhookSecret,
                ],
            ]);

        if ($hookResponse->successful()) {
            $repository->update([
                'webhook_id' => $hookResponse->json('id'),
            ]);

            return redirect()
                ->route('repositories.index')
                ->with('success', "Connected {$data['full_name']} successfully.");
        }

        // If webhook installation failed, roll back the local record so the user can retry.
        $repository->delete();

        return redirect()
            ->route('repositories.index')
            ->with('error', 'Failed to install webhook: '.$hookResponse->json('message', 'Unknown error'));
    }
}
