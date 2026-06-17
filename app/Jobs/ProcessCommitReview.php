<?php

namespace App\Jobs;

use App\Models\CommitReview;
use App\Models\User;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Mirror of ProcessPullRequestReview, retargeted at a single commit.
 * Shares the same AI prompt + language-detection helpers in the PR job
 * (kept duplicated for clarity; extract to a shared service later if needed).
 */
class ProcessCommitReview implements ShouldQueue
{
    use Queueable;

    public int $tries   = 3;
    public int $timeout = 120;
    public array $backoff = [60, 180, 600];

    public function __construct(public CommitReview $commitReview)
    {
    }

    public function handle(): void
    {
        $review     = $this->commitReview->fresh();
        $repository = $review->repository;
        $user       = $repository->user;

        Log::info('Commit review job started', [
            'review_id' => $review->id,
            'repo'      => $repository->full_name,
            'sha'       => $review->commit_sha,
            'attempt'   => $this->attempts(),
        ]);

        $review->update(['status' => 'analyzing']);

        // 1. Fetch the commit diff. Cache for 1h on the SHA (immutable per commit).
        $cacheKey = "commit_diff_{$repository->id}_{$review->commit_sha}";
        $diffBody = Cache::remember($cacheKey, 3600, function () use ($user, $repository, $review) {
            $r = Http::withToken($user->github_token)
                ->withHeaders(['Accept' => 'application/vnd.github.v3.diff'])
                ->get("https://api.github.com/repos/{$repository->full_name}/commits/{$review->commit_sha}");

            if (! $r->successful()) {
                throw new \RuntimeException('Failed to fetch commit diff: '.$r->status());
            }
            return $r->body();
        });

        $diff      = mb_substr($diffBody, 0, 8000);
        $languages = $this->detectLanguages($diff);

        if (! empty($languages)) {
            $review->update(['detected_languages' => $languages]);
        }

        // 2. First AI pass: structured review. Try a fallback chain of free
        //    models — they each fail JSON parsing at different rates, so a
        //    chain ~95% lands at least one parseable result.
        $attempt = $this->callAiWithFallback(
            system: $this->buildSystemPrompt($languages),
            user:   "Review this commit diff:\n".$diff,
        );
        $model  = $attempt['model'];
        $parsed = $attempt['parsed'];

        // Graceful degradation: if every model returned unparseable output,
        // still complete the review with the best raw text we got so the user
        // sees SOMETHING instead of a failed status.
        if (! is_array($parsed)) {
            $review->update([
                'status'        => 'completed',
                'overall_score' => null,
                'summary'       => $attempt['raw']
                    ? "AI review couldn't be parsed cleanly. Click Re-analyze to retry.\n\n— Raw output —\n".mb_substr($attempt['raw'], 0, 1500)
                    : "AI review didn't return any usable content. Click Re-analyze to retry.",
                'ai_model_used' => $model ?? 'multi-fallback',
            ]);
            Log::warning('Commit review: all AI models failed to return parseable JSON', ['review_id' => $review->id]);
            return;
        }

        $review->update([
            'security_issues'     => $parsed['security_issues']     ?? [],
            'performance_issues'  => $parsed['performance_issues']  ?? [],
            'code_quality_issues' => $parsed['code_quality_issues'] ?? [],
            'overall_score'       => $this->clampScore($parsed['overall_score'] ?? null),
            'summary'             => $parsed['summary'] ?? null,
            'ai_model_used'       => $model,
            'suggested_fixes'     => null,
        ]);

        // 3. Second AI pass: suggested fixes.
        $layers = [
            'security'     => $parsed['security_issues']     ?? [],
            'performance'  => $parsed['performance_issues']  ?? [],
            'code_quality' => $parsed['code_quality_issues'] ?? [],
        ];
        $fixes = $this->generateFixes($model, $layers, $diff);
        if ($fixes !== null) {
            $review->update(['suggested_fixes' => $fixes]);
        }

        // 4. Post a summary comment on the commit (different endpoint than PRs).
        Http::withToken($user->github_token)
            ->acceptJson()
            ->post("https://api.github.com/repos/{$repository->full_name}/commits/{$review->commit_sha}/comments", [
                'body' => $this->buildSummaryComment($review->fresh()),
            ]);

        $review->update(['status' => 'completed']);
        Log::info('Commit review job completed', ['review_id' => $review->id, 'score' => $review->overall_score]);

        \App\Models\AuditLog::record(
            $user?->id,
            'review_completed',
            "Review completed for commit {$review->shortSha()} on {$repository->full_name}",
            ['commit_review_id' => $review->id, 'score' => $review->overall_score]
        );

        // 5. Notifications.
        $this->sendEmail($review->fresh(), $user);
        $this->sendSlack($review->fresh(), $user);
    }

