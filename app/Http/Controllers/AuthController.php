<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Laravel\Socialite\Facades\Socialite;
use Throwable;

class AuthController extends Controller
{
    /**
     * Redirect the user to GitHub's OAuth page.
     * Requests the 'repo' scope so we can install webhooks later.
     */
    public function redirectToGithub()
    {
        return Socialite::driver('github')
            ->scopes(['repo', 'read:user'])
            ->redirect();
    }

    /**
     * Handle the callback from GitHub after OAuth approval.
     * Find or create the user by github_id, then log them in.
     * Wrapped in try/catch so the user lands back on /login with a readable
     * error instead of a generic 500.
     */
    public function handleGithubCallback()
    {
        try {
            Log::info('GitHub callback started');

            $githubUser = Socialite::driver('github')->user();

            Log::info('Got GitHub user', [
                'id'        => $githubUser->getId(),
                'username'  => $githubUser->getNickname(),
                'has_email' => (bool) $githubUser->getEmail(),
            ]);

            $user = User::updateOrCreate(
                ['github_id' => $githubUser->getId()],
                [
                    'name'            => $githubUser->getName() ?? $githubUser->getNickname(),
                    'email'           => $githubUser->getEmail(),
                    'github_token'    => $githubUser->token,
                    'github_avatar'   => $githubUser->getAvatar(),
                    'github_username' => $githubUser->getNickname(),
                ]
            );

            Log::info('User upserted', ['user_id' => $user->id]);

            Auth::login($user);

            AuditLog::record($user->id, 'login', 'Signed in via GitHub OAuth');

            return redirect()->route('dashboard');
        } catch (Throwable $e) {
            Log::error('GitHub OAuth callback failed', [
                'message' => $e->getMessage(),
                'file'    => $e->getFile(),
                'line'    => $e->getLine(),
                'trace'   => $e->getTraceAsString(),
            ]);

            return redirect('/login')->with('error', 'GitHub sign-in failed: '.$e->getMessage());
        }
    }
}
