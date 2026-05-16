<?php

namespace App\Jobs;

use App\Models\PullRequest;
use App\Models\Review;
use App\Models\ReviewComment;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class ProcessPullRequestReview implements ShouldQueue
{
    use Queueable;

    public int $timeout = 180;
    public int $tries   = 1;

    public function __construct(public PullRequest $pullRequest)
    {
    }

    public function handle(): void
    {
        $pr         = $this->pullRequest->fresh();
        $repository = $pr->repository;
        $user       = $repository->user;

        try {
            $pr->update(['status' => 'analyzing']);

            // 1. Fetch the unified diff from GitHub.
            $diffResponse = Http::withToken($user->github_token)
                ->withHeaders(['Accept' => 'application/vnd.github.v3.diff'])
                ->get("https://api.github.com/repos/{$repository->full_name}/pulls/{$pr->pr_number}");

            if (! $diffResponse->successful()) {
                throw new \RuntimeException('Failed to fetch diff: '.$diffResponse->status());
            }

            $diff = mb_substr($diffResponse->body(), 0, 8000);

            // 2. Ask OpenRouter for a structured review.
            $model = 'mistralai/mistral-7b-instruct:free';

            $systemPrompt = <<<'PROMPT'
You are a senior software engineer reviewing a pull request.
Analyze the diff and return ONLY a valid JSON object with this exact structure:
{
  "security_issues": [{"file": "", "line": 0, "severity": "", "comment": ""}],
  "performance_issues": [{"file": "", "line": 0, "severity": "", "comment": ""}],
  "code_quality_issues": [{"file": "", "line": 0, "severity": "", "comment": ""}],
  "overall_score": 0,
  "summary": ""
}
severity must be: critical, warning, or suggestion
PROMPT;

            $aiResponse = Http::withToken(config('services.openrouter.key'))
                ->acceptJson()
                ->timeout(120)
                ->post('https://openrouter.ai/api/v1/chat/completions', [
                    'model'    => $model,
                    'messages' => [
                        ['role' => 'system', 'content' => $systemPrompt],
                        ['role' => 'user',   'content' => "Review this diff:\n".$diff],
                    ],
                ]);

            if (! $aiResponse->successful()) {
                throw new \RuntimeException('OpenRouter failed: '.$aiResponse->status().' '.$aiResponse->body());
            }

            $content = data_get($aiResponse->json(), 'choices.0.message.content', '');
            $parsed  = $this->extractJson($content);

            if (! is_array($parsed)) {
                throw new \RuntimeException('Could not parse AI JSON response.');
            }

            // 3. Persist the review and its comments.
            $review = Review::create([
                'pull_request_id'     => $pr->id,
                'security_issues'     => $parsed['security_issues']     ?? [],
                'performance_issues'  => $parsed['performance_issues']  ?? [],
                'code_quality_issues' => $parsed['code_quality_issues'] ?? [],
                'overall_score'       => $this->clampScore($parsed['overall_score'] ?? null),
                'summary'             => $parsed['summary'] ?? null,
                'ai_model_used'       => $model,
            ]);

            $layers = [
                'security'     => $parsed['security_issues']     ?? [],
                'performance'  => $parsed['performance_issues']  ?? [],
                'code_quality' => $parsed['code_quality_issues'] ?? [],
            ];

            foreach ($layers as $layer => $issues) {
                if (! is_array($issues)) {
                    continue;
                }
                foreach ($issues as $issue) {
                    if (! is_array($issue) || empty($issue['comment'])) {
                        continue;
                    }
                    ReviewComment::create([
                        'review_id'   => $review->id,
                        'file_path'   => (string) ($issue['file'] ?? 'unknown'),
                        'line_number' => is_numeric($issue['line'] ?? null) ? (int) $issue['line'] : null,
                        'layer'       => $layer,
                        'severity'    => in_array($issue['severity'] ?? null, ['critical', 'warning', 'suggestion'], true)
                            ? $issue['severity']
                            : 'suggestion',
                        'comment'     => (string) $issue['comment'],
                    ]);
                }
            }

            // 4. Post a summary comment back on the GitHub PR.
            $body = $this->buildSummaryComment($review);

            Http::withToken($user->github_token)
                ->acceptJson()
                ->post("https://api.github.com/repos/{$repository->full_name}/issues/{$pr->pr_number}/comments", [
                    'body' => $body,
                ]);

            $pr->update(['status' => 'completed']);
        } catch (Throwable $e) {
            Log::error('ProcessPullRequestReview failed', [
                'pr_id' => $pr->id,
                'error' => $e->getMessage(),
            ]);
            $pr->update(['status' => 'failed']);
        }
    }

    /**
     * Pull a JSON object out of the model's reply. Some models wrap JSON
     * in prose or fenced code blocks, so we try a few strategies.
     */
    protected function extractJson(string $content): ?array
    {
        $content = trim($content);

        // Strip ```json fences if present.
        if (preg_match('/```(?:json)?\s*(\{.*\})\s*```/s', $content, $m)) {
            $content = $m[1];
        }

        $decoded = json_decode($content, true);
        if (is_array($decoded)) {
            return $decoded;
        }

        // Fallback: grab the first balanced-looking object.
        if (preg_match('/\{.*\}/s', $content, $m)) {
            $decoded = json_decode($m[0], true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }

        return null;
    }

    protected function clampScore(mixed $value): ?int
    {
        if (! is_numeric($value)) {
            return null;
        }
        return (int) max(0, min(100, (int) $value));
    }

    protected function buildSummaryComment(Review $review): string
    {
        $score = $review->overall_score ?? 'N/A';
        $sec   = is_array($review->security_issues)     ? count($review->security_issues)     : 0;
        $perf  = is_array($review->performance_issues)  ? count($review->performance_issues)  : 0;
        $qual  = is_array($review->code_quality_issues) ? count($review->code_quality_issues) : 0;

        return "## 🔍 PRISM AI Review\n\n"
            ."**Overall Score:** {$score}/100\n\n"
            ."- 🛡️ Security issues: {$sec}\n"
            ."- ⚡ Performance issues: {$perf}\n"
            ."- 🧹 Code quality issues: {$qual}\n\n"
            ."**Summary:** ".($review->summary ?: '_No summary provided._')."\n\n"
            ."_Model: {$review->ai_model_used}_";
    }
}
