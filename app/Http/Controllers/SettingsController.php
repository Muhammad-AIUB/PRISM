<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Throwable;

class SettingsController extends Controller
{
    public function index()
    {
        $user = Auth::user();
        return Inertia::render('Settings/Index', [
            'user' => [
                'name'                => $user->name,
                'email'               => $user->email,
                'github_username'     => $user->github_username,
                'github_avatar'       => $user->github_avatar,
                'email_notifications' => (bool) $user->email_notifications,
                'slack_webhook_url'   => $user->slack_webhook_url,
            ],
            'api_tokens' => $user->tokens()->get(['id', 'name', 'last_used_at', 'created_at'])->map(fn ($t) => [
                'id'           => $t->id,
                'name'         => $t->name,
                'last_used_at' => optional($t->last_used_at)->toIso8601String(),
                'created_at'   => optional($t->created_at)->toIso8601String(),
            ]),
            // One-time plaintext token after generation (never retrievable again).
            'new_api_token' => session('new_api_token'),
        ]);
    }

    /**
     * Issue a new API token (for the MCP server or other integrations).
     * The plaintext value is flashed to the session and shown exactly once.
     */
    public function createApiToken(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:64',
        ]);

        $token = Auth::user()->createToken($data['name']);

        AuditLog::record(Auth::id(), 'api_token_created', "Created API token \"{$data['name']}\"");

        return redirect()->back()
            ->with('success', 'API token created — copy it now, it will not be shown again.')
            ->with('new_api_token', $token->plainTextToken);
    }

    public function revokeApiToken(int $tokenId)
    {
        Auth::user()->tokens()->where('id', $tokenId)->delete();

        AuditLog::record(Auth::id(), 'api_token_revoked', 'Revoked an API token', ['token_id' => $tokenId]);

        return redirect()->back()->with('success', 'API token revoked');
    }

    public function update(Request $request)
    {
        $data = $request->validate([
            'email_notifications' => 'boolean',
            'slack_webhook_url'   => 'nullable|url|starts_with:https://hooks.slack.com/',
        ]);

        Auth::user()->update($data);

        AuditLog::record(Auth::id(), 'settings_updated', 'Updated notification preferences', [
            'email_notifications' => $data['email_notifications'] ?? null,
            'has_slack_webhook'   => ! empty($data['slack_webhook_url']),
        ]);

        return redirect()->back()->with('success', 'Settings updated successfully');
    }

    /**
     * Send a test message to a candidate Slack webhook so users can verify the
     * URL works before saving. Does not persist anything.
     */
    public function testSlack(Request $request)
    {
        $data = $request->validate([
            'slack_webhook_url' => 'required|url|starts_with:https://hooks.slack.com/',
        ]);

        try {
            $response = Http::post($data['slack_webhook_url'], [
                'text' => '✅ PRism test notification - your Slack integration is working!',
            ]);

            if ($response->successful()) {
                return back()->with('success', 'Test message sent to Slack!');
            }
            return back()->with('error', 'Slack returned: '.$response->body());
        } catch (Throwable $e) {
            Log::warning('Slack test failed', ['error' => $e->getMessage()]);
            return back()->with('error', 'Failed: '.$e->getMessage());
        }
    }
}
