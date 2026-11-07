# Code map

Where things live, so you can open the two or three files a change needs instead of exploring.
Paths are repo-relative unless a heading names a root. If you add, rename or delete a file listed
here, update this page in the same change. If a row is wrong, fix it; do not work around it.

## I want to change... open these

Open the first column's files only. Follow a link to a doc when you need the reasoning. A path
starting `prism-web/` or `docs/` is repo-relative; one starting `app/`,
`components/` or `lib/` is under `prism-web/src/`; any other is under `prism-api/src/`.

| Change | Files | Also touch |
|---|---|---|
| What a webhook does (events, filters, responses) | `prism-api/src/modules/webhook/webhook.service.ts` | [api-reference](api-reference.md#webhook) |
| A review step, in **either** runner | `modules/review/pr-review.runner.ts` **and** `commit-review.runner.ts` | [review-pipeline](review-pipeline.md) |
| Retries, backoff, the job budget, the deadline | `modules/review/review.queue.ts`, `review.processor.ts` | [ADR 0003](adr/0003-derive-the-job-budget-and-cancel-on-deadline.md) |
| The review prompt or language rules | `ai/prompt-builder.service.ts` | Frozen fixtures: [testing](testing.md#changing-a-prompt-on-purpose) |
| The Groq call, models, timeouts | `ai/providers/groq.provider.ts`, `ai/providers/http.ts`, `ai/ai-client.service.ts` | [ADR 0007](adr/0007-groq-is-the-only-ai-provider.md); re-measure first |
| Finding validation, the verdict, the score | `ai/issue-validator.ts`, `ai/verdict.ts` | The two fallback summaries are a contract |
| A user's own provider key and model | `ai/providers/`, `ai/user-ai-settings.service.ts`, `modules/settings/ai-settings.*`, `components/settings/AiModelSection.tsx`, table `user_ai_settings` | [ADR 0012](adr/0012-optional-user-supplied-api-key.md) |
| Suggested fixes | `ai/fixes.service.ts`, `ai/fix-validator.ts` | |
| Which part of a diff is shown, anchors | `diff/prepare.ts` (`prepareBatch`), `batch-pack.ts`, `file-selection.ts`, `hunk-index.ts`, `render.ts` | |
| Batching: size, cap, pacing, the job budget numbers | `modules/review/batching.config.ts` | [ADR 0013](adr/0013-review-every-file-in-batches.md); retune after a live run |
| How a change is split into batches, or merged back | `diff/batch-pack.ts`, `diff/risk-rank.ts`, `ai/batch-merge.ts`, `modules/review/batched-review.service.ts` | [review-pipeline](review-pipeline.md#4-preparing-the-diff) |
| The saved progress of a review (retry resume), its erasure | `modules/review/review-checkpoint.store.ts`, `modules/account/account-data.service.ts` | Redis; write through the erasure-marker script |
| A Risk Radar signal or question | `diff/risk-radar.ts` (**24 KB: grep the constant, read a range**) | `risk-radar.spec.ts`, [risk-radar](risk-radar.md) |
| The GitHub comment text | `modules/review/summary-comment.builder.ts` | Byte-for-byte tests |
| GitHub REST calls | `github/github-client.service.ts` | |
| Slack | `notifications/slack.service.ts` | |
| An `/api/v1` route | `modules/api-v1/reviews/reviews.controller.ts`, `reviews.service.ts`, `modules/api-v1/reviews/dto/review-response.dto.ts` | [api-reference](api-reference.md); additive-only |
| A browser-facing route | the matching folder under `modules/` (controller + service) | `prism-web/src/lib/types.ts`, the page |
| Sign-in, sessions, logout | `modules/auth/*` | [security](security.md) |
| API tokens | `auth/api-token-auth.guard.ts`, `auth/personal-access-token.service.ts` | Format cannot change |
| Rate limits | `common/guards/rate-limit.guard.ts`, `app.module.ts` (`ThrottlerModule`) | |
| An environment variable | `config/env.validation.ts`, `config/configuration.ts` | `prism-api/.env.example`, [configuration](configuration.md) |
| A table or column | `database/entities/*`, `prism-api/schema.sql` (**hand-applied DDL**) | [database](database.md) |
| Account deletion, erasure | `modules/account/*`, `modules/security/security.service.ts` | Any Redis store of user data |
| Design Studio | `design/*` (pure), `modules/design/*` (service, store, controllers) | [design-studio](design-studio.md) |
| Dashboard numbers | `modules/dashboard/dashboard.service.ts` | |
| PDF export | `modules/reviews-web/pdf-report.service.ts` | |
| How the web app calls the API | `prism-web/src/lib/api.ts` | [frontend](frontend.md) |
| CSP, request id | `prism-web/src/middleware.ts` | |
| Auto-deploy of the API to the VPS | `.github/workflows/deploy.yml`, `deploy/deploy.sh` | [deployment](deployment.md#auto-deploy-on-push) |
| Colours, spacing, focus ring | `prism-web/src/app/globals.css`, `tailwind.config.ts` | Contrast rules in [frontend](frontend.md#standards) |
| Nav, shell, theme toggle | `components/layouts/AuthenticatedLayout.tsx`, `components/ui/ThemeToggle.tsx`, `ThemeSync.tsx` | |
| A review page | `app/reviews/[pullRequest]/page.tsx`, `components/review/ReviewShowView.tsx`; commits: `app/commits/[commitReview]/page.tsx`, `CommitShowView.tsx` | Shared pieces in `components/review/parts.tsx` |
| A Server Action | `prism-web/src/app/<feature>/actions.ts` | Must surface `ok: false` and rejections |

## prism-api/src

| Path | What it holds |
|---|---|
| `main.ts` | Boot order (pg type parsers, `TZ=UTC`, `rawBody`, helmet, cookies, validation pipe, filter) |
| `app.module.ts` | TypeORM (`synchronize: false`), BullMQ, throttler, every feature module |
| `config/` | Env validation (fails at boot) and typed config |
| `database/` | `entities/` (one per table), `transformers.ts` (bigint), `pg-types.ts`, `repository.helpers.ts` (review modes, watched branches, webhook events), `review-feed.mapper.ts` |
| `ai/` | `ai-client`, `prompt-builder`, `json-extractor`, `issue-validator`, `fix-validator`, `fixes.service`, `verdict`, `token-pacer`, `batch-merge`, `user-ai-settings.service` (the encrypted personal key), `providers/` (`AiProvider`, `groq`, `openai-compatible`, `anthropic`, `registry`, `http`) |
| `diff/` | Pure: `hunk-index`, `render`, `file-selection`, `prepare`, `batch-pack`, `risk-rank`, `language-detector`, `git-paths`, `risk-radar` |
| `design/` | Pure: `blueprint`, `design-prompt`, `blueprint-normaliser`, `design-baseline`, `blueprint-markdown` |
| `github/` | The GitHub REST client |
| `cache/`, `redis/` | Redis client; `diff-cache.service.ts` (1 h), `json-cache.service.ts` |
| `auth/` | API-token guard and token service (`/api/v1`) |
| `common/` | `filters/api-exception.filter.ts`, `guards/rate-limit.guard.ts`, `observability/` (request id, logger), `pipes/parse-id.pipe.ts`, `validation/validation-errors.ts` (422), `utils/` (crypto, `iso8601.ts`) |
| `notifications/`, `audit/` | Slack; the audit-log writer |
| `modules/webhook` | GitHub intake |
| `modules/review` | Queue policy, `review.processor.ts`, the two runners, comment builder, summary composer, batching config, `batched-review.service.ts` (+ `batched-review.testing.ts`, shared test fakes), `review-checkpoint.store.ts` / `.module.ts` |
| `modules/api-v1/reviews` | `/api/v1` reviews, risk, re-analyze |
| `modules/auth` | OAuth, session guard, optional guard, revocation store |
| `modules/reviews-web`, `modules/repositories`, `modules/dashboard`, `modules/settings`, `modules/profile`, `modules/security`, `modules/demo`, `modules/health` | Browser-facing routes, one folder each |
| `modules/risk` | `change-risk.service.ts` (live assessment), `review-risk.store.ts` (saved assessment, Redis) |
| `modules/design` | Design Studio service, `design.store.ts` (Redis), controllers, DTO |
| `modules/account` | Account deletion and `erasure-marker.ts` |
| Also at `prism-api/` | `schema.sql`, `scripts/` (`regen-fixtures.ts`, `measure-anchoring.ts`), `test/fixtures/` |

## prism-web/src

| Path | What it holds |
|---|---|
| `app/` | Routes. `page.tsx` is a Server Component that fetches; `actions.ts` holds Server Actions; `app/reviews/[pullRequest]/export/route.ts` and `app/design/[id]/markdown/route.ts` are route handlers; `globals.css` is the theme |
| `components/` | By feature: `review/`, `repositories/`, `design/`, `security/`, `settings/`, `dashboard/`, `demo/`, `help/`, `layouts/`, `ui/`, `auth/`, `profile/` |
| `lib/` | `api.ts` (the only API client), `session.ts`, `types.ts` (API response shapes), `time.ts`, `repository-reviews.ts` |
| `middleware.ts` | Per-request CSP nonce and request id |
| `test/setup.ts` | Vitest setup |

## Do not read these in full

They cost tokens and rarely help. Use `grep` or a line range.

| File | Why |
|---|---|
| `prism-api/test/fixtures/system-prompts.json` (59 KB) | Frozen golden prompts, a few enormous lines. Never edit by hand; see [testing](testing.md#changing-a-prompt-on-purpose) |
| `prism-api/test/fixtures/encrypted-payloads.json` | Frozen ciphertexts |
| `prism-web/src/components/help/HowToUseView.tsx` (39 KB), `prism-web/src/components/security/SecurityIndexView.tsx` (37 KB) | Static copy. Only for a wording change |
| `prism-api/src/diff/risk-radar.ts` (24 KB), `prism-web/src/components/review/parts.tsx`, `prism-web/src/components/design/BlueprintView.tsx`, `prism-api/src/design/design-baseline.ts` | Big. Read a range |
| `prism-api/schema.sql` (17 KB) | Read the one table you need; [database](database.md) has the summary |
| `package-lock.json` (three packages), `node_modules/`, `dist/`, `.next/` | Generated |

## Tests: run the one that matches

Specs sit beside the code. Costs measured on the maintainer's Windows machine (2026-11-06); startup
dominates, so narrowing helps the API a little and the web not at all:

| Check | Time |
|---|---|
| `npm run typecheck` | api 5 s, web 17 s: **the cheap loop, use it while editing** |
| API tests, one directory | about 50 s (the full API suite about 110 s) |
| Web tests, one file | about 65 s, the same as the full web suite |
| `npm run lint` | api about 50 s, web about 70 s |

So: typecheck while editing, one narrow API test when logic changed, and run web tests, lint and each
full suite **once**, before committing.

| You changed | Run (from the package directory) |
|---|---|
| `diff/` | `npm test -- src/diff` |
| Batching (packer, pacer, merge) | `npm test -- src/diff src/ai`; the service: `npm test -- src/modules/review/` |
| `ai/` | `npm test -- src/ai` |
| A runner, the processor, the queue, the comment | `npm test -- src/modules/review/` (keep the trailing slash, or `reviews-web` matches too) |
| Risk (service or store) | `npm test -- src/modules/risk` |
| Design Studio | `npm test -- src/design src/modules/design` |
| Auth, guards, sessions | `npm test -- src/modules/auth src/common/guards` |
| Account deletion | `npm test -- src/modules/account` |
| One file | `npm test -- <path fragment>`; one test: `npm test -- -t "<name>"` |
| `prism-web` `lib/` or a component | `npm test -- <path fragment>` (needs Node 22.12 or newer) |
| Anything | `npm run typecheck` is cheap; run it often |

Other areas (webhook, settings, profile, repositories, reviews-web, database, github, common) each
have one spec in their own folder.