    public function failed(Throwable $exception): void
    {
        Log::error('Commit review job failed permanently', [
            'review_id' => $this->commitReview->id,
            'attempts'  => $this->attempts(),
            'error'     => $exception->getMessage(),
        ]);
        $this->commitReview->update(['status' => 'failed']);
    }

    // ── Helpers (duplicated from ProcessPullRequestReview; keep in sync) ─

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

    protected function buildSystemPrompt(array $languages): string
    {
        $base = <<<'PROMPT'
You are a senior software engineer reviewing a commit.
Analyze the diff and return ONLY a valid JSON object with this exact structure:
{
  "security_issues": [{"file": "", "line": 0, "severity": "", "comment": ""}],
  "performance_issues": [{"file": "", "line": 0, "severity": "", "comment": ""}],
  "code_quality_issues": [{"file": "", "line": 0, "severity": "", "comment": ""}],
  "overall_score": 0,
  "summary": ""
}
overall_score must be an integer from 0 to 100 (NOT 0-10), where 100 is flawless and 0 is critically broken. A clean commit with only minor suggestions should score 80-95.
severity must be: critical, warning, or suggestion
PROMPT;

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

        if (empty($rules)) return $base;

        return "Detected languages: ".implode(', ', $languages)."\n\n"
            . $base
            . "\n\nApply these language-specific rules:\n- "
            . implode("\n- ", $rules);
    }

