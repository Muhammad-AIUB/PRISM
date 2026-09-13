# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

PRism is an AI code reviewer for GitHub. Three packages, no monorepo tooling — each
has its own `package.json` and `node_modules`:

| Path | What it is |
|---|---|
| `prism-api/` | NestJS 11 — REST API, GitHub webhook, browser-facing routes, **and** the BullMQ review worker (same process) |
| `prism-web/` | Next.js 15 App Router — the entire frontend, all data fetched server-side |
| `mcp-server/` | Standalone MCP server (plain `index.js`, no build) that talks to `/api/v1` with a bearer token |

The codebase is entirely TypeScript: NestJS on the API, Next.js on the web. It
began as a port of a PHP application, and that application is gone — no PHP, no
`composer.json`, no framework left anywhere in the tree.

What did not go away is the data it wrote. **The production database, its
schema, and the API tokens in it predate this codebase**, which is why several
things below look stranger than they otherwise would. Those constraints are
about the bytes on disk, not about any framework, and they still bind.
`prism-api/MIGRATION.md` records which ones and why.

## Commands

```bash
# prism-api
npm run build           # nest build → dist/
npm run start:dev       # watch mode
npm run start:prod      # node dist/main.js
npm run typecheck       # tsc --noEmit   ← must pass before any commit
npm test                # jest           ← must pass before any commit
npm test -- json-extractor              # one file, by path fragment
npm test -- -t "clamps the score"       # one test, by name

# prism-web
npm run dev             # next dev on :3001
npm run build
npm run typecheck       # tsc --noEmit   ← must pass before any commit
```

`npm run lint` **fails in both packages** — no `eslint.config.js` exists in
`prism-api` and `prism-web` has no ESLint config or dependency. `npm run test:e2e`
also fails; `test/jest-e2e.json` was never created (`prism-api/test/` holds only
fixtures). Do not report these as regressions, and do not chase them unless asked.
The real gates are `typecheck` in both packages and `npm test` in `prism-api`.

## Running locally

Two servers plus Postgres and Redis. Ports matter: `prism-web` dev is `:3001` and
both `next.config.mjs` and `src/lib/api.ts` default `PRISM_API_ORIGIN` to
`http://127.0.0.1:3999` — so run the API on **3999**, or set `PRISM_API_ORIGIN`.

`prism-api/LOCAL-VERIFICATION.md` has the exact Docker commands, a throwaway
`APP_KEY`, a full boot command, and the checklist of what has been verified this
way. Read it before standing up a stack; two things from it are easy to get wrong:

- **Redis must run with `maxmemory-policy noeviction`.** BullMQ requires it. Under
  an eviction policy job keys are dropped silently and reviews simply never run —
  no error anywhere.
- **The schema is applied by hand** from `prism-api/schema.sql`. TypeORM runs with
  `synchronize: false` and always will.

**`.env` in the repository root holds production credentials.** It is gitignored
and nothing in the local workflow reads it. Never point a local command at it, and
check any connection string you are about to run actually says `127.0.0.1`.

## Architecture

### Request path

The browser only ever talks to `prism-web`. Every API call is made server-side from
a React Server Component or a Server Action via `prism-web/src/lib/api.ts`, so the
API origin, the session cookie and the user's GitHub token never reach the client —
which is why `PRISM_API_ORIGIN` deliberately has no `NEXT_PUBLIC_` prefix.

`prism-api` sets the session cookie, and a browser returns a cookie only to the
origin that set it. **Both services must answer on one hostname** — a reverse proxy
in production, the rewrites in `next.config.mjs` locally (`/auth/*`, `/api/v1/*`,
`/webhook/*` → the API). Break that and sign-in appears to work while every
subsequent request is anonymous.

`apiGetAuthed()` folds 403 into 404 on purpose: a distinct "forbidden" screen would
confirm a review id exists. Keep it that way.

### Two auth mechanisms, both live

- `auth/api-token-auth.guard.ts` — bearer tokens in `personal_access_tokens`, format
  `"{id}|{plaintext}"` with `sha256(plaintext)` stored. Deployed MCP servers hold
  tokens issued before this codebase existed. **This format cannot drift.**
- `modules/auth/web-auth.guard.ts` — the browser's JWT session cookie, signed with
  `JWT_SECRET`. It loads the user row rather than trusting the claims, so a deleted
  account stops working immediately.

`JWT_SECRET` and `APP_KEY` are not interchangeable: rotating `JWT_SECRET` signs
everyone out; rotating `APP_KEY` makes every stored `github_token` permanently
unreadable.

### The review pipeline

Webhook (`modules/webhook/`, HMAC over the raw body — IP allow-listing was
removed because Render's edge proxy masks GitHub's source address) or a re-analyze route
enqueues **only a row id** onto the `prism-reviews` BullMQ queue. `ReviewProcessor`
consumes it in the same Nest process — Render's free tier has no background-worker
type, and `concurrency: 1` is what keeps peak memory inside 512MB.

