<?php

namespace App\Http\Controllers;

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
        ]);
    }

    public function update(Request $request)
    {
        $data = $request->validate([
            'email_notifications' => ['required', 'boolean'],
            'slack_webhook_url'   => ['nullable', 'url', 'max:1024'],
        ]);

        Auth::user()->update($data);

        return redirect()->route('settings.index')->with('success', 'Settings saved.');
    }

    /**
     * Send a test message to a candidate Slack webhook so users can verify the
     * URL works before saving. Does not persist anything.
     */
    public function testSlack(Request $request)
    {
        $data = $request->validate([
            'slack_webhook_url' => ['required', 'url', 'max:1024'],
        ]);

        try {
            $response = Http::asJson()->timeout(10)->post($data['slack_webhook_url'], [
                'text' => '✅ PRism test — your webhook is working. You can save your settings now.',
            ]);

            if (! $response->successful()) {
                return back()->with('error', 'Slack rejected the test: '.$response->status().' '.mb_substr($response->body(), 0, 200));
            }

            return back()->with('success', 'Test message sent. Check your Slack channel.');
        } catch (Throwable $e) {
            Log::warning('Slack test failed', ['error' => $e->getMessage()]);
            return back()->with('error', 'Could not reach the webhook: '.$e->getMessage());
        }
    }
}
