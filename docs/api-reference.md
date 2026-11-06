# API reference

`prism-api` exposes three kinds of route. They have different stability guarantees, so
know which one you are calling.

| Surface | Callers | Stability |
|---|---|---|
| **`/api/v1/*`** | The MCP server and anything else holding an API token | **Public contract. Additive-only**: fields may be added, never removed or renamed |
| **`POST /webhook/github`** | GitHub | Fixed by GitHub. Status codes and bodies are visible in its delivery log |
| **Everything else** (`/dashboard`, `/reviews/*`, ...) | `prism-web`, server-side | Internal. May change together with `prism-web` in one deploy |

The source of truth for every route is the controller named beside it. Response shapes for
`/api/v1` are in
[`review-response.dto.ts`](../prism-api/src/modules/api-v1/reviews/dto/review-response.dto.ts).

## Conventions

**Base URL.** The API itself, for example `https://prism-api-wmam.onrender.com`. Use the
API origin, not `prism-web`, for programmatic access: a request to the API wakes it from
sleep, while one proxied through `prism-web` gets Render's 429 ([why](adr/0005-wake-the-api-from-the-browser.md)).

**Authentication.** Send `Authorization: Bearer {id}|{plaintext}` on `/api/v1`. Create a
token in the app under *Settings -> API tokens*; it is shown once. Browser routes use the
`prism_session` cookie instead. See [security.md](security.md#authentication).

**Serialisation.**

- `bigint` ids are JSON **numbers**.
- Timestamps are `YYYY-MM-DDTHH:MM:SS+00:00` (no milliseconds, explicit offset), not
  `...000Z`.
- Field names are snake_case. A few web-only top-level keys are camelCase (`pullRequest`,
  `commitReview`, `connectedIds`, `reviewModes`, `githubError`).
- There is no CORS, no global prefix and no versioning beyond the literal `/api/v1`.

**Validation.** A global `ValidationPipe` runs with `whitelist`, `forbidNonWhitelisted` and
`transform`, so **unknown body keys are rejected**.

**Ids.** A path id that is not numeric is a 400. One beyond the safe-integer range is a 404
`No query results.`

**Errors.** Every failure is `{ "message": "..." }`, except validation, which is
`422 { "message": "...", "errors": { "field": ["..."] } }`.

| Status | Body | Notes |
|---|---|---|
| 401 | exactly `{"message":"Unauthenticated."}` | Missing, malformed, unknown, expired or revoked credentials |
| 403 | `{"message":"Not your repository"}` | On `/api/v1`: a resource owned by another user |
| 404 | `No query results for model [App\Models\CommitReview] 42` (and `...\PullRequest]`) | On `/api/v1`. These legacy strings are part of the contract |
| 422 | `{message, errors}` | Validation |
| 429 | exactly `{"message":"Too Many Attempts."}` | Rate limit. The MCP server relays this body to the model |
| 500 | `{"message":"Server Error"}` | The stack is logged server-side and never returned |

**Rate limits.** 100 requests per minute per caller by default (`API_RATE_LIMIT`). The
caller is the verified session user for browser traffic and the **IP address** for API-token
callers and guests. `POST /webhook/github` allows 60 per minute and the OAuth routes 10 per
minute. Design generation has a separate limit of 10 per user per hour. The limits live in
process memory except the design limit.

**Request ids.** Send `X-Request-Id` (letters, digits and `. _ : -`, up to 128 characters) to
choose your own correlation id; otherwise one is generated. It is returned in the response
header and appears on every log line for the request.

---

## `/api/v1` (API token)

Controller: [`reviews.controller.ts`](../prism-api/src/modules/api-v1/reviews/reviews.controller.ts)
and the second controller in [`design.controller.ts`](../prism-api/src/modules/design/design.controller.ts).

| Method | Path | Response |
|---|---|---|
| GET | `/api/v1/me` | `{ name, github_username, repositories: [{id, name, full_name}] }` |
| GET | `/api/v1/reviews?limit=1..50&repo=owner/name` | `{ reviews: [summary] }`. Pull requests and commits merged, newest first. `limit` defaults to 10 |
| GET | `/api/v1/reviews/latest` | `{ type, review }`. 404 `No reviews yet` |
| GET | `/api/v1/commits/:id` | `{ review }` with findings and `suggested_fixes` |
| GET | `/api/v1/pull-requests/:id` | `{ review }`, plus `author`, `base_branch`, `head_branch` |
| GET | `/api/v1/commits/:id/risk` | `{ risk, basis }` |
| GET | `/api/v1/pull-requests/:id/risk` | `{ risk, basis }` |
| POST | `/api/v1/commits/:id/re-analyze` | 200 `{ message: "Re-analysis queued", id }`. Clears the old results |
| POST | `/api/v1/pull-requests/:id/re-analyze` | 200 same body. Keeps the old review visible until the new one lands |
| GET | `/api/v1/designs` | `{ designs: [{id, title, scale, source, created_at}] }` |
| POST | `/api/v1/designs` | 200 `{ design, markdown }` |
| GET | `/api/v1/designs/:id` | `{ design, markdown }`. 404 `Design not found.` |

`:id` is the row id from the PRism database (`list_recent_reviews` returns it), not the
GitHub PR number.

### Review summary (list items)

```json
{ "id": 42, "type": "pull_request", "repository": "owner/repo", "status": "completed",
  "overall_score": 88, "created_at": "2026-10-26T11:28:00+00:00",
  "pr_number": 17, "title": "Add retry to the export job" }
```

A commit summary has `type: "commit"`, `commit_sha` and `commit_message` and `branch` in
place of the PR fields. `overall_score` is `null` when no model produced a score.

### Review detail

A detail adds `summary`, `security_issues`, `performance_issues`, `code_quality_issues`,
`suggested_fixes` (the array of fixes), `detected_languages` and `ai_model_used`. Each issue
is `{ file, line, side, category, severity, comment }`. See [database.md](database.md#structured-json-columns)
for the field values.

### Risk

```json
{ "basis": "reviewed",
  "risk": { "level": "high", "score": 55,
            "stats": { "files": 9, "additions": 310, "deletions": 40, "sourceFiles": 7, "testFiles": 0 },
            "signals":   [ { "id": "auth", "label": "...", "weight": 20, "detail": "...", "files": ["..."] } ],
            "checklist": [ { "id": "...", "question": "...", "why": "...", "files": ["..."] } ] } }
```

`basis` is `reviewed` when the assessment is of the exact diff that was reviewed, and
`current` when none was saved and the live head was assessed instead. Errors: 502 when GitHub
will not return the diff, 503 `Could not assess this change.` if the assessment itself fails.
See [risk-radar.md](risk-radar.md).

### Create a design

```http
POST /api/v1/designs
Authorization: Bearer 12|abc...
Content-Type: application/json

{ "product": "A booking service for 200 bakeries with pre-orders and pickup slots",
  "scale": "startup",
  "priorities": ["high_availability", "low_cost"],
  "constraints": "Two engineers, AWS, no ops team" }
```

| Field | Rule |
|---|---|
| `product` | Required. 20 to 4,000 characters after trimming |
| `scale` | `prototype`, `startup` (default), `growth` or `enterprise` |
| `priorities` | Up to 4 distinct values from `high_availability`, `low_latency`, `strong_consistency`, `low_cost`, `fast_delivery`, `security_compliance`, `offline_first`. Order matters, most important first |
| `constraints` | Up to 1,500 characters |

The response is `{ design, markdown }`. It always succeeds with some design: when the model
is unavailable the `design.source` is `baseline` and `design.notice` says why. Failures:
`410` (the account is being deleted), `429` (10 per hour), `503` (the rate-limit counter is
unreadable). Generation typically takes 10 to 30 seconds and is cut off at 55.

---

## Webhook

`POST /webhook/github`, controller [`webhook.controller.ts`](../prism-api/src/modules/webhook/webhook.controller.ts).
Rate limit 60 per minute. Required headers: `X-GitHub-Event`, `X-Hub-Signature-256`;
`X-GitHub-Delivery` is logged.

| Condition | Status | Body `message` |
|---|---|---|
| No `repository.id` in the payload | 400 | `Missing repository id` |
| Repository not connected | 404 | `Repository not connected` |
| Bad or missing signature | 401 | `Invalid signature` |
| `ping` | 200 | `pong` |
| `pull_request` `opened` or `synchronize` | 200 | `Review queued` (+ `pr_id`) |
| `pull_request`, any other action | 200 | `Ignored action: <action>` |
| `push` queued | 200 | `Commit review queued` (+ `review_id`) |
| `push`, repository is PR-only | 200 | `Repository set to PR-only mode` |
| `push`, branch not watched | 200 | `Branch not watched: <branch>` |
| `push`, branch deleted | 200 | `Branch deleted, skipping` |
| `push`, no head commit | 200 | `No head commit` |
| Any other event | 200 | `Ignored event: <name>` |

The 404-before-401 order means the endpoint reveals whether a repository id is connected.
This is a [known issue](known-issues.md#t12).

---

## Browser routes (session cookie)

Internal to `prism-web`; listed so you can find the code. All require the session cookie and
return 401 `Unauthenticated.` without it, except where marked public.

### Auth

| Method | Path | Notes |
|---|---|---|
| GET | `/auth/github` | Public. Sets the `prism_oauth_state` cookie, redirects to GitHub. 10 per minute |
| GET | `/auth/github/callback` | Public. Verifies state, exchanges the code, upserts the user, sets the session cookie, redirects to `{FRONTEND_URL or APP_URL}/dashboard`, or to `/login?error=...`. 10 per minute |
| POST | `/auth/logout` | Public. 204. Revokes the token in Redis and clears the cookie |
| GET | `/auth/me` | `{ user: { id, name, email, github_username, github_avatar } }` |

### Pages' data

| Method | Path | Notes |
|---|---|---|
| GET | `/dashboard` | `{ total_repos, total_prs, total_commits, avg_score, recent_prs, recent_commits, timeline }` |
| GET | `/repositories` | `{ repos, connectedIds, connectedRepos, reviewModes, githubError }`. GitHub list cached 5 minutes |
| GET | `/repositories/branches?full_name=owner/repo` | `{ branches: [{name, is_default}] }`, cached 10 minutes |
| POST | `/repositories` | Connect. Body `{ github_repo_id, name, full_name, review_mode?, review_branches? }`. Installs the GitHub webhook; a 400 means GitHub refused it and the row was rolled back |
| GET | `/repositories/:id/settings` | `{ repository, reviewModes }` |
| POST | `/repositories/:id/settings` | `{ review_mode, review_branches? }`. Omitting branches resets to `main`, `master`. Re-syncs the webhook's event subscriptions |
| GET | `/repositories/:id/reviews?kind=prs\|commits&page=` | 25 per page, with totals for both kinds |
| GET | `/reviews/:id` | `{ pullRequest, review \| null }` with `verdict`, ordered `findings`, comments and `suggested_fixes` (an object here, an array on `/api/v1`) |
| POST | `/reviews/:id/re-analyze` | See [re-analyze](review-pipeline.md#re-analyze) |
| GET | `/reviews/:id/risk` | `{ risk, basis }` |
| GET | `/reviews/:id/diff` | `text/plain`, the raw GitHub diff, not cached |
| GET | `/reviews/:id/export` | `application/pdf`, `PRism-Review-PR{n}.pdf`. Writes a `data_exported` audit row |
| GET | `/commits/:id` | `{ commitReview }` with `verdict`, `findings`, `github_url` |
| GET | `/commits/:id/risk` | `{ risk, basis: "reviewed" }` |
| POST | `/commits/:id/re-analyze` | Clears results and the diff cache, enqueues |
| GET, POST | `/design` | List, create (same brief as `/api/v1/designs`) |
| GET, DELETE | `/design/:id` | One blueprint, delete |
| GET | `/design/:id/markdown` | `text/markdown`, `Content-Disposition: attachment; filename="<slug>.md"` |
| GET | `/help/how-to-use` | `{}` |

### Account

| Method | Path | Body | Notes |
|---|---|---|---|
| GET, PATCH, DELETE | `/profile` | PATCH `{ name, email }` (email lowercase, unique); DELETE `{ password }` | `DELETE /profile` is a legacy path; see [known issues](known-issues.md#t5) |
| GET | `/settings` | | `{ user, api_tokens }` |
| POST | `/settings` | `{ slack_webhook_url \| null }` | Must start with `https://hooks.slack.com/` |
| POST | `/settings/api-tokens` | `{ name }` (at most 64 characters) | `{ token, new_api_token: "{id}\|{plaintext}" }`. The plaintext is returned once |
| DELETE | `/settings/api-tokens/:tokenId` | | Revokes |
| POST | `/settings/test-slack` | `{ slack_webhook_url }` | `{ ok, message }`. A Slack rejection is a 200 with `ok: false` |
| GET | `/security/audit-log` | | `{ logs }`, newest first, at most 200 |
| GET | `/security/my-data` | | `{ profile, token_preview, stats, designs, repositories }`. The token preview shows only its first 4 and last 4 characters and its length |
| DELETE | `/security/my-data` | `{ confirm: "DELETE" }` | Full account deletion. 503 if it could not finish |

### Public

| Method | Path | Response |
|---|---|---|
| GET | `/security` | `{ user \| null, is_authenticated, github_app_url, github_repo_url }`. Uses the optional guard: never rejects |
| GET | `/demo`, `/demo/review/:id` | Hard-coded sample data. Unknown id -> 404 |
| GET | `/health` | `{ status, database, redis, queue, timestamp }`. 200 only when the database and Redis are both `connected`, otherwise 503. Each probe has a 3 s timeout. A queue problem alone does not change the status code |

---

## Examples

```bash
export PRISM_URL=https://prism-api-wmam.onrender.com
export PRISM_API_TOKEN='<id>|<token>'      # from Settings -> API tokens

# Who am I, and which repositories are connected?
curl -s -H "Authorization: Bearer $PRISM_API_TOKEN" "$PRISM_URL/api/v1/me"

# The five newest reviews of one repository
curl -s -H "Authorization: Bearer $PRISM_API_TOKEN" \
  "$PRISM_URL/api/v1/reviews?limit=5&repo=owner/repo"

# Re-run a pull-request review, then read it
curl -s -X POST -H "Authorization: Bearer $PRISM_API_TOKEN" "$PRISM_URL/api/v1/pull-requests/42/re-analyze"
curl -s -H "Authorization: Bearer $PRISM_API_TOKEN" "$PRISM_URL/api/v1/pull-requests/42"
```

A missing or wrong token returns `401 {"message":"Unauthenticated."}`.
