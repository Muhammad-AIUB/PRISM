# Deployment

How PRism is deployed (`prism-api` on a VPS, `prism-web` on Vercel, Neon for Postgres, Upstash for
Redis) and how to stand up your own copy. For running
and debugging a live system use the [operations runbook](operations.md).

> **History:** the original Render instance is gone. Production is now `prism-api` on a VPS and
> `prism-web` on Vercel (`prism-seven-psi.vercel.app`).

## Topology

```text
                         one public hostname (prism-web)
GitHub ──webhook──▶  prism-web  ──rewrites /auth /api/v1 /webhook──▶  prism-api ──▶ Neon (Postgres 16)
Browser ─pages───▶  (Next.js)                                         (NestJS +      Upstash (Redis)
MCP server ──────────────────────bearer token, direct─────────────▶   BullMQ)       Groq, GitHub API
```

| Service | Where | Source |
|---|---|---|
| `prism-api` | A Node web service, root `prism-api`, branch `main` | set up in the host's dashboard |
| `prism-web` | A Node web service, root `prism-web`, branch `main` | set up in the host's dashboard |
| PostgreSQL 16 | Neon | provisioned by hand |
| Redis | Upstash | provisioned by hand; **must be `noeviction`** |

The review worker runs inside `prism-api` ([why](adr/0002-review-worker-in-the-api-process.md)).
Each service gets 512 MB of memory and sleeps after 15 idle minutes.

## Stand up your own

### 1. Postgres

