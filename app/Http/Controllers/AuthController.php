<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Laravel\Socialite\Facades\Socialite;

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
     */
    public function handleGithubCallback()
    {
        $githubUser = Socialite::driver('github')->user();

        $user = User::updateOrCreate(
            [
                'github_id' => $githubUser->getId(),
            ],
            [
                'name'            => $githubUser->getName() ?? $githubUser->getNickname(),
                'email'           => $githubUser->getEmail(),
                'github_token'    => $githubUser->token,
                'github_avatar'   => $githubUser->getAvatar(),
                'github_username' => $githubUser->getNickname(),
            ]
        );

        Auth::login($user);

        return redirect('/dashboard');
    }
}
