<?php

namespace App\Jobs;

use App\Mail\ReviewCompleted;
use App\Models\PullRequest;
use App\Models\Review;
use App\Models\ReviewComment;
use App\Notifications\SlackReviewNotifier;
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

            // 2. First AI pass: structured review.
            $model = 'deepseek/deepseek-v4-flash:free';
            $parsed = $this->callAi(
                model: $model,
                system: $this->buildSystemPrompt($languages),
                user: "Review this diff:\n".$diff,
            );

            if (! is_array($parsed)) {
                throw new \RuntimeException('Could not parse AI review JSON.');
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

        // 6. Out-of-band notifications. Failure here must NOT roll back the review
        //    or cause a retry, so swallow exceptions narrowly.
        $this->sendEmail($pr, $user);
        SlackReviewNotifier::send($pr->fresh(['repository', 'review']));
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
     * Inspect filenames in the diff and return language tags we recognise.
     */
    protected function detectLanguages(string $diff): array
    {
        preg_match_all('/^diff --git a\/(\S+) b\/\S+/m', $diff, $m);
        $files = $m[1] ?? [];
        $langs = [];
        foreach ($files as $f) {
            $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
            $langs[] = match ($ext) {
                'php'                                          => 'php',
                'js', 'jsx', 'mjs', 'cjs'                      => 'js',
                'ts', 'tsx'                                    => 'ts',
                'py'                                           => 'python',
                default                                        => null,
            };
        }
        return array_values(array_unique(array_filter($langs)));
    }

    /**
     * Build the system prompt, appending language-specific rules where applicable.
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

        $rules = [];
        if (in_array('php', $languages, true)) {
            $rules[] = "PHP/Laravel rules: flag N+1 queries (eager-load with ->with()); missing FormRequest/validate() on controller actions; raw SQL or unparameterised DB::statement; missing auth/policy checks on protected routes; use of dd()/dump() left in code.";
        }
        if (in_array('js', $languages, true) || in_array('ts', $languages, true)) {
            $rules[] = "JS/TS rules: flag console.log/console.error left in production paths; missing try/catch around await; unhandled promise rejections; use of the `any` type in TypeScript; `==` instead of `===`.";
        }
        if (in_array('python', $languages, true)) {
            $rules[] = "Python rules: flag bare `except:` clauses; mutable default arguments; missing type hints on public functions; `print()` statements left in code; using `eval`/`exec` on untrusted input.";
        }

        return $rules ? $base."\n\nAdditional rules to enforce:\n- ".implode("\n- ", $rules) : $base;
    }

    /**
     * Second AI call: for each issue, produce a concrete code fix.
     * Returns null on failure (review still saved without fixes).
     */
    protected function generateFixes(string $model, array $layers, string $diff): ?array
    {
        $issuesPayload = [];
        foreach ($layers as $layer => $issues) {
            foreach ((array) $issues as $idx => $issue) {
                if (empty($issue['comment'])) continue;
                $issuesPayload[] = [
                    'issue_index' => $idx,
                    'layer'       => $layer,
                    'file'        => $issue['file'] ?? '',
                    'line'        => $issue['line'] ?? null,
                    'comment'     => $issue['comment'],
                ];
            }
        }
        if (empty($issuesPayload)) return ['fixes' => []];

        $system = 'You suggest concrete code fixes. For each issue, provide a short snippet of corrected code (no prose). '
                . 'Return ONLY JSON: {"fixes":[{"issue_index":0,"layer":"","original_hint":"","suggested_fix":""}]}. '
                . 'Keep suggested_fix under 600 characters.';

        $user = "Diff:\n".mb_substr($diff, 0, 4000)
              . "\n\nIssues to fix:\n".json_encode($issuesPayload, JSON_UNESCAPED_SLASHES);

        $parsed = $this->callAi(model: $model, system: $system, user: $user);
        if (! is_array($parsed) || ! isset($parsed['fixes'])) return null;
        return $parsed;
    }

    /**
     * Generic OpenRouter chat call returning the model's parsed JSON.
     */
    protected function callAi(string $model, string $system, string $user): ?array
    {
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

        if (! $response->successful()) {
            Log::warning('OpenRouter call failed', ['status' => $response->status(), 'body' => mb_substr($response->body(), 0, 500)]);
            return null;
        }

        $content = data_get($response->json(), 'choices.0.message.content', '');
        return $this->extractJson((string) $content);
    }

    protected function extractJson(string $content): ?array
    {
        $content = trim($content);
        if (preg_match('/```(?:json)?\s*(\{.*\})\s*```/s', $content, $m)) {
            $content = $m[1];
        }
        $decoded = json_decode($content, true);
        if (is_array($decoded)) return $decoded;
        if (preg_match('/\{.*\}/s', $content, $m)) {
            $decoded = json_decode($m[0], true);
            if (is_array($decoded)) return $decoded;
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

    protected function sendEmail(PullRequest $pr, $user): void
    {
        if (! config('mail.from.address') || ! $user?->email) return;
        try {
            Mail::to($user->email)->send(new ReviewCompleted($pr));
        } catch (Throwable $e) {
            Log::warning('ReviewCompleted email failed', ['error' => $e->getMessage()]);
        }
    }
}