    protected function generateFixes(string $model, array $layers, string $diff): ?array
    {
        $payload = [
            'security'     => $layers['security']     ?? [],
            'performance'  => $layers['performance']  ?? [],
            'code_quality' => $layers['code_quality'] ?? [],
        ];

        if (empty($payload['security']) && empty($payload['performance']) && empty($payload['code_quality'])) {
            return ['fixes' => []];
        }

        $system = 'You are an expert software engineer providing precise code fixes. Return only valid JSON.';
        $userPrompt = "Based on these issues found in the code review, provide concrete code fixes.\n\n"
            . "Issues:\n" . json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . "\n\n"
            . "Diff context (first 4000 chars):\n" . mb_substr($diff, 0, 4000) . "\n\n"
            . 'Return ONLY a valid JSON object with this exact structure:'."\n"
            . '{ "fixes": [ { "layer": "security|performance|code_quality", "file": "path/to/file", "line": <number>, "original_issue": "brief description", "problematic_code": "the bad code snippet", "suggested_code": "the fixed code snippet", "explanation": "why this fix is better" } ] }'."\n\n"
            . 'Provide fixes only for the most impactful issues (max 5).';

        $parsed = $this->callAi(model: $model, system: $system, user: $userPrompt);
        if (! is_array($parsed) || ! isset($parsed['fixes']) || ! is_array($parsed['fixes'])) return null;

        $fixes = collect($parsed['fixes'])->take(5)->map(fn ($f) => [
            'layer'            => in_array($f['layer'] ?? null, ['security', 'performance', 'code_quality'], true) ? $f['layer'] : 'code_quality',
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
     * Groq models (primary). Native JSON mode means near-zero parse failures.
     */
    protected function groqModels(): array
    {
        return [
            'llama-3.3-70b-versatile',
            'llama-3.1-8b-instant',
        ];
    }

    /**
     * OpenRouter free models (fallback). Tried only if Groq is misconfigured
     * or every Groq model errors.
     */
    protected function aiModels(): array
    {
        return [
            'meta-llama/llama-3.3-70b-instruct:free',
            'deepseek/deepseek-v4-flash:free',
            'qwen/qwen-2.5-72b-instruct:free',
        ];
    }

    /**
     * Try Groq first (with native JSON mode), then fall through to the
     * OpenRouter free chain. Returns ['model' => ..., 'parsed' => ..., 'raw' => ...].
     */
    protected function callAiWithFallback(string $system, string $user): array
    {
        $strongSystem = "Respond with ONLY raw JSON. NO prose. NO markdown code fences. NO explanations before or after.\n\n".$system;
        $lastRaw = null;
        $lastModel = null;

        // 1) Groq chain — native JSON mode, very reliable.
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

        // 2) OpenRouter chain — last-resort fallback.
        foreach ($this->aiModels() as $model) {
            $result = $this->callAiRaw($model, $strongSystem, $user);
            $lastModel = $model;
            $lastRaw   = $result['raw'];

            if (is_array($result['parsed'])) {
                return ['model' => $model, 'parsed' => $result['parsed'], 'raw' => $result['raw']];
            }
            Log::warning('AI model returned unparseable output, trying next', [
                'model'    => $model,
                'preview'  => mb_substr((string) $result['raw'], 0, 200),
            ]);
        }

        return ['model' => $lastModel, 'parsed' => null, 'raw' => $lastRaw];
    }

    /**
     * Single-shot Groq call with native JSON mode (response_format).
     */
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
            'context'           => 'commit_review',
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

        $parsed = $this->extractJson($content);
        return ['parsed' => $parsed, 'raw' => $content];
    }

    /**
     * Single-shot AI call returning both parsed JSON (if any) and the raw text.
     */
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
            'context'         => 'commit_review',
            'model'           => $model,
            'status'          => $response->status(),
            'duration_ms'     => $durationMs,
            'prompt_tokens'   => data_get($json, 'usage.prompt_tokens'),
            'completion_tokens' => data_get($json, 'usage.completion_tokens'),
            'parseable'       => false, // updated below
        ]);

        if (! $response->successful()) {
            return ['parsed' => null, 'raw' => $response->body()];
        }

