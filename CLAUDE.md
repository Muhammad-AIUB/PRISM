# CLAUDE.md

Guidance for Claude Code (claude.ai/code) and other coding agents working in this
repository. Humans should start at [README.md](README.md) and [docs/README.md](docs/README.md);
this file is the short list of rules that are easy to break and expensive when broken.

## What this repository is

PRism is an AI code reviewer for GitHub. Three packages, no monorepo tooling. Each has
its own `package.json`, lockfile and `node_modules`.

| Path | What it is |
|---|---|
| `prism-api/` | NestJS 11. REST API, GitHub webhook, browser-facing routes **and** the BullMQ review worker, all in one process |
| `prism-web/` | Next.js 15 (App Router). The whole frontend; every API call is made server-side |
| `mcp-server/` | Standalone MCP server (`index.js`, no build step) that calls `/api/v1` with a bearer token |

The codebase is TypeScript throughout. It began as a port of a PHP application that no
longer exists. The data that application wrote did not go away: the production
database, its schema and the API tokens in it predate this code, so several formats
below are fixed for reasons that have nothing to do with the current framework. See
[docs/adr/0001-keep-the-stored-formats.md](docs/adr/0001-keep-the-stored-formats.md).

## Commands

Run each package's commands from inside that package. Nest's `ConfigModule` reads `.env`
from the working directory, so never start the API from the repository root.

```bash
# prism-api  (Node >= 20.11)
npm run typecheck       # tsc --noEmit            must pass before any commit
npm run lint            # eslint, --max-warnings 0   must pass
npm test                # jest                    must pass
npm test -- json-extractor        # one file, by path fragment
npm test -- -t "clamps the score" # one test, by name
npm run build           # nest build -> dist/
npm run start:dev       # watch mode
npm run start:prod      # node dist/main.js

# prism-web  (Node >= 22.12: the vitest/jsdom toolchain requires it)
npm run typecheck && npm run lint && npm test
npm run dev             # next dev on :3001
npm run build

# mcp-server
node --check index.js
```

`.github/workflows/ci.yml` runs all of the above, plus both builds and
`npm audit --omit=dev --audit-level=high`, on every pull request and on pushes to
`main`. Nothing in CI needs Postgres, Redis or a secret: unit tests fake their stores.
Keep it that way. A test that needs a live service does not belong in `npm test`.

`npm run test:e2e` in `prism-api` fails because `test/jest-e2e.json` was never created.
That is known. Do not report it as a regression and do not chase it unless asked.

Lint is a gate, not advice. In `prism-api`, `no-floating-promises` and
`no-misused-promises` are errors, because an unawaited promise there is a lost write
or an unhandled rejection in the worker. Fix what a rule finds. If a disable is truly
right, put the reason on the same line.

## Running locally

Full steps are in [docs/development.md](docs/development.md). The parts that bite:

- Run the API on port **3999**. `prism-web` defaults `PRISM_API_ORIGIN` to
  `http://127.0.0.1:3999` in both `next.config.mjs` and `src/lib/api.ts`.
- Redis must run with `maxmemory-policy noeviction`. BullMQ requires it. Under an
  eviction policy job keys are dropped silently and reviews never run, with no error.
- The schema is applied by hand from `prism-api/schema.sql`. TypeORM never creates or
  alters a table.
- **The `.env` in the repository root holds production credentials.** It is gitignored
  and nothing in the local workflow reads it. Never point a local command at it, and
  check that any connection string you are about to use says `127.0.0.1`.

## Architecture rules

Background in [docs/architecture.md](docs/architecture.md).

### Request path

The browser only ever talks to `prism-web`. Every API call is made on the server, from
a React Server Component or a Server Action, through `prism-web/src/lib/api.ts`. The
API origin, the session cookie and the user's GitHub token never reach client
JavaScript. That is why `PRISM_API_ORIGIN` has no `NEXT_PUBLIC_` prefix.

**Both services must answer on one hostname.** `prism-api` sets the session cookie and a
browser returns a cookie only to the origin that set it. `next.config.mjs` rewrites
`/auth/*`, `/api/v1/*` and `/webhook/*` to the API. Break that and sign-in appears to
work while every later request is anonymous.

**The one exception is the wake page.** On Render's free tier `prism-api` sleeps after
15 idle minutes. While it sleeps, Render's edge answers every request `prism-web`
makes with a 429 (`x-render-routing: hibernate-rate-limited`) without starting the
service. Only a request from outside Render wakes it. So `lib/api.ts` sends a page
load that finds the API asleep to `/waking`, where the visitor's browser pings the API
itself and then returns. `/waking` is the only page whose CSP `connect-src` includes
the API origin. Sign-in starts at `/login/github` for the same reason. Server actions do
not redirect; they get a 503 `ApiError` asking the visitor to reload.

