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
     * Logs every step so production 500s are diagnosable from Render's log tab.
     */
    public function handleGithubCallback()
    {
        Log::info('[OAuth] Callback hit', [
            'url'      => request()->fullUrl(),
            'has_code' => request()->has('code'),
        ]);

        try {
            $githubUser = Socialite::driver('github')->user();

            Log::info('[OAuth] Got GitHub user', [
                'id'       => $githubUser->getId(),
                'nickname' => $githubUser->getNickname(),
                'email'    => $githubUser->getEmail(),
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

            Log::info('[OAuth] User upserted', ['user_id' => $user->id]);

            Auth::login($user, true);

            Log::info('[OAuth] User logged in, redirecting to dashboard');

            AuditLog::record($user->id, 'login', 'Signed in via GitHub OAuth');

            return redirect()->intended(route('dashboard', absolute: false));
        } catch (Throwable $e) {
            Log::error('[OAuth] FAILED', [
                'message' => $e->getMessage(),
                'class'   => get_class($e),
                'file'    => $e->getFile(),
                'line'    => $e->getLine(),
                'trace'   => collect($e->getTrace())->take(10)->toArray(),
            ]);

            return redirect()->route('login')->withErrors([
                'github' => 'GitHub sign-in failed: '.$e->getMessage(),
            ]);
        }
    }
}