`commit-review.runner.ts` and `pr-review.runner.ts` are near-parallel ports of the
two original jobs; a change to one usually belongs in the other. Each: fetch diff
(Redis-cached 1h) → `detectLanguages()` → **first AI pass** (analysis) → persist →
**second AI pass** (`FixesService`, reusing the model that succeeded) → post a
GitHub comment → audit log → email/Slack.

Deliberate behaviours to preserve:

- Runners let exceptions propagate so BullMQ retries; terminal cleanup lives in the
  processor's `failed` handler — the run/cleanup split is deliberate.
- Retry backoff is `[60, 180, 600]` seconds via a custom strategy — BullMQ's builtin
  strategies cannot express it (`review.queue.ts`).
- Notification failures are caught and logged, never rethrown; a Slack outage must
  not roll back a completed review.
- If every model returns unparseable JSON the review completes with a null score and
  the raw text, rather than failing.
- `ai-client.service.ts`: **Groq only** — `llama-3.3-70b-versatile`, then
  `llama-3.1-8b-instant`. The OpenRouter fallback chain was removed in `bec6ce6`;
  nothing reads `OPENROUTER_API_KEY` any more and `GROQ_API_KEY` is required at boot.
  That makes Groq's native JSON mode (`response_format: json_object`) load-bearing
  rather than decorative — it is what the removed chain used to cover. The model
  list, its order and the temperature are measured behaviour. Do not reorder or
  "modernise" without re-measuring parse rates.
- The per-attempt job budget is **derived**, not written down (`review.queue.ts`):
  it imports `GROQ_TIMEOUT_MS`/`GROQ_MODELS` and the GitHub timeout so it cannot
  drift back under the work it wraps. The original `$timeout = 120` was copied across
  literally and was too small, which quietly made the graceful-degradation bullet
  above unreachable whenever models failed by hanging.
- The deadline **cancels**, it does not merely stop waiting. `review.processor.ts`
  aborts an `AbortController` that is threaded to every `fetch`, and the runners
  call `signal.throwIfAborted()` before each side effect. An earlier `Promise.race`
  version left the timed-out runner alive, which double-posted GitHub comments and
  raced `markFailed` against its own `status: 'completed'`.

## Stored-data invariants

These are not legacy cruft; they are load-bearing against live production data.
Breaking one usually produces no error, just wrong data. None of them require a
framework to be present — they describe bytes that are already on disk or
already in someone's MCP config.

- **`synchronize: false`, `migrationsRun: false`, forever.** `schema.sql` is the
  source of truth. TypeORM reconciliation would drop the CHECK constraints the
  status columns rely on.
- **Status columns are `varchar` + CHECK**, not Postgres enums. Entities declare
  `varchar` with a TS union type; declaring `type: 'enum'` makes TypeORM look for
  a type that does not exist.
- **`bigint` ids must serialise as JSON numbers.** node-postgres returns them as
  strings; `database/transformers.ts` casts them back.
- **Timestamps use `common/utils/iso8601.ts`, not `Date#toISOString()`.** The
  stored format carries an explicit `+00:00` offset where JS emits `.000Z`, and
  the MCP client displays these strings verbatim.
- **`database/pg-types.ts` must run before any DataSource connects** (it does, at the
  top of `main.ts`) so naive `timestamp` columns parse as UTC. `main.ts` also pins
  `process.env.TZ = 'UTC'`.
- **`users.github_token` is encrypted at rest** (AES-256-CBC, MAC-verified,
  PHP-serialised inner value, keyed by `APP_KEY`). `common/utils/crypt.service.ts`
  is the only reader/writer. The PHP serialisation is part of the stored
  ciphertext, not an import — it cannot be swapped for JSON without rewriting
  every existing row.
- **API tokens are `"{id}|{plaintext}"` with `sha256(plaintext)` stored.**
  Deployed MCP servers hold tokens in that shape; the format cannot drift.
- **Error envelopes are fixed by their clients**: 422 `{message, errors}` from
  `validationException`, everything else through `ApiExceptionFilter`,
  401 body exactly `"Unauthenticated."`, 429 exactly `"Too Many Attempts."`. The
  frontend's form components read `errors`, and the MCP server matches on the
  401/429 bodies.
- **`rawBody: true` in `main.ts`** — the webhook HMAC is computed over the exact
  bytes GitHub sent.
- `esModuleInterop` is off in `prism-api`; CommonJS packages use `import x = require('x')`.

### The golden fixtures are frozen

`prism-api/test/fixtures/` holds system prompts and encrypted payloads captured from
the deleted implementation, asserted byte-for-byte. They cannot be regenerated. A prompt change
must break a test on purpose — update the fixture in the same commit and say why.

## Deployment

`render.yaml` defines both services on Render's free tier. `buildCommand` uses
`npm ci --include=dev` in both, and the flag is required, not stylistic:
`NODE_ENV=production` makes npm skip devDependencies, which is where `@nestjs/cli`
(for `nest build`) and tailwind/postcss/typescript (for `next build`) live.