`apiGetAuthed()` folds 400, 403 and 404 into the same not-found page on purpose. A
distinct "forbidden" screen would confirm that a review id exists. Keep it.

### Security headers

- **prism-web:** `src/middleware.ts` sets a per-request nonce CSP
  (`script-src 'self' 'nonce-...' 'strict-dynamic'`). An inline `<script>` you add must
  take the nonce from the `x-nonce` request header, the way `layout.tsx` does for the
  theme script, or it will not run. A new third-party origin (images, fonts, APIs)
  must be added to the policy deliberately. `'unsafe-eval'` and `ws:` are allowed in
  development only. `style-src` keeps `'unsafe-inline'` because components use inline
  `style` throughout.
- **prism-api:** helmet with `default-src 'none'; frame-ancestors 'none'`. The API
  never serves a page.

### Observability

Every API request gets an `X-Request-Id` (a safe incoming one is kept). It is returned
in the response and held in AsyncLocalStorage (`common/observability/request-context.ts`).
`AppLogger` stamps it on every log line, and stamps the job id inside `ReviewProcessor`.
Production writes one JSON object per line. `prism-web`'s middleware assigns an id per
render and `lib/api.ts` forwards it. Use Nest's `Logger`, never `console.*`, or the line
loses its id. The access log records the path only, because the OAuth callback carries
a code in its query string.

### Two auth mechanisms, both live

- `auth/api-token-auth.guard.ts`: bearer tokens in `personal_access_tokens`, format
  `"{id}|{plaintext}"`, with `sha256(plaintext)` stored. Deployed MCP servers hold
  tokens issued before this codebase existed. **The format cannot drift.**
- `modules/auth/web-auth.guard.ts`: the browser's JWT session cookie, signed with
  `JWT_SECRET`. It loads the user row instead of trusting the claims, so a deleted
  account stops working at once. Logout revokes the token
  (`session-revocation.store.ts` keeps `sha256(token)` in Redis until the token would
  have expired). Both `WebAuthGuard` and `OptionalWebAuthGuard` refuse a revoked token.
  The revocation check fails open on a Redis error, because an outage must not sign
  everyone out; the JWT signature is still verified. Any new guard that reads the
  session must check revocation too.

The global `RateLimitGuard` runs before either guard, so it verifies the session cookie
itself and keys signed-in browser traffic per user. Every browser request reaches the
API from `prism-web`'s one address, so keying those by IP would put the whole site in
one 100/minute bucket. Never key a bucket on an unverified claim.

`JWT_SECRET` and `APP_KEY` are not interchangeable. Rotating `JWT_SECRET` signs everyone
out. Rotating `APP_KEY` makes every stored `github_token` permanently unreadable.

### The review pipeline

Background in [docs/review-pipeline.md](docs/review-pipeline.md).