        $parsed = $this->extractJson($content);
        return ['parsed' => $parsed, 'raw' => $content];
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
            'context'         => 'commit_review',
            'model'           => $model,
            'status'          => $response->status(),
            'duration_ms'     => $durationMs,
            'prompt_tokens'   => data_get($json, 'usage.prompt_tokens'),
            'completion_tokens' => data_get($json, 'usage.completion_tokens'),
            'total_tokens'    => data_get($json, 'usage.total_tokens'),
        ]);

        if (! $response->successful()) {
            Log::warning('OpenRouter (commit) failed', ['status' => $response->status(), 'body' => mb_substr($response->body(), 0, 500)]);
            return null;
        }

        $content = data_get($json, 'choices.0.message.content', '');
        return $this->extractJson((string) $content);
    }

    /**
     * Coax a JSON object out of whatever the AI returned. Strategies:
     *   1) Raw parse
     *   2) Strip ```json fences
     *   3) Strip trailing commas before } or ]
     *   4) Fall back to the first balanced { … } we can find
     */
    protected function extractJson(string $content): ?array
    {
        $content = trim($content);
        if ($content === '') return null;

        // Strategy 1
        $d = json_decode($content, true);
        if (is_array($d)) return $d;

        // Strategy 2 — fenced code block
        if (preg_match('/```(?:json)?\s*(\{.*\})\s*```/s', $content, $m)) {
            $d = json_decode($m[1], true);
            if (is_array($d)) return $d;
            $content = $m[1];
        }

        // Strategy 3 — drop common JSON-illegal patterns
        $clean = preg_replace('/,(\s*[}\]])/', '$1', $content); // trailing commas
        $d = json_decode($clean, true);
        if (is_array($d)) return $d;

        // Strategy 4 — first balanced object
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

    protected function buildSummaryComment(CommitReview $review): string
    {
        $score = $review->overall_score ?? 'N/A';
        $sec   = is_array($review->security_issues)     ? count($review->security_issues)     : 0;
        $perf  = is_array($review->performance_issues)  ? count($review->performance_issues)  : 0;
        $qual  = is_array($review->code_quality_issues) ? count($review->code_quality_issues) : 0;

        return "## 🔍 PRism AI Review (Commit)\n\n"
            ."**Overall Score:** {$score}/100\n\n"
            ."- 🛡️ Security issues: {$sec}\n"
            ."- ⚡ Performance issues: {$perf}\n"
            ."- 🧹 Code quality issues: {$qual}\n\n"
            ."**Summary:** ".($review->summary ?: '_No summary provided._')."\n\n"
            ."[View full review]("
            .url('/commits/'.$review->id)
            .") · _Model: {$review->ai_model_used}_";
    }

    protected function sendEmail(CommitReview $review, ?User $user): void
    {
        if (! $user || ! $user->email || ! $user->email_notifications) return;
        // Reuse the PR mailable shape isn't ideal; for commits we send a plain mail.
        try {
            \Illuminate\Support\Facades\Mail::raw(
                "PRism reviewed commit ".$review->shortSha()." on {$review->repository->full_name}.\n\n"
                . "Score: ".($review->overall_score ?? 'N/A')."/100\n\n"
                . ($review->summary ?? '')."\n\n"
                . url('/commits/'.$review->id),
                function ($m) use ($user, $review) {
                    $m->to($user->email)->subject("PRism Commit Review — ".$review->shortSha()." (Score: ".($review->overall_score ?? 'N/A')."/100)");
                }
            );
            Log::info('Email notification sent (commit)', ['review_id' => $review->id]);
        } catch (Throwable $e) {
            Log::warning('Email notification (commit) failed', ['error' => $e->getMessage()]);
        }
    }

    protected function sendSlack(CommitReview $review, ?User $user): void
    {
        if (! $user || ! $user->slack_webhook_url) return;

        try {
            $score = $review->overall_score ?? 0;
            $color = $score > 70 ? '#22c55e' : ($score > 40 ? '#f59e0b' : '#ef4444');
            $msg   = "🔍 PRism Commit Review: {$review->shortSha()} on `{$review->repository->full_name}`";

            Http::asJson()->timeout(10)->post($user->slack_webhook_url, [
                'attachments' => [[
                    'color'      => $color,
                    'title'      => $msg,
                    'title_link' => url('/commits/'.$review->id),
                    'text'       => $review->summary ?? '',
                    'fields'     => [
                        ['title' => 'Score',      'value' => "{$score}/100",                                     'short' => true],
                        ['title' => 'Branch',     'value' => $review->branch,                                    'short' => true],
                        ['title' => 'Repository', 'value' => $review->repository->full_name,                     'short' => true],
                        ['title' => 'Author',     'value' => $review->author ?? '—',                             'short' => true],
                    ],
                    'footer' => 'PRism AI Code Review (Commit)',
                    'ts'     => now()->timestamp,
                ]],
            ]);
            Log::info('Slack notification sent (commit)', ['review_id' => $review->id]);
        } catch (Throwable $e) {
            Log::warning('Slack notification (commit) failed', ['error' => $e->getMessage()]);
        }
    }
}
