<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\Review;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;

class DataController extends Controller
{
    public function view()
    {
        $user  = Auth::user();
        $token = $user->github_token ?? '';

        return Inertia::render('Security/MyData', [
            'profile' => [
                'name'            => $user->name,
                'email'           => $user->email,
                'github_username' => $user->github_username,
                'github_avatar'   => $user->github_avatar,
                'created_at'      => optional($user->created_at)->format('M d, Y'),
            ],
            'token_preview' => [
                'first_4' => mb_substr($token, 0, 4),
                'last_4'  => mb_substr($token, -4),
                'length'  => mb_strlen($token),
            ],
            'stats' => [
                'connected_repos' => $user->repositories()->count(),
                'total_reviews'   => Review::whereHas(
                    'pullRequest.repository',
                    fn ($q) => $q->where('user_id', $user->id)
                )->count(),
                'audit_events'    => $user->auditLogs()->count(),
            ],
            'repositories' => $user->repositories()
                ->select('full_name', 'created_at', 'is_active', 'review_mode')
                ->get()
                ->map(fn ($r) => [
                    'full_name'    => $r->full_name,
                    'created_at'   => optional($r->created_at)->format('M d, Y'),
                    'is_active'    => (bool) $r->is_active,
                    'review_mode'  => $r->review_mode,
                ]),
        ]);
    }

    /**
     * Permanently delete every PRism record belonging to the authenticated user,
     * uninstalling each webhook from GitHub first. Requires the user to type
     * DELETE as a confirmation.
     */
    public function delete(Request $request)
    {
        $request->validate(['confirm' => 'required|in:DELETE']);

        $user = Auth::user();

        // 1. Uninstall webhooks on GitHub while we still have the token + IDs.
        foreach ($user->repositories as $repo) {
            if (! $repo->webhook_id) continue;
            try {
                Http::withToken($user->github_token)
                    ->timeout(10)
                    ->delete("https://api.github.com/repos/{$repo->full_name}/hooks/{$repo->webhook_id}");
            } catch (\Throwable $e) {
                Log::warning('Failed to uninstall webhook on data deletion', [
                    'repo'  => $repo->full_name,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        // 2. Record the action while the user still exists, then cascade delete.
        AuditLog::record($user->id, 'account_deleted', 'User-initiated full data deletion');

        $userId = $user->id;
        Auth::logout();

        // FK cascades wipe repositories → pull_requests → reviews → review_comments,
        // commit_reviews, and audit_logs.
        \App\Models\User::find($userId)?->delete();

        return redirect('/')->with('success', 'All your data has been permanently deleted.');
    }
}
