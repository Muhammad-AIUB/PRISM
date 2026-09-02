# Verifying prism-api locally

The Jest suite covers the pure logic. It cannot catch a broken DI graph, a
misconfigured entity, or an env var that fails validation — and one of those
has already slipped through once (`PORT` arriving as a string, which would have
killed the service on every Render boot while every test stayed green).

So: boot it against a real Postgres and Redis before believing it works.

---

## ⚠️ The repository .env points at production

`.env` in the repository root still holds the **production** database and Redis
credentials — it is what the deployed services are configured from. Nothing in
this guide reads it, and nothing here should: every command below passes its
own connection string explicitly. Check what you are about to run actually
says `127.0.0.1:55432` before running it.

---

## 1. Start the stack

`--maxmemory-policy noeviction` is not optional. BullMQ requires it; under an
eviction policy queued review jobs can be dropped silently and reviews simply
never run.

```bash
docker run -d --name prism-pg \
  -e POSTGRES_PASSWORD=prism -e POSTGRES_USER=prism -e POSTGRES_DB=prism \
  -p 55432:5432 postgres:16-alpine

docker run -d --name prism-redis \
  -p 56379:6379 redis:7-alpine redis-server --maxmemory-policy noeviction
```

## 2. Create the schema

TypeORM runs with `synchronize: false` and always will, so the schema has to be
applied by hand. `schema.sql` was captured with `pg_dump` from a database built
by the original Laravel migrations, before those were deleted, and is now the
source of truth:

```bash
docker exec -i prism-pg psql -U prism -d prism -v ON_ERROR_STOP=1 < prism-api/schema.sql
```

## 3. Boot the API

```bash
NODE_ENV=development PORT=3999 APP_URL=http://localhost:3999 APP_KEY='base64:AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=' DB_URL='postgres://prism:prism@127.0.0.1:55432/prism' DB_SSLMODE=disable REDIS_URL='redis://127.0.0.1:56379' GROQ_API_KEY=dummy GITHUB_CLIENT_ID=dummy GITHUB_CLIENT_SECRET=dummy GITHUB_REDIRECT_URI=http://localhost:3999/auth/github/callback JWT_SECRET='0123456789012345678901234567890123456789' node dist/main.js
```

That APP_KEY is a fixed throwaway for local use — never a real one.

Check the startup log for `dependencies initialized` on every module and the
full `Mapped {...} route` list. A DI mistake shows up here and nowhere else.

## 4. What to assert

Seed a user and repository, then send signed webhooks. What has been confirmed
this way so far:

| Check | Result |
|---|---|
| All 18 routes mapped, every module initialised | pass |
| `GET /health` | 200 |
| Webhook: ping / bad signature / unknown repo / missing id | 200, 401, 404, 400 with Laravel's exact bodies |
| Webhook: unwatched branch, closed PR, unhandled event | ignored with Laravel's exact messages |
| Webhook: push and `pull_request` opened | rows created, jobs enqueued |
| Worker picks the job up, sets `analyzing` | pass |
| `users.github_token` decrypts in the live path | pass — GitHub answered 401 to the fake token, which is only reachable *after* a successful decrypt |
| Retry backoff | first retry scheduled exactly 60s out, matching Laravel's `[60, 180, 600]` |
| Every authenticated route without a session | 401 `{"message":"Unauthenticated."}` |
| `bigint` ids in JSON | numbers, not strings |
| A token issued by `POST /settings/api-tokens` authenticates `GET /api/v1/me` | pass |
| Laravel's own `Sanctum::findToken()` resolves that same token | pass — name, user and abilities all match |
| Revoking it makes the next call 401 | pass |
| Partial `POST /settings` leaves untouched fields alone | pass |
| A non-Slack webhook URL is refused | pass |
| Validation failures | 422 `{message, errors}`, Laravel's envelope |
| Dashboard totals, both feeds and the timeline | pass |
| Review, commit and diff pages | pass; diff passes GitHub's status through |
| Re-analyze (web) drops the review row and re-queues | pass |
| PDF export | valid `%PDF-1.3 … %%EOF`, correct filename, both with and without a review |
| Another user's session on someone's PR, commit, export or repo settings | 403 |
| `/security` anonymous, and with a forged cookie | 200 with `is_authenticated: false`, no 500 |
| `/security/my-data` token preview | first 4 / last 4 / length of the decrypted token |
| Full data deletion with `confirm: DELETE` | user, repositories and pull requests cascade away; another user's rows untouched; session immediately 401; GitHub webhook uninstall attempted first |
| Data deletion without the exact confirmation | 422, nothing deleted |
| `/demo`, `/demo/review/:id` | public, 404 for an unknown id |

## 5. Crypt fixtures

`LaravelCryptService` reads and writes `users.github_token` in the format the
original PHP used, because every token already in the production database was
written that way. `test/fixtures/laravel-encrypted.json` holds payloads
produced by that implementation, and `npm test` decrypts them.

Those fixtures are frozen — the generator needed the PHP that is now gone. Both
directions were verified against the real implementation before it was deleted
(7/7 samples, including empty, multibyte and embedded quotes).

## 6. Tear down

```bash
docker rm -f prism-pg prism-redis
```
