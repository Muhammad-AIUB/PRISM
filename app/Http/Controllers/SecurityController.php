<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;

class SecurityController extends Controller
{
    public function index()
    {
        return Inertia::render('Security/Index', [
            'user'            => Auth::user()?->only(['github_username', 'github_avatar']),
            'github_app_url'  => 'https://github.com/settings/applications',
            'github_repo_url' => 'https://github.com/Muhammad-AIUB/PRISM',
        ]);
    }
}
