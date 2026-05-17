# PRism

AI-powered code review for GitHub pull requests. Connect a repository, open a PR, and PRism analyses the diff with an LLM across three layers — **security**, **performance**, and **code quality** — posts a summary comment back on the PR, and shows the full review (with suggested fixes, score, severity filters, PDF export, and a colored diff viewer) in a modern dark-themed dashboard.

## Stack

- Laravel 11 · PHP 8.4
- Inertia.js · React 18 · TailwindCSS · Inter / JetBrains Mono · Chart.js
- PostgreSQL (Neon) · Redis (Upstash) · `predis` over TLS
- OpenRouter (free models) · Resend (email) · Slack webhook · dompdf

## Features

- 🔍 **AI review** — Security / Performance / Code Quality issues with severity (`critical`/`warning`/`suggestion`) and an overall score 0-100.
- 🛠️ **Auto-fix suggestions** — second AI pass produces concrete code snippets per issue, copy-to-clipboard.
- 🌐 **Language-aware rules** — Laravel (N+1, validation, raw SQL), JS/TS (console.log, `any`, `==`), Python (bare except, mutable defaults).
- 📈 **Score timeline** — Chart.js graph of every reviewed PR over time.
- 🎯 **Severity filter** across all tabs simultaneously, with per-severity counts.
- 🔁 **Re-analyze** any PR on demand.
- 🧾 **View Diff** — colored unified diff (proxied through Laravel to bypass CORS).
- 📄 **PDF export** of a review (dompdf).
- 📨 **Email + Slack notifications** when a review completes.
- 🌙 **Dark mode toggle** persisted to localStorage; FOUC-free.

## Production-grade improvements

### 🗄️ Database optimisation
- Composite indexes on hot paths:
  `repositories(user_id, is_active)`,
  `pull_requests(repository_id, status)`,
  `pull_requests(repository_id, created_at)`,
  `reviews(pull_request_id, created_at)`,
  `review_comments(review_id, severity)`,
  `review_comments(review_id, layer)`.
- Eager loading + explicit `select()` on the dashboard and review queries — eliminates N+1.

### 🔐 Security
- `users.github_token` stored as **encrypted** TEXT (Laravel `encrypted` cast); one-off `php artisan db:tokens:encrypt` migrates legacy plaintext rows.
- `users.password` is nullable (OAuth-only signups).
- Global **SecurityHeaders** middleware: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security` (prod over HTTPS only), and a tight **Content-Security-Policy** (`default-src 'self'` + GitHub avatars + Google Fonts + OpenRouter/GitHub APIs + `frame-ancestors 'none'`).
- **VerifyGithubIp** middleware on the webhook — only requests inside GitHub's published `meta.hooks` CIDR ranges are accepted (24h cached; bypassed outside production for tunnels and local dev).
- HMAC-SHA-256 verification of webhook payloads (`hash_equals`, 401 on mismatch).
- CSRF excluded only for `/webhook/github`.

### 🚦 Rate limiting
| Limiter | Rate | Key | Applied to |
|---|---|---|---|
| `webhook` | 60 / min | IP | `POST /webhook/github` |
| `api` | 100 / min | user id (falls back to IP) | `/repositories`, `/repositories` |
| `auth` | 10 / min | IP | `/auth/github`, `/auth/github/callback` |

### ⚡ Caching (Upstash Redis, TLS, `prism:` prefix)
- `user_repos_{userId}` → 5 min (GitHub repo list)
- `user_connected_repos_{userId}` → 10 min (connected repo ids)
- `pr_diff_{prId}_{sha}` → 1 hour (unified diff)
- `github_meta_hooks` → 24 hours (webhook IP ranges)
- Invalidated automatically on repo connect / disconnect.

### 🔁 Job reliability
- `ProcessPullRequestReview` → `$tries = 3`, `$timeout = 120s`, `$backoff = [60, 180, 600]`.
- Exceptions propagate so Laravel can retry; `failed()` writes `status = failed` and structured log line after the final attempt.
- Notification failures (email/Slack) caught narrowly so they don't retry the whole review.

### 📜 Structured logging
- Dedicated `json` log channel (Monolog `JsonFormatter`) → `storage/logs/prism.json.log`.
- Every request gets a UUID `X-Request-Id` header and an `http_request` log line (`user_id`, `method`, `path`, `status`, `duration_ms`, `ip`).
- Domain events logged: `webhook_received` (delivery_id, event, action), `ai_call` (model, duration_ms, prompt/completion tokens), `PR review job started/completed`, plus warnings on Slack/mail/webhook-IP rejections.

### ❤️ Health check
- `GET /health` → JSON `{status, database, redis, queue, timestamp}`; 200 when healthy, 503 when degraded. No auth, no throttle. Suitable for k8s liveness/readiness probes.

## Local development

```bash
composer install
npm install --legacy-peer-deps
cp .env.example .env
php artisan key:generate
php artisan migrate --force
npm run build
php artisan serve
php artisan queue:work   # if QUEUE_CONNECTION=redis/database
```

Required env:

```
APP_URL=
DB_CONNECTION=pgsql DB_HOST= DB_PORT=5432 DB_DATABASE= DB_USERNAME= DB_PASSWORD= DB_SSLMODE=require
REDIS_URL=rediss://… REDIS_CLIENT=predis REDIS_PREFIX=prism:
CACHE_STORE=redis
GITHUB_CLIENT_ID= GITHUB_CLIENT_SECRET= GITHUB_REDIRECT_URI=
OPENROUTER_API_KEY=
RESEND_API_KEY=         # optional, email
SLACK_WEBHOOK_URL=      # optional, slack
```

For webhook delivery from GitHub during local dev, run a Cloudflare tunnel:

```bash
cloudflared tunnel --url http://localhost:8000
# then set APP_URL to the tunnel URL and re-connect repos
```

## License

MIT.
