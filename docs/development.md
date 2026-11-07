# Development guide

This guide takes you from a fresh clone to a running stack, shows you how to prove the review
pipeline is wired up without needing a tunnel, and lists the pitfalls that cost people an
afternoon. For how the system fits together read [architecture.md](architecture.md); for the
checks every change must pass read [testing.md](testing.md) and [CONTRIBUTING.md](../CONTRIBUTING.md).

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | **22.12 or newer** | `prism-web`'s test toolchain (Vitest 5, jsdom 30) requires it. `prism-api` runs on 20.11+, but use one version for both |
| npm | 10+ | Each package has its own lockfile; there is no workspace tooling |
| Docker | any recent | Postgres 16 and Redis 7 |
| A GitHub OAuth app | | Needed to sign in through the real flow ([step 4](#4-start-the-web-app-and-sign-in)) |
| A Groq API key | | Needed to produce a real review. Booting needs only a placeholder |

## 1. Install

```bash
cd prism-api && npm ci && cd ..
cd prism-web && npm ci && cd ..
```

`.npmrc` sets `ignore-scripts=true`, so installs do not run dependency lifecycle scripts.

## 2. Start Postgres and Redis

Redis **must** run with `--maxmemory-policy noeviction`. BullMQ requires it. Under an
eviction policy, job keys are dropped silently and reviews never run, with no error anywhere.

```bash
docker run -d --name prism-pg \
  -e POSTGRES_USER=prism -e POSTGRES_PASSWORD=prism -e POSTGRES_DB=prism \
  -p 55432:5432 postgres:16-alpine

docker run -d --name prism-redis \
  -p 56379:6379 redis:7-alpine redis-server --maxmemory-policy noeviction
```

The ports (55432, 56379) are deliberately unusual so they cannot collide with a database you
already run, and so a connection string that accidentally points at the wrong place fails
instead of connecting.

Apply the schema. TypeORM runs with `synchronize: false` and always will, so this is the only
way tables get created:

```bash
docker exec -i prism-pg psql -U prism -d prism -v ON_ERROR_STOP=1 < prism-api/schema.sql
```

Check it:

```bash
docker exec prism-pg psql -U prism -d prism -c '\dt'
# 8 tables: audit_logs, commit_reviews, personal_access_tokens, pull_requests,
#           repositories, review_comments, reviews, users
```

## 3. Configure and start the API

```bash
cd prism-api
cp .env.example .env
```

Edit `.env` and fill in the blanks. The ports and database name already match the Docker commands
above; replace `<password>` in `DB_URL` with the `POSTGRES_PASSWORD` you gave `docker run` (the
commands above use `prism`).

```bash
# APP_KEY: generate once
node -e "console.log('base64:' + require('crypto').randomBytes(32).toString('base64'))"
# JWT_SECRET: any 32+ characters
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`GROQ_API_KEY` can be any non-empty string to boot; `GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET` likewise unless you will sign in with GitHub. Every variable is
explained in [configuration.md](configuration.md).

> **Run the API from `prism-api/`.** Nest loads `.env` from the working directory. The
> repository root has its own `.env` with production credentials; never start anything there.
> Before running a command, check that `DB_URL` and `REDIS_URL` say `127.0.0.1`.

```bash
npm run start:dev      # watch mode on :3999
```

Look at the start-up log. You should see every module initialise and a `Mapped {...} route`
line for each of the routes, ending with `PRism API listening on :3999 (development)`. A
dependency-injection mistake shows up here and nowhere else, which is why unit tests alone are
not enough.

Confirm it is healthy:

```bash
curl -s http://127.0.0.1:3999/health
# {"status":"ok","database":"connected","redis":"connected","queue":"running","timestamp":"..."}
```

## 4. Start the web app and sign in

```bash
cd prism-web
npm run dev            # http://localhost:3001
```

`prism-web` needs no environment to run locally: `PRISM_API_ORIGIN` defaults to
`http://127.0.0.1:3999`. The browser talks only to `:3001`; `next.config.mjs` rewrites
`/auth/*`, `/api/v1/*` and `/webhook/*` to the API so the session cookie stays on one origin.

### Option A: the real GitHub flow

1. On GitHub: *Settings -> Developer settings -> OAuth Apps -> New OAuth App*.
   Homepage URL `http://localhost:3001`; **Authorization callback URL
   `http://localhost:3001/auth/github/callback`** (the web host, not 3999).
2. Put the client id and secret in `prism-api/.env`. `GITHUB_REDIRECT_URI` is already
   `http://localhost:3001/auth/github/callback`. Restart the API.
3. Open `http://localhost:3001/login` and choose *Continue with GitHub*.

### Option B: no GitHub, mint a session for a seeded user

Useful for working on pages and the API without an OAuth app. Seed a user, then sign a session
token with your `JWT_SECRET`:

```bash
docker exec -i prism-pg psql -U prism -d prism -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO users (name, email, github_id, github_username, created_at, updated_at)
VALUES ('Dev User', 'dev@example.com', '1', 'dev', now(), now());
SQL

JWT_SECRET='<the value from prism-api/.env>' node -e "
const c = require('crypto');
const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const head = b({ alg: 'HS256', typ: 'JWT' });
const body = b({ sub: 1, username: 'dev', iat: now, exp: now + 86400 });
const sig = c.createHmac('sha256', process.env.JWT_SECRET).update(head + '.' + body).digest('base64url');
console.log(head + '.' + body + '.' + sig);"
```

Use the printed token as a cookie named `prism_session` in your browser's dev tools for
`localhost`, or send it as `Authorization: Bearer <token>`:

```bash
curl -s -H "Authorization: Bearer <token>" http://127.0.0.1:3999/auth/me
```

Seeded this way the user has no `github_token`, so anything that calls GitHub on their behalf
(listing repositories, fetching diffs) will fail. That is expected.

## 5. Prove the review pipeline is wired

You do not need a tunnel or a real repository to check that webhook intake, the queue and the
worker are connected. Seed a repository, then send a correctly signed `push` event.

```bash
docker exec -i prism-pg psql -U prism -d prism -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO repositories (user_id, name, full_name, github_repo_id, webhook_secret, review_mode, created_at, updated_at)
VALUES (1, 'demo', 'dev/demo', 424242, 'local-test-secret', 'both', now(), now());
SQL

BODY='{"ref":"refs/heads/main","after":"1111111111111111111111111111111111111111","repository":{"id":424242},"head_commit":{"id":"1111111111111111111111111111111111111111","message":"test push","author":{"username":"dev"}}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac 'local-test-secret' | sed 's/^.* //')

curl -i -X POST http://127.0.0.1:3999/webhook/github \
  -H 'Content-Type: application/json' \
  -H 'X-GitHub-Event: push' \
  -H "X-Hub-Signature-256: sha256=$SIG" \
  --data "$BODY"
# HTTP/1.1 200   {"message":"Commit review queued","review_id":1}
```

What to expect next, in the API log and in the database:

1. A `webhook_received` line, then `Commit review job started`.
2. `commit_reviews.status` becomes `analyzing`.
3. The job fails fetching the diff from GitHub (the seeded user has no token, so GitHub answers
   401). BullMQ schedules a retry for 60 seconds later, then 180 seconds. After the third
   failure the status becomes `failed`.

That sequence proves intake, the HMAC check, the queue, the worker and the retry policy. A
review that completes needs a real GitHub token and Groq key, so use Option A and connect a
real repository from the *Repositories* page. To let GitHub deliver real webhooks to your
machine, expose port 3001 with a tunnel and set `APP_URL` to the tunnel URL **before** you
connect the repository, because the webhook URL is fixed when the hook is created.

Variations worth trying: a bad signature returns `401 Invalid signature`; an unknown
`repository.id` returns `404 Repository not connected`; `X-GitHub-Event: ping` returns
`pong`. The full table is in [api-reference.md](api-reference.md#webhook).

## Daily workflow

| Task | Command (in the package directory) |
|---|---|
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` |
| Test | `npm test` (API: `npm test -- <file fragment>` or `npm test -- -t "<test name>"`) |
| Build | `npm run build` |
| API in watch mode | `npm run start:dev` (`prism-api`) |
| Web in watch mode | `npm run dev` (`prism-web`) |

Run typecheck, lint and tests before every commit. There is no CI, so nothing else will. Typecheck
is the cheap loop (5 to 17 s); lint and tests take about a minute each, so run them once at the end
([timings and the test-per-area table](code-map.md#tests-run-the-one-that-matches)).

For UI changes, also open the page in a browser, in both themes, with the console open, and
at 390 px wide: no console errors and no horizontal scroll
([frontend.md](frontend.md#verifying-a-ui-change)).

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| The API exits at boot printing `Invalid environment configuration:` and a list | A required variable is missing or malformed. The list names each one |
| `APP_KEY must decode to 32 bytes` | `APP_KEY` is not 32 bytes of base64. Regenerate it with the command above |
| `/health` returns 503 with `redis: down` | Redis is not running, or `REDIS_URL` is wrong. `docker ps` |
| Jobs are enqueued but never run | Redis is evicting keys. Confirm `docker exec prism-redis redis-cli config get maxmemory-policy` prints `noeviction` |
| Sign-in "works" but every page is anonymous | The two services are not on one hostname. Browse `localhost:3001`, not `:3999`, and register the OAuth callback on `:3001` |
| `redirect_uri_mismatch` from GitHub | The OAuth app's callback URL does not exactly equal `GITHUB_REDIRECT_URI` |
| `npm test` in `prism-web` dies with `webidl.util.markAsUncloneable is not a function` | Node is older than 22.12 |
| `npm run test:e2e` fails in `prism-api` | Known: `test/jest-e2e.json` was never created. It is not a regression |
| Pages fail with "The server took too long to respond" | `prism-web` cannot reach the API at `PRISM_API_ORIGIN` within 15 s. Check the API is up |
| `ECONNREFUSED 127.0.0.1:55432` | The Postgres container is not running |

## Tear down

```bash
docker rm -f prism-pg prism-redis
```

Stop the two dev servers with Ctrl+C. Nothing else is installed system-wide.
