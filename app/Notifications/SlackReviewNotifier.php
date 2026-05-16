<?php

namespace App\Notifications;

use App\Models\PullRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class SlackReviewNotifier
{
    /**
     * Send a Slack webhook notification for a completed review.
     * Quietly returns if SLACK_WEBHOOK_URL is unset.
     */
    public static function send(PullRequest $pr): void
    {
        $url = config('services.slack_webhook.url');
        if (! $url) return;

        $review = $pr->review;
        $score  = $review?->overall_score ?? 'N/A';
        $repo   = $pr->repository?->full_name ?? '?';

        // Top 3 issues across all layers, prioritised by severity.
        $rank = ['critical' => 0, 'warning' => 1, 'suggestion' => 2];
        $all = collect()
            ->merge(($review->security_issues     ?? []))
            ->merge(($review->performance_issues  ?? []))
            ->merge(($review->code_quality_issues ?? []))
            ->sortBy(fn ($i) => $rank[$i['severity'] ?? 'suggestion'] ?? 3)
            ->take(3);

        $issuesText = $all->isEmpty()
            ? '_No issues detected._'
            : $all->map(fn ($i) =>
                '• *['.strtoupper($i['severity'] ?? 'suggestion').']* '
                .($i['file'] ?? '?').($i['line'] ? ':'.$i['line'] : '')
                .' — '.($i['comment'] ?? '')
            )->implode("\n");

        $payload = [
            'text'   => "PRism review complete · {$repo} #{$pr->pr_number}",
            'blocks' => [
                [
                    'type' => 'header',
                    'text' => ['type' => 'plain_text', 'text' => "🔍 PRism Review — {$score}/100"],
                ],
                [
                    'type' => 'section',
                    'text' => [
                        'type' => 'mrkdwn',
                        'text' => "*<".url('/reviews/'.$pr->id)."|{$pr->title}>*\n`{$repo}` · PR #{$pr->pr_number} by *{$pr->author}*",
                    ],
                ],
                [
                    'type' => 'section',
                    'text' => ['type' => 'mrkdwn', 'text' => "*Top issues:*\n".$issuesText],
                ],
            ],
        ];

        try {
            Http::asJson()->timeout(10)->post($url, $payload);
        } catch (Throwable $e) {
            Log::warning('Slack webhook failed', ['error' => $e->getMessage()]);
        }
    }
}
