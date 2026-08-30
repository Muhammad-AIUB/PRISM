# Slice A — AI worker + webhook ingestion: Laravel → NestJS

Date: 2026-08-30
Status: approved design, pending implementation plan

## Goal

Move PRism's AI review engine and GitHub webhook ingestion from Laravel to
NestJS **without changing what the application does**. Same features, same AI
output, same GitHub comments, same emails, same Slack messages. Laravel keeps
serving every other route unchanged while this slice runs.

This is slice A of four. It does not delete any PHP.

## Why this slice first

The worker is the highest-risk unknown (1,196 lines of AI orchestration) and
the only subsystem with no frontend contract: a webhook goes in, database rows
come out. It can run beside Laravel on a separate queue with zero contention,
so it is verifiable on its own before anything is built on top of it.

## Scope

### In

| Surface | Laravel source |
|---|---|
| `POST /webhook/github` | `WebhookController` (140 ln) |
| Commit review pipeline | `ProcessCommitReview` (572 ln) |
| PR review pipeline | `ProcessPullRequestReview` (624 ln) |
| `POST /api/v1/commits/:id/re-analyze` | `ReviewApiController::reAnalyzeCommit` |
| `POST /api/v1/pull-requests/:id/re-analyze` | `ReviewApiController::reAnalyzePullRequest` |

The two `/api/v1` re-analyze routes come in now because they are token
authenticated (`auth:sanctum`), which the existing `SanctumAuthGuard` already
handles, and because they enqueue the same jobs. Keeping them on Laravel would
split AI work across two runtimes for no benefit.

### Out

- `POST /reviews/{pullRequest}/re-analyze` and `POST /commits/{commitReview}/re-analyze`
  (session authenticated — cannot move until slice B ports web auth)
- Every Inertia route, PDF export, OAuth, settings, repositories — slices B/C
- Deleting any PHP — slice D

### Consequence to accept

Laravel's `queue:work` **must keep running** through slices A–C. The two web
re-analyze routes still dispatch onto the `database` queue. Two workers, two
queues (`database` for Laravel, Redis/BullMQ for Nest), no shared rows, no
contention. Laravel's worker retires in slice D.

## Architecture

One new Render **free web service**, `prism-api`, Node 22, single process:

- Nest HTTP server — `POST /webhook/github`, `GET /health`, the five existing
  `GET /api/v1/*`, and the two new `POST /api/v1/**/re-analyze`
- BullMQ worker — registered in the same process as a Nest provider,
  `concurrency: 1`, mirroring Laravel's single-worker memory profile

Laravel's container (nginx + php-fpm + queue worker under supervisord, 512MB)
is not modified. `prism-api` gets its own 512MB.

Traffic moves by reverse-proxy route, never by redeploy. Rollback is the same
one-line change in reverse.

## Module layout

```
prism-api/src/
  modules/webhook/
    webhook.controller.ts        POST /webhook/github
    webhook.service.ts           HMAC verify -> repo lookup -> upsert row -> enqueue
    dto/push-event.dto.ts
    dto/pull-request-event.dto.ts
  modules/review/
    review.queue.ts              queue registration, job names, job data shape
    commit-review.processor.ts   port of ProcessCommitReview::handle
    pr-review.processor.ts       port of ProcessPullRequestReview::handle
    review.module.ts
  modules/api-v1/reviews/
    reviews.controller.ts        + reAnalyzeCommit, reAnalyzePullRequest
  ai/
    ai-client.service.ts         Groq chain -> OpenRouter chain, usage logging
    json-extractor.ts            the four parse strategies
    prompt-builder.service.ts    system prompt, language rules, fixes prompt
    ai.module.ts
  github/
    github-client.service.ts     diff fetch (PR + commit), comment post
    github.module.ts
  notifications/
    email.service.ts             Resend
    slack.service.ts             attachment payload
    notifications.module.ts
  diff/
    language-detector.ts         detectLanguages
  audit/
    audit-log.service.ts         AuditLog::record equivalent
```