A webhook (HMAC over the raw body; IP allow-listing was removed because Render's edge
masks GitHub's source address) or a re-analyze route enqueues **only a row id** onto the
`prism-reviews` BullMQ queue. `ReviewProcessor` consumes it in the same Nest process.
Render's free tier has no background-worker type, and `concurrency: 1` is what keeps
peak memory inside 512 MB.

`commit-review.runner.ts` and `pr-review.runner.ts` are near-parallel. A change to one
usually belongs in the other. Each does: fetch diff (Redis-cached 1 h) -> `prepareDiff()`
-> first AI pass -> validate every finding against the diff -> persist -> second AI pass
(`FixesService`, reusing the model that succeeded) -> post a GitHub comment -> audit log
-> Slack, if configured. There are no email notifications; the feature was removed.
`users.email_notifications` still exists in the database but is unmapped and unread.

Behaviours to preserve:

- Runners let exceptions propagate so BullMQ retries. Terminal cleanup lives in the
  processor's `failed` handler. The run/cleanup split is deliberate.
- Retry backoff is `[60, 180, 600]` seconds through a custom strategy
  (`review.queue.ts`); BullMQ's built-in strategies cannot express it. With 3 attempts
  only the first two delays are used.
- Notification failures are caught and logged, never rethrown. A Slack outage must not
  roll back a completed review.
- If every model returns unparseable output the review **completes** with a null score
  and the raw text, behind one of two fixed summary prefixes (`ai/verdict.ts`). Those
  prefixes are a contract: `isIncompleteReview()` recognises them to report
  `not_reviewed`. Reword one without the other and a review that checked nothing
  becomes a green "nothing found".
- `ai/ai-client.service.ts` is **Groq only**: `llama-3.3-70b-versatile`, then
  `llama-3.1-8b-instant`, temperature 0.2, `response_format: json_object`. The OpenRouter
  chain was removed in `bec6ce6`, so native JSON mode is now what keeps output parseable. The model list,
  its order and the temperature are measured behaviour. Do not reorder or "modernise"
  them without re-measuring parse rates. `GROQ_API_KEY` is required at boot.
- The per-attempt job budget is **derived**, not written down (`review.queue.ts`). It
  imports `GROQ_TIMEOUT_MS`, `GROQ_MODELS` and the GitHub timeout, so it cannot drift
  back under the work it wraps. (The original fixed 120 s was too small, which made
  graceful degradation unreachable whenever models failed by hanging.)
- The deadline **cancels**; it does not just stop waiting. `review.processor.ts` aborts
  an `AbortController` that is threaded into every `fetch`, and the runners call
  `signal.throwIfAborted()` before each side effect. An earlier `Promise.race` version
  left the timed-out runner alive, which double-posted GitHub comments and raced
  `markFailed` against its own `status: 'completed'`.
- Every reported location is checked against the lines the model was actually shown
  (`diff/render.ts`, `ai/issue-validator.ts`). The location displayed is the anchor's,
  never the model's. A finding that does not resolve is dropped, not shown at a guess.

### Risk Radar and Design Studio

Background in [docs/risk-radar.md](docs/risk-radar.md) and
[docs/design-studio.md](docs/design-studio.md).

- `diff/risk-radar.ts` is **pure and deterministic**: no model, network or database.
  The runners call `tryAssessRisk()`, which never throws, because a risk bug must cost
  a comment its risk section and never cost the user their review. The PR runner saves
  the assessment of the diff it reviewed (`ReviewRiskStore`) and the pages serve that,
  so risk always matches the verdict beside it. A live assessment of the current head is
  only a fallback and stays labelled `basis: "current"`.
- `SummaryCommentBuilder` appends the risk section only when `risk` is supplied, so the
  byte-for-byte comment tests stay valid.
- Design Studio runs **inline**, not on the concurrency-1 queue. It is bounded by
  `DESIGN_BUDGET_MS` (an `AbortSignal`) and a per-user Redis limit checked *before* the
  model call. The limit **fails closed** (503) when Redis is unreadable, and every
  `MULTI/EXEC` result is checked per command. It is a service-level limit and not
  `@Throttle` because it must be per user on both the web and API-token routes, and it
  lives in Redis so it survives restarts.
- Every AI failure in Design Studio degrades to `baselineBlueprint()` with a `notice`.
  It never fails the request.
- **User data in Redis must be erasable.** Account deletion sets the account's erasure
  marker (`account/erasure-marker.ts`) and then clears Redis (`AccountDataService`). Any
  store that holds a user's data must write through an atomic script that refuses while
  that marker exists, as `DesignStore` and `ReviewRiskStore` do, and must be purged
  there. Otherwise work in flight during deletion re-creates data nothing can find.
- Blueprints live in **Redis** (`design:{uuid}`, 30-day TTL, owner stored beside the
  payload), deliberately not Postgres: no DDL. Missing, expired, malformed and foreign
  ids must stay one indistinguishable 404.
- `design/design-prompt.ts` is separate from `ai/prompt-builder.service.ts` so the frozen
  review fixtures are unaffected by design-prompt changes.

## UI standards (prism-web)

The bar is what Apple, Google or GitHub would ship. These are rules, not preferences.
Detail is in [docs/frontend.md](docs/frontend.md).

- **Type:** Inter (optical-size variable cut) for UI and JetBrains Mono for code, both
  **self-hosted** through `@fontsource-variable/*` imported in `layout.tsx`. Never add a
  Google Fonts `<link>` or any third-party font CDN.
- **Minimum text size is 12px** (`text-xs`). No `text-[10px]`, `text-[11px]` or smaller,
  including badges and counters.
- **Contrast is WCAG AA (4.5:1) for all text**, in both themes, on every surface it can
  sit on (`--bg-card` and `--bg-hover` included). Check the ratio before changing a
  colour token.
- **Two accents:** `--accent` is for text, icons, borders and focus rings.
  `--accent-solid` is for fills that carry white text (`.btn-primary`, avatars). Never put
  white text on `--accent`.
- **Keyboard:** the global `:focus-visible` ring in `globals.css` must not be removed or
  overridden with `outline: none` without a visible replacement.
- **Touch targets:** at least 44x44px for icon-only buttons, 32px for inline chips.
- **Motion** respects `prefers-reduced-motion`; that is handled globally.
- **Labels hidden on mobile** use `sr-only sm:not-sr-only`, never `hidden`. `hidden`
  removes the text from screen readers and leaves an unnamed button.
- **Server actions can reject** (network drop, a deploy mid-page). One called from a
  `useEffect` must `.catch` into a visible state, or the component spins forever. One
  whose result says `ok: false` must show that result. A failure must never look like a
  success.
- **Layout** works at 390px with no horizontal scroll. A grid that collapses on mobile
  uses an explicit `grid-cols-1`, because an implicit `auto` column grows to fit
  `truncate`d text.
- Colours come from the CSS tokens. No hard-coded hex in components.

`prism-web` has a Vitest suite (`npm test`), but most views are untested. Verify UI
changes in a real browser, in both themes, before committing: no console errors and no
overflow at 390px.

## Stored-data invariants

These are not legacy clutter. Live production data depends on every one of them, and
breaking one usually produces no error, only wrong data. They describe bytes already on
disk or already in someone's MCP config. Detail in [docs/database.md](docs/database.md).

- **`synchronize: false` and `migrationsRun: false`, forever.** `schema.sql` is the source
  of truth. TypeORM reconciliation would drop the CHECK constraints some columns rely on.
- **Status columns are `varchar`, not Postgres enums.** Entities declare `varchar` with a
  TypeScript union; `type: 'enum'` makes TypeORM look for a type that does not exist.
  CHECK constraints exist on `pull_requests.status`, `review_comments.layer` and
  `review_comments.severity`. They do **not** exist on `commit_reviews.status`,
  `repositories.review_mode` or `overall_score`, so only code guards those.
- **`bigint` ids must serialise as JSON numbers.** node-postgres returns strings;
  `database/transformers.ts` casts them back.
- **Timestamps go through `common/utils/iso8601.ts`, not `Date#toISOString()`.** The
  stored format carries an explicit `+00:00` offset where JS emits `.000Z`, and the MCP
  client displays the strings verbatim.
- **`database/pg-types.ts` must run before any DataSource connects** (it does, at the top
  of `main.ts`) so naive `timestamp` columns parse as UTC. `main.ts` also pins
  `process.env.TZ = 'UTC'`.
- **`users.github_token` is encrypted at rest** (AES-256-CBC, MAC-verified, PHP-serialised
  inner value, keyed by `APP_KEY`). `common/utils/crypt.service.ts` is the only reader and
  writer. The PHP serialisation is part of the stored ciphertext; it cannot become JSON
  without rewriting every row.
- **API tokens are `"{id}|{plaintext}"` with `sha256(plaintext)` stored.**
- **Error envelopes are fixed by their clients.** Validation errors are 422
  `{message, errors}` from `validationException`. Everything else goes through
  `ApiExceptionFilter`. A 401 body is exactly `{"message":"Unauthenticated."}` and a 429 is
  exactly `{"message":"Too Many Attempts."}`. The frontend's forms read `errors`, and the
  MCP server relays the response body to the model, so these strings are part of the API.
- **`rawBody: true` in `main.ts`.** The webhook HMAC is computed over the exact bytes
  GitHub sent.
- **`/api/v1` is additive-only.** Fields may be added, never removed or renamed.
- `esModuleInterop` is off in `prism-api`. CommonJS packages use `import x = require('x')`.

### The golden fixtures are frozen

`prism-api/test/fixtures/` holds system prompts and encrypted payloads captured from the
deleted implementation, asserted byte for byte. The encrypted payloads cannot be
regenerated. A prompt change must break a test on purpose: update
`system-prompts.json` in the same commit and say why in the commit message. The
procedure, and the three spec assertions that break by hand, are in
[docs/testing.md](docs/testing.md#changing-a-prompt-on-purpose).

## Deployment

`render.yaml` defines both services on Render's free tier. `buildCommand` uses
`npm ci --include=dev` in both, and the flag is required, not stylistic:
`NODE_ENV=production` makes npm skip devDependencies, which is where `@nestjs/cli` (for
`nest build`) and tailwind, postcss and typescript (for `next build`) live. See
[docs/deployment.md](docs/deployment.md).

## Working in this repository

- **Docs are part of the change.** If a change alters behaviour a document describes,
  update that document in the same pull request. [docs/README.md](docs/README.md) says
  which document owns what. Do not hard-code test counts, route counts or line numbers
  in prose; they go stale within a week.
- **Decisions get a record.** A choice that is surprising, constrained by production data
  or expensive to reverse gets an ADR in [docs/adr/](docs/adr/). Add one in the pull
  request that makes the choice.
- **Commits** are one logical change each, in the imperative, and the body says *why*
  (see `git log` for the house style). Do not commit generated output, `.env` files or
  anything under `node_modules`.
- **Known defects** are listed in [docs/known-issues.md](docs/known-issues.md). If you fix
  one, remove it from that file in the same pull request. If you find one, add it.
