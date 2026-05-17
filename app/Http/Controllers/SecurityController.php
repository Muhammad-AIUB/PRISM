<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;

class SecurityController extends Controller
{
    /**
     * Public-by-design: visitors can read the trust content before signing in.
     * Renders differently for authenticated vs anonymous users — the page
     * itself decides which layout to use based on `is_authenticated`.
     */
    public function index()
    {
        return Inertia::render('Security/Index', [
            'user'             => Auth::check() ? Auth::user()->only(['github_username', 'github_avatar']) : null,
            'is_authenticated' => Auth::check(),
            'github_app_url'   => 'https://github.com/settings/applications',
            'github_repo_url'  => 'https://github.com/Muhammad-AIUB/PRISM',
        ]);
    }
}
