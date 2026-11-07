# CLAUDE.md

Rules for coding agents in this repo. Humans start at [README.md](README.md). This file is loaded
every session, so it stays short: the reasons live in [docs/](docs/README.md).

## Work efficiently (read this first)

1. **Don't explore.** Open [docs/code-map.md](docs/code-map.md), find the row for your change, and
   read only those files. Big files: `grep` or read a line range. The map lists files never to read in
   full (golden fixtures, static-copy views, lockfiles).
2. **Don't read all the docs.** [docs/README.md](docs/README.md) says which one document owns which
   fact. Open that one.
3. **Don't boot the stack to check your work.** Unit tests fake every store. Start Docker + the API
   **once, at the end**, and only if you touched modules or DI wiring, entities, config or env
   validation, or the webhook/queue path. For a UI change, run the targeted test while editing and do
   one browser check at the end, not one per edit. Start a server once, reuse it, stop it.
4. **Cheapest check first.** Measured here: typecheck 5 s (api) / 17 s (web); an API test run on one
   directory about 50 s (full suite about 110 s); a web test run costs about the same for one file as
   for all (about 65 s, startup dominates); lint 50 to 70 s per package. So: typecheck while editing;
   one narrow API test when logic changed ([map](docs/code-map.md#tests-run-the-one-that-matches));
   web tests, lint and each full suite **once**, before committing. Never re-run a green check.
5. **Trust this file and the code map.** Don't re-verify what they state. If one is wrong, fix it.
6. After editing, use `git diff` to see your change; don't re-read files you just wrote.

## What this is

AI code reviewer for GitHub. Three packages, no monorepo tooling, each with its own `package.json`
and `node_modules`: **`prism-api/`** (NestJS 11: REST API, webhook, and the BullMQ review worker in
the same process), **`prism-web/`** (Next.js 15 App Router; every API call is server-side) and
**`mcp-server/`** (one-file MCP server calling `/api/v1`). It began as a PHP app that is gone, but the
production database, schema and API tokens it wrote are not, which is why some formats below are fixed
([ADR 0001](docs/adr/0001-keep-the-stored-formats.md)).

## Commands and gates

```bash
# in prism-api/ (Node >= 20.11)
npm run typecheck && npm run lint && npm test     # narrow: npm test -- <path fragment> | -- -t "<name>"
npm run build | start:dev | start:prod

# in prism-web/ (Node >= 22.12)
npm run typecheck && npm run lint && npm test     # narrow: npm test -- <path fragment>
npm run dev  # :3001                              npm run build

# in mcp-server/
node --check index.js
```

**There is no CI** (the checks workflows were removed on 2026-11-06; the only workflow left is the API
deploy, which gates on `prism-api`'s typecheck, lint and tests only). Nothing enforces anything, so you are the
gate: typecheck, lint and test in every package you touched before each commit. In `prism-api`,
`no-floating-promises` and `no-misused-promises` are errors; fix the finding, or disable with the reason
on the same line. `npm run test:e2e` always fails (no `test/jest-e2e.json`); ignore it. Dependency audit
is manual: `npm audit --omit=dev --audit-level=high`.

Run commands from inside the package. **Run the API from `prism-api/`, on port 3999** (the web defaults to
it). **The `.env` in the repo root holds production credentials**: never load or point anything at it, and
check connection strings say `127.0.0.1`. Redis must be `maxmemory-policy noeviction`. Local setup:
[docs/development.md](docs/development.md).

## Rules that break silently

Each is a one-liner; the doc named after it has the why.

**Stored data** ([database](docs/database.md))
- `synchronize: false` and `migrationsRun: false`, forever. DDL is hand-applied from `schema.sql`.
- Status columns are `varchar`, never enums. CHECKs exist only on `pull_requests.status` and
  `review_comments.layer/severity`; code alone guards `commit_reviews.status`, `review_mode`, score.
- `bigint` ids serialise as JSON numbers (`database/transformers.ts`). Timestamps go through
  `common/utils/iso8601.ts` (`+00:00`), never `toISOString()`. `pg-types.ts` runs before any connection;
  `TZ=UTC`.
- `users.github_token`: only `common/utils/crypt.service.ts` reads or writes it (AES-256-CBC + MAC,
  PHP-serialised inside). Rotating `APP_KEY` makes every stored token unreadable. `JWT_SECRET` is not
  `APP_KEY`.
- API tokens are `{id}|{plaintext}` with `sha256(plaintext)` stored. `/api/v1` is additive-only.
- Error bodies are contracts: 422 `{message, errors}`; 401 exactly `Unauthenticated.`; 429 exactly
  `Too Many Attempts.`. `rawBody: true` stays (webhook HMAC). `esModuleInterop` is off: use
  `import x = require('x')` for CommonJS.
- Golden fixtures in `prism-api/test/fixtures/` are frozen. A prompt change must break a test on purpose:
  [procedure](docs/testing.md#changing-a-prompt-on-purpose), and say why in the commit.

**Review pipeline** ([pipeline](docs/review-pipeline.md))
- `pr-review.runner.ts` and `commit-review.runner.ts` are near-parallel. Change both.
- Runners throw so BullMQ retries; terminal cleanup lives in the processor's `failed` handler.
- The deadline **cancels**: the `AbortSignal` reaches every `fetch`, and a runner calls
  `signal.throwIfAborted()` before each side effect (persist, GitHub comment). New side effects must be
  safe to repeat. The job budget is **derived** in `review.queue.ts`; never hard-code it.
- Notification failures never fail a review. Worker `concurrency: 1` (512 MB).
- No usable model output **completes** the review as `not_reviewed`, behind two fixed summary strings in
  `ai/verdict.ts` that `isIncompleteReview()` recognises. Change both or neither.
- Groq only; model list, order and temperature are measured. Don't change them without re-measuring.
- Findings are validated against the anchors the model was shown; the **anchor's** location is displayed.
- Risk Radar is pure and `tryAssessRisk()` never throws. The risk comment section appears only when `risk`
  is supplied.
- Design Studio runs inline, with a 55 s abort and a per-user Redis limit that **fails closed**; any AI
  failure degrades to `baselineBlueprint()`.
- Redis data about a user must be erasable: write through the erasure-marker script and purge it in
  `AccountDataService`. Missing, foreign and malformed design ids are one identical 404.

**Auth and security** ([security](docs/security.md))
- Two live mechanisms: bearer tokens (`auth/api-token-auth.guard.ts`) and the JWT cookie
  (`modules/auth/web-auth.guard.ts`, loads the user row, checks revocation, fails open on a Redis error).
  Any new session guard must check revocation.
- The global `RateLimitGuard` runs first, so it verifies the cookie itself and keys signed-in traffic per
  user. Never key a bucket on an unverified claim.
- Log with Nest's `Logger`, never `console.*`. The access log records the path only.

**Web** ([frontend](docs/frontend.md))
- All API calls go through `lib/api.ts` on the server. No `NEXT_PUBLIC_` for the API origin. Both services
  must answer on **one hostname** (rewrites in `next.config.mjs`), or sign-in looks fine and every later
  request is anonymous.
- The browser never connects to the API origin (CSP `connect-src 'self'`). A GET aborts after 15 s with a
  504 `ApiError`. `apiGetAuthed()` folds 400/403/404 into not-found on purpose.
- CSP is per-request nonce (`middleware.ts`): an inline script reads `x-nonce`; a new third-party origin
  must be added to the policy.
- UI: Inter and JetBrains Mono **self-hosted**, no font CDN; text >= 12px; WCAG AA contrast (4.5:1) in both
  themes; `--accent` for text/borders/focus, `--accent-solid` for fills with white text; never remove the
  `:focus-visible` ring; icon buttons >= 44px; labels hidden on mobile use `sr-only sm:not-sr-only`, never
  `hidden`; a Server Action's rejection or `ok: false` must show; works at 390px without horizontal scroll
  (`grid-cols-1`); colours from tokens, no hex.

## Deploy, docs, git

- Production builds need `npm ci --include=dev` (devDependencies hold the build tools). Production is `prism-api`
  on a VPS and `prism-web` on Vercel, both from `main`; a local or unpushed change is not live.
- **Docs are part of the change.** Update the owning doc in the same commit. Don't hard-code counts or
  line numbers in prose. If you add, rename or delete a file the code map lists, update the map.
- A surprising, data-constrained or hard-to-reverse choice gets an [ADR](docs/adr/README.md). Fixed a
  known defect? Remove it from [known-issues](docs/known-issues.md); found one? Add it.
- Commits: one logical change, imperative subject, body says **why**. Stage files by name. Never commit
  `.env`, `dist/`, `.next/` or `node_modules/`.