The two processors become thin orchestrators. Everything currently duplicated
verbatim between the two jobs (`callAiWithFallback`, `callGroqRaw`,
`callAiRaw`, `callAi`, `extractJson`, `detectLanguages`, `buildSystemPrompt`,
`generateFixes`, `clampScore`) lives in one place and is injected.

**Behaviour is unchanged. Only the duplication goes.** 1,196 lines land as
roughly 500.

All eight entities already exist in `prism-api/src/database/entities`.

## Data flow

**Ingestion (milliseconds, must fit GitHub's 10s timeout):**

```
GitHub -> proxy -> POST /webhook/github
  -> read raw body (required for HMAC; body parser must not re-serialise)
  -> repository.id from payload; 400 if absent
  -> Repository lookup by github_repo_id; 404 if not connected
  -> HMAC-SHA256 over raw body with repository.webhook_secret,
     crypto.timingSafeEqual; 401 if mismatch
  -> switch on X-GitHub-Event:
       pull_request -> opened|synchronize only -> updateOrCreate PullRequest -> enqueue
       push         -> review_mode / watched-branch / deleted / null-sha gates
                       -> firstOrCreate CommitReview -> enqueue
       ping         -> 200 pong
       default      -> 200 Ignored event
```

**Worker:**

```
status = analyzing
  -> GitHub diff (Redis cache, 1h TTL)
  -> truncate to 8000 chars
  -> detectLanguages -> persist detected_languages if non-empty
  -> AI pass 1: review (Groq chain, then OpenRouter chain)
       -> unparseable from every model -> graceful degradation write,
          status = completed, RETURN
  -> persist review fields; PR path also deletes and recreates review_comments
  -> AI pass 2: suggested fixes (max 5)
  -> post summary comment to GitHub
  -> status = completed
  -> AuditLog 'review_completed'
  -> email (if user.email_notifications) + Slack (if user.slack_webhook_url)
```

Job data is `{ id }` only — never a serialised entity. The processor reloads
the row, matching Laravel's `->fresh()`.

**Re-analyze (`/api/v1`).** Ownership is checked first — `repository.user_id`
must equal the authenticated user, else 403 `Not your repository`. The two
endpoints are then **deliberately asymmetric, and the port must preserve that**:

| | commit | pull request |
|---|---|---|
| status set to | `analyzing` | `analyzing` |
| clears `overall_score`, `summary`, the three issue arrays, `suggested_fixes` | **yes** | no |
| forgets the cached diff | **yes** | no |

Both then enqueue the same job as the webhook path, write an
`review_reanalyzed` audit entry with `source: 'api'`, and return
`{"message":"Re-analysis queued","id":<n>}`.

Making these symmetric would change observable behaviour: a PR re-analyze is
expected to leave the previous review visible until the new one overwrites it,
while a commit re-analyze blanks the card immediately.

## Behaviour parity contract

These must match the Laravel implementation exactly. Each is asserted by a test.

### AI

- Groq models in order: `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`
- Groq uses `response_format: {type: 'json_object'}`, `temperature: 0.2`, 60s timeout
- OpenRouter fallback in order: `meta-llama/llama-3.3-70b-instruct:free`,
  `deepseek/deepseek-v4-flash:free`, `qwen/qwen-2.5-72b-instruct:free`
- OpenRouter uses `temperature: 0.2`, 120s timeout
- Groq is skipped entirely when no Groq key is configured
- Model label for a Groq result is `groq/<model>`; `callAi` routes back to Groq
  on that prefix
- The strong-system preamble is prepended verbatim:
  `Respond with ONLY raw JSON. NO prose. NO markdown code fences. NO explanations before or after.` followed by two newlines
- System prompt, including the 0-100 scale sentence and the severity line, is
  character-identical
- Language rules are appended only when at least one rule matched, under the
  exact `Detected languages: ...` and `Apply these language-specific rules:` framing
- `extractJson` keeps all four strategies in order: raw parse, fenced block,
  trailing-comma strip, first balanced object
- `clampScore` returns null for non-numeric, else `max(0, min(100, int))`
- Fixes: max 5, layer coerced to `code_quality` when not one of the three,
  line kept only when numeric, all other fields cast to string
- No issues in any layer produces `{"fixes": []}` without an AI call

### Diff and detection

- Diff truncated to 8000 chars for review, 4000 for the fixes prompt
- `Accept: application/vnd.github.v3.diff`
- Commit diff cache key is per repository + SHA, 1h
- PR diff cache key is per PR id + sha1 of head_branch + updated_at, 1h
- Language map: php->PHP; js/jsx/mjs/cjs->JavaScript; ts/tsx->TypeScript;
  py->Python; go->Go; rb->Ruby; java->Java; unique, order preserved

### GitHub writes

- PR summary to `POST /repos/{full_name}/issues/{pr_number}/comments`
- Commit summary to `POST /repos/{full_name}/commits/{sha}/comments`
- Comment body, emoji and `/100` formatting are character-identical, including
  the `[View full review](<APP_URL>/...)` link and the `_Model: ..._` footer

### Retries

- 3 attempts, backoff `[60, 180, 600]` seconds, 120s per-attempt timeout
- Final failure sets `status = 'failed'`
- Notification failures are caught and logged, and never fail the job

### Webhook responses

Byte-identical bodies and status codes to Laravel's — GitHub records them:

| Case | Status | Body |
|---|---|---|
| missing repository id | 400 | `{"message":"Missing repository id"}` |
| repository not connected | 404 | `{"message":"Repository not connected"}` |
| bad signature | 401 | `{"message":"Invalid signature"}` |
| ping | 200 | `{"message":"pong"}` |
| unhandled event | 200 | `{"message":"Ignored event: <event>"}` |
| PR action ignored | 200 | `{"message":"Ignored action: <action>"}` |
| PR queued | 200 | `{"message":"Review queued","pr_id":<n>}` |
| pr_only mode | 200 | `{"message":"Repository set to PR-only mode"}` |
| branch not watched | 200 | `{"message":"Branch not watched: <branch>"}` |
| branch deleted | 200 | `{"message":"Branch deleted, skipping"}` |
| no head commit | 200 | `{"message":"No head commit"}` |
| commit queued | 200 | `{"message":"Commit review queued","review_id":<n>}` |

## Compatibility landmines

Ordered by how quietly they fail.

1. **BullMQ v5 removed job timeouts.** Laravel's `$timeout = 120` must be
   re-implemented in the processor with `AbortController` and `Promise.race`,
   or a hung AI call occupies the single worker slot forever.
2. **Backoff.** BullMQ's built-in exponential is not `[60, 180, 600]`. Use
   `backoff: { type: 'custom' }` with a `backoffStrategy` returning the array
   by `attemptsMade`.
3. **`firstOrCreate` vs `updateOrCreate`.** Commits use `firstOrCreate` (does
   **not** update an existing row); PRs use `updateOrCreate` (does). Reversing
   these silently corrupts re-pushed commits or leaves stale PR titles.
4. **`users.github_token` is Laravel-encrypted** (AES-256-CBC, MAC-verified,
   PHP-serialised inner value). Reuse `common/utils/laravel-crypt.service.ts`;
   the same `APP_KEY` must be in this service's environment.
5. **Raw body for HMAC.** Express must expose the unparsed body on the webhook
   route. A re-serialised body produces a different digest and every delivery
   returns 401.
6. **`bigint` ids return as strings** from node-postgres. Existing
   `database/transformers.ts` casts them back, or `"id": 12` silently becomes
   `"id": "12"` in API responses the MCP server reads.
7. **`timestamp without time zone` holds UTC.** Reads are handled by
   `database/pg-types.ts`; writes must also be UTC, and `updated_at` must be
   maintained the way Laravel maintains it.
8. **Timestamps in JSON** use Carbon's `toIso8601String()` shape
   (`2026-06-12T11:28:00+00:00`), not `Date#toISOString()`. Existing
   `common/utils/iso8601.ts`.
9. **Redis eviction.** BullMQ requires `maxmemory-policy: noeviction`. The
   instance is shared with Laravel's cache — see Prerequisites.
10. **Cache key prefix.** Nest uses its own diff-cache prefix rather than
    reproducing Laravel's. Cost is one cold miss per repo at cutover.
11. **`url()` helper** in comment bodies and notifications maps to `APP_URL`.
12. **PR comment replacement.** `$review->comments()->delete()` runs before
    recreating — a re-analyze must not accumulate duplicate `review_comments`.

## Error handling

- Diff fetch non-2xx throws, so BullMQ retries per the backoff schedule
- Every AI model returning unparseable output is **not** an error: write the
  degradation summary (raw output truncated to 1500 chars), mark `completed`,
  return. `ai_model_used` falls back to `multi-fallback`.
- GitHub comment post failure matches Laravel, which does not check the
  response; the job proceeds to `completed`
- Email and Slack are wrapped individually; failure logs a warning only
- Permanent failure sets `status = 'failed'` and logs attempts and message

## Testing

Parity is the whole point, so tests target parity, not coverage.

**Golden fixtures (strongest guarantee).** Dump the PHP-generated system
prompt for each language combination — none, PHP, JS, TS, Python, Go, and
mixed — commit them, and assert `PromptBuilder` reproduces each string exactly.
Do the same for `buildSummaryComment` output.

**Unit.** `extractJson` against real malformed AI output for all four
strategies plus the null case. `detectLanguages` across the extension map.
`clampScore` boundaries. Fixes coercion and the 5-item cap.

**Webhook.** Signature fixtures (valid, invalid, absent). Every event and every
ignore branch, asserting exact status and body from the table above.

**Integration.** GitHub, Groq and OpenRouter stubbed with `nock`. Run both
pipelines end to end against a test database and assert the written rows —
including JSON column shapes and `review_comments` fan-out — match what
Laravel writes for the same input.

**Manual, before any real traffic.** One throwaway GitHub repository pointed at
the deployed `prism-api`, one real push and one real PR, comparing the posted
GitHub comment against a Laravel-produced one.

CI runs `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## Deployment

New `prism-api` service in `render.yaml`: Node, free plan, Singapore, own
512MB. Environment: `APP_KEY`, `APP_URL`, `DB_URL`, `REDIS_URL`,
`GROQ_API_KEY`, `OPENROUTER_API_KEY`, `RESEND_API_KEY`, `GITHUB_*`. Env
validation fails at boot, not at first request.

Extend the existing GitHub Actions keep-alive to ping `prism-api` `/health` as
well, so a webhook never arrives at a spun-down free service.

`synchronize` stays `false`. Laravel's migrations own the schema.

## Prerequisites

Confirm before enqueueing a single job:

- [ ] Redis `maxmemory-policy` is `noeviction`; if it is changed from an
      eviction policy, Laravel's cache entries need TTLs so the instance does
      not fill
- [ ] `GROQ_API_KEY` is present in the new service (an absent key silently
      skips the entire Groq chain and degrades output quality)
- [ ] Postgres connection ceiling on the free plan accommodates a second
      client; Nest is configured `max: 5`
- [ ] Capture golden responses from production for the five GET endpoints

## Cutover and rollback

1. Deploy `prism-api` with **no traffic routed to it**; watch `/health`
2. End-to-end verification on a throwaway repository
3. Flip the proxy: `POST /webhook/github` to nest
4. Laravel's webhook handler stays deployed and reachable; its worker keeps
   running for the two web re-analyze routes
5. Watch error rates and posted comments for 24h
6. Rollback at any point is the proxy route in reverse — no redeploy

## Follow-on slices

- **B** — GitHub OAuth, web auth to tokens, the ~30 read/write endpoints
- **C** — Next.js frontend replacing the 40 Inertia pages
- **D** — retire Laravel's worker, remove PHP from `render.yaml` and the
  Dockerfile, delete the 117 PHP files, `composer.*`, `artisan`, `vendor/`,
  Blade views and the Inertia frontend
