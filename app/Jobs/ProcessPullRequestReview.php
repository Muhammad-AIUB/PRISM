<?php

namespace App\Jobs;

use App\Mail\ReviewCompletedMail;
use App\Models\PullRequest;
use App\Models\Review;
use App\Models\ReviewComment;
use App\Models\User;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

class ProcessPullRequestReview implements ShouldQueue
{
    use Queueable;

    /** Up to 3 attempts: ~1 immediate + 2 retries (60s, 180s, then 600s if a 4th somehow runs). */
    public int $tries   = 3;
    public int $timeout = 120;
    /** Exponential-ish backoff in seconds between attempts. */
    public array $backoff = [60, 180, 600];

    public function __construct(public PullRequest $pullRequest)
    {
    }

    public function handle(): void
    {
        $pr         = $this->pullRequest->fresh();
        $repository = $pr->repository;
        $user       = $repository->user;

        Log::info('PR review job started', [
            'pr_id'   => $pr->id,
            'repo'    => $repository->full_name,
            'attempt' => $this->attempts(),
        ]);

        // No outer try/catch — we want exceptions to propagate so Laravel can
        // retry per $tries/$backoff. The final-failure cleanup lives in failed().
        $pr->update(['status' => 'analyzing']);

            // 1. Fetch unified diff from GitHub. Cache for 1h keyed on PR head
            //    branch so re-analyses skip the network call until a new push.
            $cacheKey = "pr_diff_{$pr->id}_".sha1($pr->head_branch.'|'.$pr->updated_at);
            $diffBody = Cache::remember($cacheKey, 3600, function () use ($user, $repository, $pr) {
                $r = Http::withToken($user->github_token)
                    ->withHeaders(['Accept' => 'application/vnd.github.v3.diff'])
                    ->get("https://api.github.com/repos/{$repository->full_name}/pulls/{$pr->pr_number}");

                if (! $r->successful()) {
                    throw new \RuntimeException('Failed to fetch diff: '.$r->status());
                }
                return $r->body();
            });

            $diff      = mb_substr($diffBody, 0, 8000);
            $languages = $this->detectLanguages($diff);

            // Persist detected languages on the PR so the UI can render badges.
            if (! empty($languages)) {
                $pr->update(['detected_languages' => $languages]);
            }

            // 2. First AI pass: structured review with multi-model fallback.
            $attempt = $this->callAiWithFallback(
                system: $this->buildSystemPrompt($languages),
                user:   "Review this diff:\n".$diff,
            );
            $model  = $attempt['model'];
            $parsed = $attempt['parsed'];

            // Graceful degradation when every model returned unparseable output.
            if (! is_array($parsed)) {
                Review::updateOrCreate(
                    ['pull_request_id' => $pr->id],
                    [
                        'overall_score' => null,
                        'summary'       => $attempt['raw']
                            ? "AI review couldn't be parsed cleanly. Click Re-analyze to retry.\n\n— Raw output —\n".mb_substr($attempt['raw'], 0, 1500)
                            : "AI review didn't return any usable content. Click Re-analyze to retry.",
                        'ai_model_used' => $model ?? 'multi-fallback',
                        'security_issues'     => [],
                        'performance_issues'  => [],
                        'code_quality_issues' => [],
                    ]
                );
                $pr->update(['status' => 'completed']);
                Log::warning('PR review: all AI models failed to return parseable JSON', ['pr_id' => $pr->id]);
                return;
            }

            // 3. Persist (or update) the review.
            $review = Review::updateOrCreate(
                ['pull_request_id' => $pr->id],
                [
                    'security_issues'     => $parsed['security_issues']     ?? [],
                    'performance_issues'  => $parsed['performance_issues']  ?? [],
                    'code_quality_issues' => $parsed['code_quality_issues'] ?? [],
                    'overall_score'       => $this->clampScore($parsed['overall_score'] ?? null),
                    'summary'             => $parsed['summary'] ?? null,
                    'ai_model_used'       => $model,
                    'suggested_fixes'     => null,
                ]
            );

            // Replace comments wholesale on re-analyze.
            $review->comments()->delete();

            $layers = [
                'security'     => $parsed['security_issues']     ?? [],
                'performance'  => $parsed['performance_issues']  ?? [],
                'code_quality' => $parsed['code_quality_issues'] ?? [],
            ];
            foreach ($layers as $layer => $issues) {
                if (! is_array($issues)) continue;
                foreach ($issues as $issue) {
                    if (! is_array($issue) || empty($issue['comment'])) continue;
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

            // 4. Second AI pass: suggested fixes per issue.
            $fixes = $this->generateFixes($model, $layers, $diff);
            if ($fixes !== null) {
                $review->update(['suggested_fixes' => $fixes]);
            }

            // 5. Post a summary back on the GitHub PR.
            Http::withToken($user->github_token)
                ->acceptJson()
                ->post("https://api.github.com/repos/{$repository->full_name}/issues/{$pr->pr_number}/comments", [
                    'body' => $this->buildSummaryComment($review),
                ]);

        $pr->update(['status' => 'completed']);
        Log::info('PR review job completed', ['pr_id' => $pr->id, 'score' => $review->overall_score]);

        \App\Models\AuditLog::record(
            $user?->id,
            'review_completed',
            "Review completed for PR #{$pr->pr_number} on {$repository->full_name}",
            ['pull_request_id' => $pr->id, 'score' => $review->overall_score]
        );

        // 6. Out-of-band notifications. Failure here must NOT roll back the review
        //    or cause a retry, so swallow exceptions narrowly.
        $this->sendEmail($pr, $user, $review);
        $this->sendSlack($pr, $user, $review);
    }

    /**
     * Invoked by Laravel after all $tries are exhausted (or once if $tries=1).
     */
    public function failed(Throwable $exception): void
    {
        Log::error('PR review job failed permanently', [
            'pr_id'    => $this->pullRequest->id,
            'attempts' => $this->attempts(),
            'error'    => $exception->getMessage(),
        ]);
        $this->pullRequest->update(['status' => 'failed']);
    }

    /**
     * Inspect filenames in the diff and return human-readable language names
     * (used both for badges in the UI and the AI prompt).
     */
    protected function detectLanguages(string $diff): array
    {
        preg_match_all('/^diff --git a\/(\S+) b\/\S+/m', $diff, $m);
        $files = $m[1] ?? [];
        $langs = [];
        foreach ($files as $f) {
            $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
            $langs[] = match ($ext) {
                'php'                       => 'PHP',
                'js', 'jsx', 'mjs', 'cjs'   => 'JavaScript',
                'ts', 'tsx'                 => 'TypeScript',
                'py'                        => 'Python',
                'go'                        => 'Go',
                'rb'                        => 'Ruby',
                'java'                      => 'Java',
                default                     => null,
            };
        }
        return array_values(array_unique(array_filter($langs)));
    }

    /**
     * Return the per-language inspection rules that get appended to the system
     * prompt. Keyed by the detectLanguages() output so JavaScript and TypeScript
     * share the same rule set with TS-specific additions.
     */
    protected function getLanguageRules(array $languages): array
    {
        $rules = [];

        if (in_array('PHP', $languages, true)) {
            $rules = array_merge($rules, [
                'Detect N+1 query patterns (loops with model calls)',
                'Check for missing form validation in controllers',
                'Flag raw SQL queries without parameter binding',
                'Verify authorization checks in sensitive endpoints',
                'Check for hardcoded credentials',
                'Detect missing return type hints',
            ]);
        }
        if (in_array('JavaScript', $languages, true) || in_array('TypeScript', $languages, true)) {
            $rules = array_merge($rules, [
                'Flag console.log statements left in production code',
                'Check for missing error handling in async functions',
                'Detect usage of `any` type in TypeScript',
                'Check for missing key prop in React lists',
                'Flag direct DOM manipulation in React',
                'Detect potential memory leaks (uncleaned listeners)',
            ]);
        }
        if (in_array('Python', $languages, true)) {
            $rules = array_merge($rules, [
                'Check for bare except clauses',
                'Detect missing type hints',
                'Flag print statements in production code',
                'Check for SQL injection in raw queries',
            ]);
        }
        if (in_array('Go', $languages, true)) {
            $rules = array_merge($rules, [
                'Verify error handling on every error return',
                'Check for goroutine leaks',
                'Detect missing context propagation',
            ]);
        }

        return $rules;
    }

    /**
     * Build the system prompt, embedding detected languages and their rules.
     */
    protected function buildSystemPrompt(array $languages): string
    {
        $base = <<<'PROMPT'
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

        $rules = $this->getLanguageRules($languages);
        if (empty($rules)) return $base;

        return "Detected languages: ".implode(', ', $languages)."\n\n"
            . $base
            . "\n\nApply these language-specific rules:\n- "
            . implode("\n- ", $rules);
    }

    /**
     * Second AI call: produce concrete code fixes with before/after snippets.
     * Returns null on failure (review still saved without fixes).
     */
    protected function generateFixes(string $model, array $layers, string $diff): ?array
    {
        $payload = [
            'security'     => $layers['security']     ?? [],
            'performance'  => $layers['performance']  ?? [],
            'code_quality' => $layers['code_quality'] ?? [],
        ];

        // Nothing to fix.
        if (
            empty($payload['security']) && empty($payload['performance']) && empty($payload['code_quality'])
        ) {
            return ['fixes' => []];
        }

        $userPrompt = "Based on these issues found in the code review, provide concrete code fixes.\n\n"
            . "Issues:\n"
            . json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . "\n\n"
            . "Diff context (first 4000 chars):\n"
            . mb_substr($diff, 0, 4000) . "\n\n"
            . 'Return ONLY a valid JSON object with this exact structure:'."\n"
            . '{'."\n"
            . '  "fixes": ['."\n"
            . '    {'."\n"
            . '      "layer": "security|performance|code_quality",'."\n"
            . '      "file": "path/to/file",'."\n"
            . '      "line": <number>,'."\n"
            . '      "original_issue": "brief description",'."\n"
            . '      "problematic_code": "the bad code snippet (2-5 lines)",'."\n"
            . '      "suggested_code": "the fixed code snippet",'."\n"
            . '      "explanation": "why this fix is better (1-2 sentences)"'."\n"
            . '    }'."\n"
            . '  ]'."\n"
            . '}'."\n\n"
            . 'Provide fixes only for the most impactful issues (max 5).';

        $system = 'You are an expert software engineer providing precise code fixes. Return only valid JSON.';

        $parsed = $this->callAi(model: $model, system: $system, user: $userPrompt);
        if (! is_array($parsed) || ! isset($parsed['fixes']) || ! is_array($parsed['fixes'])) {
            return null;
        }

        // Defensive sanitisation: keep only the keys our UI expects, cap at 5.
        $fixes = collect($parsed['fixes'])->take(5)->map(fn ($f) => [
            'layer'            => in_array($f['layer'] ?? null, ['security', 'performance', 'code_quality'], true)
                                    ? $f['layer'] : 'code_quality',
            'file'             => (string) ($f['file'] ?? ''),
            'line'             => is_numeric($f['line'] ?? null) ? (int) $f['line'] : null,
            'original_issue'   => (string) ($f['original_issue'] ?? ''),
            'problematic_code' => (string) ($f['problematic_code'] ?? ''),
            'suggested_code'   => (string) ($f['suggested_code'] ?? ''),
            'explanation'      => (string) ($f['explanation'] ?? ''),
        ])->values()->all();

        return ['fixes' => $fixes];
    }

    /**
     * Generic OpenRouter chat call returning the model's parsed JSON.
     */
    /** Groq models (primary) — native JSON mode → near-zero parse failures. */
    protected function groqModels(): array
    {
        return [
            'llama-3.3-70b-versatile',
            'llama-3.1-8b-instant',
        ];
    }

    /** OpenRouter free model fallback chain — last resort. */
    protected function aiModels(): array
    {
        return [
            'meta-llama/llama-3.3-70b-instruct:free',
            'deepseek/deepseek-v4-flash:free',
            'qwen/qwen-2.5-72b-instruct:free',
        ];
    }

    /** Try Groq first, then OpenRouter; returns first parseable response or last raw. */
    protected function callAiWithFallback(string $system, string $user): array
    {
        $strongSystem = "Respond with ONLY raw JSON. NO prose. NO markdown code fences. NO explanations before or after.\n\n".$system;
        $lastRaw = null;
        $lastModel = null;

        // 1) Groq chain
        if (config('services.groq.key')) {
            foreach ($this->groqModels() as $model) {
                $result = $this->callGroqRaw($model, $strongSystem, $user);
                $lastModel = "groq/{$model}";
                $lastRaw   = $result['raw'];

                if (is_array($result['parsed'])) {
                    return ['model' => $lastModel, 'parsed' => $result['parsed'], 'raw' => $result['raw']];
                }
                Log::warning('Groq model returned unparseable output, trying next', [
                    'model'   => $model,
                    'preview' => mb_substr((string) $result['raw'], 0, 200),
                ]);
            }
        }

        // 2) OpenRouter chain
        foreach ($this->aiModels() as $model) {
            $result = $this->callAiRaw($model, $strongSystem, $user);
            $lastModel = $model;
            $lastRaw   = $result['raw'];

            if (is_array($result['parsed'])) {
                return ['model' => $model, 'parsed' => $result['parsed'], 'raw' => $result['raw']];
            }
            Log::warning('AI model returned unparseable output, trying next', [
                'model'   => $model,
                'preview' => mb_substr((string) $result['raw'], 0, 200),
            ]);
        }

        return ['model' => $lastModel, 'parsed' => null, 'raw' => $lastRaw];
    }

    /** Single-shot Groq call with native JSON mode. */
    protected function callGroqRaw(string $model, string $system, string $user): array
    {
        $start = microtime(true);

        $response = Http::withToken(config('services.groq.key'))
            ->acceptJson()
            ->timeout(60)
            ->post('https://api.groq.com/openai/v1/chat/completions', [
                'model'           => $model,
                'temperature'     => 0.2,
                'response_format' => ['type' => 'json_object'],
                'messages'        => [
                    ['role' => 'system', 'content' => $system],
                    ['role' => 'user',   'content' => $user],
                ],
            ]);

        $durationMs = (int) round((microtime(true) - $start) * 1000);
        $json       = $response->successful() ? $response->json() : [];
        $content    = (string) data_get($json, 'choices.0.message.content', '');

        Log::info('ai_call', [
            'context'           => 'pr_review',
            'provider'          => 'groq',
            'model'             => $model,
            'status'            => $response->status(),
            'duration_ms'       => $durationMs,
            'prompt_tokens'     => data_get($json, 'usage.prompt_tokens'),
            'completion_tokens' => data_get($json, 'usage.completion_tokens'),
        ]);

        if (! $response->successful()) {
            Log::warning('Groq call failed', ['status' => $response->status(), 'body' => mb_substr($response->body(), 0, 500)]);
            return ['parsed' => null, 'raw' => $response->body()];
        }

        return ['parsed' => $this->extractJson($content), 'raw' => $content];
    }

    protected function callAiRaw(string $model, string $system, string $user): array
    {
        $start = microtime(true);

        $response = Http::withToken(config('services.openrouter.key'))
            ->acceptJson()
            ->timeout(120)
            ->post('https://openrouter.ai/api/v1/chat/completions', [
                'model'       => $model,
                'temperature' => 0.2,
                'messages'    => [
                    ['role' => 'system', 'content' => $system],
                    ['role' => 'user',   'content' => $user],
                ],
            ]);

        $durationMs = (int) round((microtime(true) - $start) * 1000);
        $json       = $response->successful() ? $response->json() : [];
        $content    = (string) data_get($json, 'choices.0.message.content', '');

        Log::info('ai_call', [
            'context'       => 'pr_review',
            'model'         => $model,
            'status'        => $response->status(),
            'duration_ms'   => $durationMs,
            'prompt_tokens' => data_get($json, 'usage.prompt_tokens'),
        ]);

        if (! $response->successful()) {
            return ['parsed' => null, 'raw' => $response->body()];
        }

        return ['parsed' => $this->extractJson($content), 'raw' => $content];
    }

    protected function callAi(string $model, string $system, string $user): ?array
    {
        // Route to Groq if the model came from the Groq chain (prefix marker).
        if (str_starts_with($model, 'groq/')) {
            $result = $this->callGroqRaw(substr($model, 5), $system, $user);
            return is_array($result['parsed']) ? $result['parsed'] : null;
        }

        $start = microtime(true);

        $response = Http::withToken(config('services.openrouter.key'))
            ->acceptJson()
            ->timeout(120)
            ->post('https://openrouter.ai/api/v1/chat/completions', [
                'model'    => $model,
                'messages' => [
                    ['role' => 'system', 'content' => $system],
                    ['role' => 'user',   'content' => $user],
                ],
            ]);

        $durationMs = (int) round((microtime(true) - $start) * 1000);
        $json       = $response->successful() ? $response->json() : [];

        Log::info('ai_call', [
            'model'           => $model,
            'status'          => $response->status(),
            'duration_ms'     => $durationMs,
            'prompt_tokens'   => data_get($json, 'usage.prompt_tokens'),
            'completion_tokens' => data_get($json, 'usage.completion_tokens'),
            'total_tokens'    => data_get($json, 'usage.total_tokens'),
        ]);

        if (! $response->successful()) {
            Log::warning('OpenRouter call failed', ['status' => $response->status(), 'body' => mb_substr($response->body(), 0, 500)]);
            return null;
        }

        $content = data_get($json, 'choices.0.message.content', '');
        return $this->extractJson((string) $content);
    }

    /** Coax JSON out of whatever the AI returned — see ProcessCommitReview for strategy notes. */
    protected function extractJson(string $content): ?array
    {
        $content = trim($content);
        if ($content === '') return null;

        $d = json_decode($content, true);
        if (is_array($d)) return $d;

        if (preg_match('/```(?:json)?\s*(\{.*\})\s*```/s', $content, $m)) {
            $d = json_decode($m[1], true);
            if (is_array($d)) return $d;
            $content = $m[1];
        }

        $clean = preg_replace('/,(\s*[}\]])/', '$1', $content);
        $d = json_decode($clean, true);
        if (is_array($d)) return $d;

        if (preg_match('/\{.*\}/s', $clean, $m)) {
            $d = json_decode($m[0], true);
            if (is_array($d)) return $d;
        }

        return null;
    }

    protected function clampScore(mixed $value): ?int
    {
        if (! is_numeric($value)) return null;
        return (int) max(0, min(100, (int) $value));
    }

    protected function buildSummaryComment(Review $review): string
    {
        $score = $review->overall_score ?? 'N/A';
        $sec   = is_array($review->security_issues)     ? count($review->security_issues)     : 0;
        $perf  = is_array($review->performance_issues)  ? count($review->performance_issues)  : 0;
        $qual  = is_array($review->code_quality_issues) ? count($review->code_quality_issues) : 0;

        return "## 🔍 PRism AI Review\n\n"
            ."**Overall Score:** {$score}/100\n\n"
            ."- 🛡️ Security issues: {$sec}\n"
            ."- ⚡ Performance issues: {$perf}\n"
            ."- 🧹 Code quality issues: {$qual}\n\n"
            ."**Summary:** ".($review->summary ?: '_No summary provided._')."\n\n"
            ."_Model: {$review->ai_model_used}_";
    }

    /**
     * Send the completion email if the user has the preference enabled.
     */
    protected function sendEmail(PullRequest $pr, ?User $user, Review $review): void
    {
        if (! $user || ! $user->email || ! $user->email_notifications) return;

        try {
            Mail::to($user->email)->send(new ReviewCompletedMail($pr, $review));
            Log::info('Email notification sent', ['pr_id' => $pr->id, 'to' => $user->email]);
        } catch (Throwable $e) {
            Log::warning('Email notification failed', ['error' => $e->getMessage()]);
        }
    }

    /**
     * Post the review summary to the user's Slack webhook (if configured).
     * Uses Slack's legacy attachments payload — works with both Slack-native
     * incoming webhooks and most Slack-compatible endpoints (Mattermost, etc.).
     */
    protected function sendSlack(PullRequest $pr, ?User $user, Review $review): void
    {
        if (! $user || ! $user->slack_webhook_url) return;

        try {
            $score = $review->overall_score ?? 0;
            $color = $score > 70 ? '#22c55e' : ($score > 40 ? '#f59e0b' : '#ef4444');

            $criticalCount = $review->comments()->where('severity', 'critical')->count();
            $warningCount  = $review->comments()->where('severity', 'warning')->count();

            Http::asJson()->timeout(10)->post($user->slack_webhook_url, [
                'attachments' => [[
                    'color'      => $color,
                    'title'      => "🔍 PRism Review: {$pr->title}",
                    'title_link' => url("/reviews/{$pr->id}"),
                    'text'       => $review->summary ?? '',
                    'fields'     => [
                        ['title' => 'Score',      'value' => "{$score}/100",                                            'short' => true],
                        ['title' => 'Issues',     'value' => "🔴 {$criticalCount} Critical | 🟡 {$warningCount} Warning", 'short' => true],
                        ['title' => 'Repository', 'value' => $pr->repository?->full_name ?? '—',                       'short' => true],
                        ['title' => 'Author',     'value' => $pr->author ?? '—',                                       'short' => true],
                    ],
                    'footer' => 'PRism AI Code Review',
                    'ts'     => now()->timestamp,
                ]],
            ]);
            Log::info('Slack notification sent', ['pr_id' => $pr->id]);
        } catch (Throwable $e) {
            Log::warning('Slack notification failed', ['error' => $e->getMessage()]);
        }
    }
}
