# Configuration

Every environment variable PRism reads, with its default and what it changes. Values live
in each service's environment (Render's dashboard in production, a local `.env` in
development); the examples in `prism-api/.env.example` and `prism-web/.env.example` are
templates with no secrets.

> **Never run a local command with the repository root's `.env` loaded.** That file holds
> production credentials. It is gitignored and nothing in the local workflow reads it. Nest's
> `ConfigModule` loads `.env` from the *working directory*, so start the API from
> `prism-api/`, and check that every connection string you use says `127.0.0.1`.

## prism-api

The environment is validated at boot by
[`config/env.validation.ts`](../prism-api/src/config/env.validation.ts). A missing required
value or a malformed one stops the process with a message listing every problem, rather than
failing on the first request. Unknown variables are ignored, so a stale key left set on
Render cannot stop the service starting.

| Variable | Required | Default | Effect |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `production` switches logs to one JSON object per line and marks cookies `secure`. `development` logs SQL |
| `PORT` | no | `3000` | Listen port, bound to `0.0.0.0`. Render injects it as a string; it is converted explicitly. **Use 3999 locally** so `prism-web` finds it |
| `APP_URL` | **yes** | | The public origin of the app. Used for the webhook URL (`{APP_URL}/webhook/github`), for links in GitHub comments and Slack messages, and as the OAuth redirect fallback |
| `FRONTEND_URL` | no | empty | Where the browser lands after OAuth (`{FRONTEND_URL or APP_URL}/dashboard`). Set it when the frontend is on a different origin from `APP_URL` |
| `APP_KEY` | **yes** | | Encrypts and decrypts `users.github_token`. 32 bytes, base64, with or without a `base64:` prefix. **Never rotate casually** |
| `JWT_SECRET` | **yes** | | Signs the browser session JWT (HS256). At least 32 characters. Must not equal `APP_KEY` |
| `SESSION_COOKIE_NAME` | no | `prism_session` | Session cookie name. Must match `prism-web` |
| `SESSION_TTL_DAYS` | no | `30` | JWT lifetime and cookie max-age |
| `DB_URL` | **yes** | | Postgres connection string. The pool holds at most 5 connections |
| `DB_SSLMODE` | no | `prefer` | `disable` turns TLS off. Any other value enables TLS **without certificate verification** ([known issue](known-issues.md#t11)) |
| `REDIS_URL` | **yes** | | Redis for the cache, stores and BullMQ. Must run `maxmemory-policy noeviction` |
| `REDIS_PREFIX` | no | `prism:` | Prefix on the general client's keys |
| `QUEUE_PREFIX` | no | `prism-bull` | BullMQ's own key namespace |
| `QUEUE_CONNECTION` | no | `database` | Read into config but **not used by anything**. Safe to leave unset |
| `GROQ_API_KEY` | **yes** | | Bearer token for Groq. Without it the service refuses to boot rather than failing every review |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | **yes** | | The GitHub OAuth app |
| `GITHUB_REDIRECT_URI` | **yes** | | Must be `https://<public host>/auth/github/callback`, and registered on the OAuth app. See the note below |
| `API_RATE_LIMIT` | no | `100` | Requests per minute for the global limiter |

`OPENROUTER_API_KEY` and the mail variables (`RESEND_API_KEY`, `MAIL_FROM_ADDRESS`,
`MAIL_FROM_NAME`) are no longer read. Remove them from any environment you control.

**Two secrets, two blast radii.** Rotating `JWT_SECRET` signs everyone out and nothing else.
Rotating `APP_KEY` makes every stored GitHub token permanently unreadable, and reviews for
those users fail until they sign in again. Keep them different, and treat `APP_KEY` as
write-once.

**`GITHUB_REDIRECT_URI` and the shared hostname.** The browser reaches the callback through
`prism-web`'s rewrite, so the redirect URI must use the *web* hostname (locally
`http://localhost:3001/auth/github/callback`), not the API's. The session cookie is set on
whichever host answers the callback, and that must be the host the user browses.

## prism-web

| Variable | Default | Effect |
|---|---|---|
| `PRISM_API_ORIGIN` | `http://127.0.0.1:3999` | Where server-side calls and the `/auth`, `/api/v1` and `/webhook` rewrites go. **No `NEXT_PUBLIC_` prefix, on purpose**: the browser must never learn it, except on `/waking` |
| `APP_URL` | `http://localhost:3001` | Public origin; used for `metadataBase` (absolute link-preview URLs) |
| `SESSION_COOKIE_NAME` | `prism_session` | Must match `prism-api`, or the session is never found |
| `PORT` | `3000` for `next start`, `3001` for `npm run dev` | `next start` honours `$PORT`, which hosts such as Render set |

`PRISM_API_ORIGIN` is read at *build* time by `next.config.mjs` (for the rewrites) as well as
at run time. Changing it requires a rebuild.

## mcp-server

| Variable | Required | Default | Effect |
|---|---|---|---|
| `PRISM_API_TOKEN` | **yes** | | A token created under *Settings -> API tokens*. The process exits with a hint if it is missing |
| `PRISM_URL` | **yes** | | The API's base URL, `http` or `https`. Point it at the **API**, not the web app, so a request wakes a sleeping service. There is no default: the process exits with a message if it is missing or not an `http(s)` URL (the former hosted instance is offline, [known issue](known-issues.md#hosted-offline)) |

## Generating values

```bash
# APP_KEY (32 random bytes, base64) -- keep it forever
node -e "console.log('base64:' + require('crypto').randomBytes(32).toString('base64'))"

# JWT_SECRET (any 32+ characters; this gives 64 hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The `JWT_SECRET` in `render.yaml` uses `generateValue: true`, so Render creates it once.

## Fixed values worth knowing

These are not configurable, but they behave like settings. They live in code so that the
budget derived from them stays consistent.

| Value | Where | Why it matters |
|---|---|---|
| `DIFF_LIMIT = 8000` | each runner | Characters of diff shown to the model |
| `GROQ_MODELS`, `GROQ_TIMEOUT_MS = 60000` | `ai/ai-client.service.ts` | Measured behaviour; the job budget is derived from them |
| `MAX_DIFF_BYTES = 2000000` | `github/github-client.service.ts` | Memory ceiling on a diff |
| `REVIEW_JOB_ATTEMPTS = 3`, backoff `[60, 180, 600]` | `modules/review/review.queue.ts` | Retry policy |
| `DESIGN_BUDGET_MS = 55000`, 10 designs per user per hour | `modules/design/` | Design Studio's cost bound |
| `ERASURE_MARKER_TTL_SECONDS = 3600` | `modules/account/erasure-marker.ts` | At least twice the longest job |

A full table of limits is in [architecture.md](architecture.md#limits-that-define-the-design).
