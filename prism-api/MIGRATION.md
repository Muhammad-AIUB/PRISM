# PRism: Laravel → NestJS migration

Strangler-fig migration. Laravel and NestJS run side by side against **one**
Postgres database and **one** Redis; a reverse proxy moves routes across one
slice at a time. No dual-write, no data copy, no cutover weekend.

---

## What is actually being migrated

The Laravel app is not a JSON API with a separate frontend. Most of it is
**Inertia** — controllers return server-rendered page objects that only the
bundled Vue/React frontend understands (`HandleInertiaRequests` middleware,
`resources/js`). NestJS has no production-grade Inertia adapter.

So this is two migrations, not one, and they must be sequenced:

| Surface | Nature | Migratable today |
|---|---|---|
| `/api/v1/*` | Real JSON, external client (MCP server) | **Yes** |
| `/health`, `/up` | JSON probe | **Yes** |
| `/webhook/github` | JSON in, no response body contract | Yes, after the worker |
| `/dashboard`, `/reviews/*`, `/settings`, … | Inertia page responses | **No** — needs the SPA decoupling first |
| `/auth/github/*`, Breeze auth | Session + Inertia redirects | **No** — see *Sessions* below |

**Slice 1 (this repo, done): the five `GET /api/v1/*` endpoints + `/health`.**
They are the only surface with a versioned contract and an external consumer,
which makes them both the safest and the most valuable thing to move first.

---

## Compatibility facts that make parallel running work

These were verified against the Laravel source, not assumed.

### 1. Sanctum tokens authenticate unchanged
`personal_access_tokens.token` stores `sha256(plaintext)` where the bearer is
`"{id}|{plaintext}"`. `SanctumAuthGuard` reads the same rows with the same
algorithm, so a token generated in Settings → API Tokens works against either
runtime. **No token re-issuing, no dual token store.**

### 2. Timestamps must not use `Date#toISOString()`
Carbon's `toIso8601String()` emits `2026-06-12T11:28:00+00:00`.
JS emits `2026-06-12T11:28:00.000Z`. Different strings, same instant — and the
MCP client displays them. See `common/utils/iso8601.ts`.

### 3. `bigint` ids must be cast back to numbers
node-postgres returns `bigint` as a **string**. Laravel serialised ids as JSON
numbers, so an un-transformed port silently changes `"id": 12` to `"id": "12"`.
See `database/transformers.ts`.

### 4. `timestamp` columns must be parsed as UTC
Laravel's `timestamps()` creates `timestamp WITHOUT time zone` and writes UTC.
node-postgres would parse those in the host's local zone. See
`database/pg-types.ts` — it must run before the DataSource connects.

### 5. Laravel `enum()` is not a Postgres enum
On pgsql it compiles to `varchar` + a CHECK constraint. Entities declare
`varchar` with a TS union type. Declaring `type: 'enum'` would make TypeORM
look for a pg type that does not exist.

### 6. `synchronize` stays `false`, forever
Laravel's migrations own the schema. TypeORM reconciliation would drop the
CHECK constraints behind those enum columns and rewrite indexes underneath a
running app.

### 7. `users.github_token` is Laravel-encrypted
AES-256-CBC, MAC-verified, PHP-serialised inner value, keyed by `APP_KEY`.
`common/utils/laravel-crypt.service.ts` reads it. The same `APP_KEY` must be
present in this service's environment.

### 8. Rate limits are part of the contract
`RateLimiter::for('api')` is 100/min keyed by user id, falling back to IP.
429 body is `{"message":"Too Many Attempts."}`. See
`common/guards/laravel-throttler.guard.ts`.

---

## Known blockers, stated plainly

### Queue jobs cannot be shared — resolved by porting the worker
Laravel's `database` queue payload is PHP-serialised `App\Jobs\*` objects.
Node cannot enqueue a job Laravel's worker will run, so rather than bridging
the two, the worker itself was ported to BullMQ (slice A, done).

The two queues now run side by side and share no rows: Laravel consumes the
`jobs` table, NestJS consumes Redis. They cannot contend.

**Resolved.** Every route that starts a review now runs on BullMQ: webhook
ingestion, both `/api/v1/**/re-analyze` routes, and — since the web auth guard
landed — both session-authenticated web re-analyze routes.

Laravel's `queue:work` still has to run until the proxy actually points those
routes at NestJS, because until then Laravel is the one receiving them. Once
it does, no path enqueues a Laravel job and the worker can be retired.

### Sessions cannot be shared
Laravel sessions are PHP-serialised, encrypted with `APP_KEY`, in the
`sessions` table. Reading them from Node is possible but not worth the coupling.
Web auth stays on Laravel until the frontend is decoupled from Inertia and
moves to token/JWT auth.

---

## Route-by-route cutover

Reverse proxy (Render service, nginx, or Cloudflare Worker) in front of both:

```
GET  /api/v1/me                            → nest
GET  /api/v1/reviews                       → nest
GET  /api/v1/reviews/latest                → nest
GET  /api/v1/commits/:id                   → nest
GET  /api/v1/pull-requests/:id             → nest
POST /api/v1/**/re-analyze                 → nest
POST /webhook/github                       → nest      # slice A
GET  /auth/github, /auth/github/callback   → nest      # slice B
GET  /dashboard                            → nest
GET|POST /repositories/**                  → nest
GET|POST|DELETE /settings/**               → nest
GET|PATCH|DELETE /profile                  → nest
GET|POST /reviews/**, /commits/**          → nest
GET  /security, /security/**               → nest
GET  /help/how-to-use                      → nest
GET  /demo, /demo/review/:id               → nest
GET  /health                               → nest
*                                          → laravel   # Breeze password auth only
```

Every controller in `app/Http/Controllers` except the Breeze password-auth set
now has a NestJS equivalent. What is left on Laravel is register / login /
forgot-password / reset-password / verify-email / confirm-password, which the
GitHub OAuth flow does not use.

Rollback for any slice is a one-line proxy change, no redeploy of either app.

---

## Checklist

### Phase 0 — before touching anything
- [x] Inventory every route, model, job and middleware
- [x] Identify which surfaces are JSON vs Inertia
- [x] Confirm the DB engine (Postgres) and that both apps can share it
- [ ] **Capture golden responses from production** for all five GET endpoints
      (`curl` with a real token, save the raw bytes) — these are the diff target
- [ ] Confirm the current 404 body for an unknown `{id}` with `APP_DEBUG=false`
      and align `ReviewsService`'s `NotFoundException` message to match
- [ ] Put the free-tier Postgres connection ceiling on paper; NestJS is
      configured for `max: 5`

### Phase 1 — scaffold (done)
- [x] NestJS 11 project, TypeScript strict, `tsc --noEmit` clean
- [x] Env validation that fails at boot, not at first request
- [x] Entities for all 8 tables, `synchronize: false`
- [x] Sanctum-compatible auth guard
- [x] Laravel-shaped exception filter
- [x] `GET /health` at parity (200/503 split, same body keys)
- [x] `GET /api/v1/*` — five endpoints

### Phase 2 — verify before routing any traffic
- [ ] `npm run typecheck` and `npm run build` in CI
- [ ] Contract tests: hit Laravel and NestJS with the same token, assert the
      JSON is **byte-identical** (not just deep-equal — key order and number
      vs string types both matter)
- [ ] Test a token with `expires_at` in the past → 401 `Unauthenticated.`
- [ ] Test cross-tenant access → 403 `Not your repository`
- [ ] Test `?limit=51` clamps to 50 and `?repo=` filters correctly
- [ ] Load test at 100 req/min to confirm the throttler matches Laravel's
- [ ] Deploy NestJS **with no traffic routed to it** and watch `/health`

### Phase 3 — cut over slice 1
- [ ] Route `GET /health` to NestJS; watch Render's health check for one hour
- [ ] Route one GET endpoint; compare logs and error rates for 24h
- [ ] Route the remaining four
- [ ] Keep Laravel's `/api/v1` handlers deployed and reachable for instant
      rollback

### Phase 4 — the AI worker (largest slice) — code complete, not yet deployed
- [x] Port `ProcessCommitReview` / `ProcessPullRequestReview` to BullMQ
- [x] Port the Groq/OpenRouter client and prompt construction
- [x] Port GitHub API calls (diff fetch, comment posting)
- [x] Run both workers against **different queues** (Laravel: `jobs` table;
      NestJS: Redis) — they cannot contend
- [x] Move webhook ingestion and the two `/api/v1` re-analyze POSTs
- [x] Golden-fixture parity tests for the system prompts, generated by
      reflecting the real Laravel job classes
      (`test/generate-prompt-fixtures.php`)
- [ ] Confirm Redis `maxmemory-policy` is `noeviction` **before** any job is
      enqueued
- [ ] Deploy `prism-api` with no traffic routed to it; watch `/health`
- [ ] End-to-end run on a throwaway repository
- [ ] Flip the proxy for `POST /webhook/github`
- [ ] Retire Horizon once no Laravel jobs remain

### Phase 5 — frontend decoupling (prerequisite for everything else)
- [ ] Replace Inertia page props with JSON endpoints, one page at a time
- [ ] Move the frontend to a standalone SPA build
- [ ] Move web auth to tokens; retire the shared `sessions` table
- [ ] Port the remaining web controllers
- [ ] Port PDF export (`barryvdh/laravel-dompdf` has no drop-in Node twin —
      pick Puppeteer or a PDF lib and re-verify the output visually)

### Phase 6 — decommission
- [ ] Laravel serves zero routes for one full week
- [ ] Migrations moved to TypeORM (or kept in a dedicated migration-only tool)
- [ ] Remove the PHP container from `render.yaml`