Create a Postgres 16 database (Neon's free tier works). Apply the schema once:

```bash
psql "$DB_URL" -v ON_ERROR_STOP=1 -f prism-api/schema.sql
```

TypeORM never creates or alters tables, so this is the only provisioning step. Use the pooled
connection string if the provider offers one: the API holds at most 5 connections.

### 2. Redis

Create a Redis instance and make sure its eviction policy is **`noeviction`**. BullMQ requires
it, because under an eviction policy job keys are dropped silently and reviews never run, with
no error. BullMQ prints `IMPORTANT! Eviction policy is <policy>. It should be "noeviction"`
to the API's start-up log when it is wrong, so check the first lines of the log after every
change of Redis provider or plan.

### 3. A GitHub OAuth app

*Settings -> Developer settings -> OAuth Apps -> New.* Use your **web** hostname:

- Homepage URL: `https://<your-web-host>`
- Authorization callback URL: `https://<your-web-host>/auth/github/callback`

Keep the client id and secret for step 4. The app requests the `repo` and `read:user` scopes.

### 4. Host the services

Create both services from the repository with these settings, then set the variables below.
There is no deploy config file in the repo.

| Service | Build command | Start command | Health check |
|---|---|---|---|
| `prism-api` | `npm ci --include=dev && npm run build` | `npm run start:prod` | `/health` |
| `prism-web` | `npm ci --include=dev && npm run build` | `npm run start` | `/login` |

Set `NODE_ENV=production` on both.

**`prism-api`:**

| Variable | Value |
|---|---|
| `APP_URL` | `https://<your-web-host>`. Used for the webhook URL and for links in comments |
| `APP_KEY` | Generate once ([configuration.md](configuration.md#generating-values)) and **never rotate** |
| `DB_URL` | The Postgres connection string |
| `REDIS_URL` | The Redis connection string |
| `GROQ_API_KEY` | From Groq |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | From step 3 |
| `GITHUB_REDIRECT_URI` | `https://<your-web-host>/auth/github/callback` |
| `FRONTEND_URL` | Leave empty while `APP_URL` is the web host |

Generate `JWT_SECRET` yourself. Also set `DB_SSLMODE=prefer`, `REDIS_PREFIX=prism:`,
`QUEUE_PREFIX=prism-bull`, `API_RATE_LIMIT=100`, `SESSION_COOKIE_NAME=prism_session` and
`SESSION_TTL_DAYS=30` (the defaults the old config file used).

**`prism-web`:**

| Variable | Value |
|---|---|
| `PRISM_API_ORIGIN` | The API's own public URL, e.g. `https://api.example.com` |
| `APP_URL` | `https://<your-web-host>` |

`SESSION_COOKIE_NAME` must equal the API's.

**Why both build commands say `npm ci --include=dev`.** With `NODE_ENV=production`, npm skips devDependencies,
and the build tools live there: `@nestjs/cli` for
`nest build`, and Tailwind, PostCSS and TypeScript for `next build`. Without the flag the
build fails.

Use the API's public URL everywhere a host is needed, including the MCP server's `PRISM_URL`.

### 5. Verify

```bash
curl -s https://<api-host>/health     # {"status":"ok","database":"connected","redis":"connected","queue":"running",...}
curl -sI https://<web-host>/login     # 200
```

Then in a browser: sign in, connect a repository, open a pull request on it, and wait for the
comment. If nothing appears, follow [operations.md](operations.md#a-review-never-appears).

## One hostname, two services

The API sets the session cookie and a browser only returns a cookie to the origin that set it,
so the browser must see one origin. Today that is `prism-web`'s rewrites in
`next.config.mjs`. A reverse proxy in front of both would do the same job: send `/auth/*`,
`/api/v1/*` and `/webhook/github` to `prism-api` and everything else to `prism-web`
([ADR 0004](adr/0004-server-side-api-access-on-one-hostname.md)).

## Resource limits

| Limit | Consequence | Note |
|---|---|---|
| 512 MB assumed per service | Worker concurrency is 1 and diffs are capped at 2 MB | The limits come from the original free-tier host; raise them only after measuring on the VPS |
| Node version is not pinned | The host resolves `engines.node` (`>=20.11` for the API, `>=22.12` for the web), so the major version can change | Pin it ([known issues](known-issues.md#f3)) |

**Webhooks.** If the API is down when GitHub delivers a webhook, GitHub does not retry. Use an
external uptime monitor on `https://<api-host>/health`, and redeliver failed deliveries from the
repository's *Settings -> Webhooks -> Recent deliveries*. Automatic redelivery on boot is a
proposed fix, not built.

## Auto-deploy on push

`prism-web` deploys itself from `main` on Vercel. `prism-api` on the VPS deploys through the
GitHub Actions workflow [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml): a push to
`main` that touches `prism-api/`, `deploy/` or the workflow connects to the server over SSH and runs
`deploy/deploy.sh`. The script fast-forwards the checkout, builds, restarts the API, waits for
`/health` and **rolls back to the previous commit if the new build is not healthy** (the job then
fails, so GitHub tells you). Deploys run one at a time. Run it by hand from the *Actions* tab
(*Deploy API -> Run workflow*).

The workflow runs **no tests**: `nest build` type-checks, but a green build is the only gate. Run the
checks locally before pushing ([CLAUDE.md](../CLAUDE.md)).

**One-time setup**

On the VPS:

1. A user that owns a clone of the repository, e.g. `deploy` and `/srv/prism`, cloned so that
   `git fetch` works without a prompt (a read-only deploy key, or an HTTPS URL). Node 20.11 or
   newer, `git` and `curl` installed.
2. Let that user restart the API without a password. In `visudo`:
   `deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart prism-api`. If the API runs under
   another manager, set the `VPS_RESTART_CMD` secret instead (for example `pm2 restart prism-api`).
3. A dedicated SSH key pair for deployments only: `ssh-keygen -t ed25519 -f deploy_key -N ""`.
   Append `deploy_key.pub` to that user's `~/.ssh/authorized_keys`.

On GitHub (*Settings -> Secrets and variables -> Actions -> New repository secret*):

| Secret | Value |
|---|---|
| `VPS_HOST` | The server's hostname or IP |
| `VPS_USER` | The deploy user, e.g. `deploy` |
| `VPS_SSH_KEY` | The **private** key (contents of `deploy_key`) |
| `VPS_KNOWN_HOSTS` | The server's host key line: run `ssh-keyscan -t ed25519 <host>` **from your own machine** and paste the output |
| `VPS_APP_DIR` | The checkout path, e.g. `/srv/prism` |
| `VPS_PORT` | Optional; only if SSH is not on 22 |
| `VPS_RESTART_CMD` | Optional; default is `sudo systemctl restart prism-api` |

Delete `deploy_key` from your machine once the secret is saved. Host key checking is strict, so a
changed server key (or someone in the middle) stops the deploy instead of being trusted.

**When it fails.** A diverged server checkout (local edits) fails the fast-forward and deploys
nothing, so keep the clone clean. A failed release rolls back and the job turns red; the log shows
`rolling back to <sha>`. If the log says `ROLLBACK FAILED`, the API is down: fix it by hand.

## Releasing

There is no release step beyond merging to `main`.

1. Run typecheck, lint and tests in each package you changed. **There is no CI**, so nothing
   checks this for you, and the host will deploy whatever reaches `main`.
2. Merge or push to `main`. Vercel deploys `prism-web` from `main`; a push that touches `prism-api/` also deploys the API to the VPS ([auto-deploy](#auto-deploy-on-push)).
3. Verify the deploy: `/health` is `ok`, and exercise the change. After a change to sign-in,
   request `https://<web-host>/auth/github` and expect a redirect to GitHub, not a 404.

**Deploys come from `main` only.** A fix that exists on a local branch or an unpushed commit is
not live, however green your tests are. Before diagnosing a production symptom you believe is
fixed, run `git log origin/main..HEAD` and `curl` the deployed route.

**Rollback** is Vercel's *Instant Rollback* for the web app, and redeploying the previous build on the VPS for the API. There are no migrations to undo.
Anything that touched the schema is a separate, manual operation.

## Schema changes

TypeORM does not touch the schema. A change is hand-applied DDL, the production process for
which is not yet decided ([database.md](database.md#changing-the-schema)). Until it is: take a
Neon branch or snapshot, apply and verify on the branch first, keep the reverse script next to
the forward one, and make additive changes only.

<a id="ci"></a>
## CI

There is none. The two GitHub Actions workflows (a CI workflow and a scheduled keep-alive ping) were
removed on 2026-11-06 at the maintainer's request, so no checks run on a push or pull request. The
only workflow is the [API deploy](#auto-deploy-on-push), which runs no tests. The gates are manual: typecheck, lint and test in each package you touch, and
`npm audit --omit=dev --audit-level=high` when dependencies change.

If you want CI back, the files are in history (`git log --diff-filter=D -- .github/workflows/ci.yml`
finds the commit that removed it). It ran, per package on Node 22: `npm ci`, typecheck, lint, tests,
build and the audit; for `mcp-server`: `npm install`, `node --check index.js` and the audit. None of
it needed Postgres, Redis or a secret, and none of it should.
