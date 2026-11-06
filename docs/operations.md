# Operations runbook

For whoever is looking at a running PRism and something is wrong. Each section starts from a
symptom. Background lives in [architecture.md](architecture.md) and
[review-pipeline.md](review-pipeline.md); deploying is in [deployment.md](deployment.md).

## Health at a glance

```bash
curl -s https://<api-host>/health
# {"status":"ok","database":"connected","redis":"connected","queue":"running","timestamp":"..."}
```

| Field | Meaning |
|---|---|
| `status` | `ok` only when the database **and** Redis are `connected`; otherwise `degraded` with HTTP 503 |
| `database` | `SELECT 1` succeeded within 3 s |
| `redis` | `PING` succeeded within 3 s |
| `queue` | `running` if BullMQ answered `getJobCounts` within 3 s, else `stopped`. This alone does not change the status code, and it does not prove a worker is *consuming* jobs |

Render uses `/health` as the API's health check. The web app has none; probe `/login`.

## Following one request

Every API request has an `X-Request-Id`. A caller's own id is kept if it matches
`^[A-Za-z0-9._:-]{1,128}$`; otherwise one is generated. It is returned as a response header and
appears on every log line for the request. `prism-web` assigns one per page render and forwards
it, so a page and each API call it made share an id.

1. Get the id: the `X-Request-Id` response header (browser dev tools, `curl -i`), which is also
   the id to quote in a bug report.
2. Search the log drain for it. In production each line is one JSON object:

   ```json
   {"level":"log","pid":1,"timestamp":1793965638000,"message":"ai_call {...}","context":"AiClientService","requestId":"..."}
   ```

   Inside the worker the field is `jobId` instead.
3. The access log line has the method, **path only** (never the query string), status and
   duration.

Structured events you can search for:

| Event in `message` | Emitted by | Carries |
|---|---|---|
| `webhook_received` | webhook intake | delivery id, event, action, repository id |
| `ai_call` | every Groq call | context, model, status, duration, prompt and completion tokens (or the error and whether it was aborted) |
| `issue_validation` | after pass 1 | review id, kept, dropped, drop reasons |
| `fix_validation` | after pass 2 | review id, kept, dropped |
| `Review job attempt N of 3 failed, will retry` | processor | the error |
| `... failed permanently` | processor | row id, attempts, error |

## Symptoms

### A review never appears

Work down the list; each step rules out a layer.

1. **Did GitHub deliver it?** Repository *Settings -> Webhooks -> Recent deliveries*. No entry:
   the repository is `pr_only` and you pushed, `commit_only` and you opened a PR, or the push
   was to an unwatched branch (empty list means `main` and `master`). A delivery with status
   **429**: the API was asleep ([below](#the-api-was-asleep-when-a-webhook-arrived)). **401**:
   wrong secret. **404**: the repository is not connected.
2. **Did the API accept it?** Open the delivery's response. `Review queued`/`Commit review
   queued` means yes. `Ignored action`, `Branch not watched`, `Repository set to PR-only mode`,
   `No head commit` explain themselves.
3. **Was a job created?** Look for `webhook_received`, then `PR review job started` or
   `Commit review job started`.
   - Accepted but no job ever starts: Redis is evicting. Check the start-up log for
     `IMPORTANT! Eviction policy is ...` and fix the policy ([deployment.md](deployment.md#2-redis)).
4. **Did the job fail?** See [the review is marked failed](#the-review-is-marked-failed).
5. **Did the comment post fail?** Look for `GitHub comment post returned <status>` or
   `GitHub comment post failed`. The review still completes. A 403 or 404 usually means the
   user's token lost write access to the repository.

### A review is stuck on `pending` or `analyzing`

A job that dies with the process (a deploy, an out-of-memory kill) leaves its row in
`analyzing`. BullMQ normally recovers stalled jobs, but a row whose job is gone stays put.

```sql
SELECT id, repository_id, status, updated_at FROM pull_requests
WHERE status IN ('pending','analyzing') AND updated_at < now() - interval '30 minutes';
```

The fix is **Re-analyze** from the review page, which re-enqueues the job. It needs no
database change.

### The review is marked `failed`

All three attempts failed (immediately, +60 s, +180 s). Find the error in
`Review job attempt N of 3 failed` lines for the row.

| Error | Cause | Fix |
|---|---|---|
| `Groq rate limited every model` | Groq's free-tier limit. Per-minute limits usually clear inside the 60 s and 180 s retries; a **daily** limit does not | Wait, then Re-analyze. A permanent fix is [T13](known-issues.md#t13) |
| A GitHub 401 or 403 on the diff fetch | The user's token is invalid, revoked, or unreadable | The user signs in again. If *every* user's token is bad, `APP_KEY` changed ([below](#every-review-fails-after-a-deploy)) |
| A GitHub 404 on the diff | The repository was deleted, renamed or made inaccessible | Disconnect it, or ignore |
| `exceeded 270000ms` | A job outran its budget (very slow Groq or GitHub) | Re-analyze; if frequent, investigate upstream latency |
| `Unknown review job name` | A job from an incompatible version is in the queue | Clear it, or redeploy the matching version |

### A review says "not reviewed"

No model produced a usable answer. The review *completed* so nothing is retried, and no GitHub
comment was posted. Check the `ai_call` lines for the row's time: statuses of `0` with an
`error` mean timeouts or network failures, `429` means rate limits (that case would have
retried instead), `200` means the model answered but not with parseable JSON. **Re-analyze**.
The two fixed summaries are in [database.md](database.md#summary-text).

### The API was asleep when a webhook arrived

On the free tier a sleeping API does not wake for requests proxied through `prism-web`
(Render's edge answers 429 instead), and GitHub does not redeliver on its own. Redeliver from
the repository's *Recent deliveries*, or push again. To prevent it, keep the API awake with an
external monitor, or move to an always-on plan ([deployment.md](deployment.md#free-tier-realities)).

### Visitors see the waking page, or "The server was asleep"

Expected after 15 idle minutes: `/waking` pings the API and returns the visitor in about 40
seconds. If it never returns, the API is failing to start; check the Render deploy log. A
Server Action shows "The server was asleep. Reload this page to wake it, then try again.";
reloading is a page load, which wakes the API.

### Sign-in succeeds but every page is anonymous

The browser and the API are not on one hostname, so the session cookie set by the API is never
sent back. Check that the user is browsing `prism-web`'s host, that `GITHUB_REDIRECT_URI` uses
the **web** host, and that `SESSION_COOKIE_NAME` is identical on both services.

### Every review fails after a deploy

If it began right after an environment change, suspect `APP_KEY`. A different key makes every
stored `github_token` unreadable; the decrypt returns nothing and GitHub answers 401 to the
empty token. Restore the old `APP_KEY`. If it is lost, users must sign in again (which re-writes
their token), and there is no way to recover the old ones.

### Everyone was signed out

`JWT_SECRET` changed or was regenerated. Expected and harmless; users sign in again.

### Duplicate comments on one pull request

Two attempts of one job both reached the comment step, or the pull request was re-analyzed
twice quickly. The deadline cancels in-flight work precisely to prevent the first case, so
treat a recurrence as a bug and capture the `jobId`s. Double clicks are not de-duplicated
([T8](known-issues.md#t8)).

### `/health` returns 503

`redis: down` or `database: down` names the dependency. Check the provider's status page and
connection limits. The API holds at most 5 database connections; a provider pooler or limit
below that produces connection errors at boot.

### Design Studio returns 503

The per-user rate-limit counter in Redis could not be read, and it fails closed. Fix Redis.

## Inspecting the queue

BullMQ keys are `<QUEUE_PREFIX>:prism-reviews:<state>` (default prefix `prism-bull`). These are
BullMQ internals and can differ across versions.

```bash
redis-cli -u "$REDIS_URL" LLEN  prism-bull:prism-reviews:wait      # waiting
redis-cli -u "$REDIS_URL" LLEN  prism-bull:prism-reviews:active    # running (at most 1)
redis-cli -u "$REDIS_URL" ZCARD prism-bull:prism-reviews:delayed   # waiting out a retry backoff
redis-cli -u "$REDIS_URL" ZCARD prism-bull:prism-reviews:failed    # last 500 failed jobs
```

The queue name `prism-reviews` is a live Redis key. Renaming it orphans anything queued.

## Rotating secrets

| Secret | Procedure | Effect |
|---|---|---|
| `JWT_SECRET` | Set a new value on `prism-api` and redeploy | Everyone is signed out |
| `APP_KEY` | **Do not.** If forced, every user must sign in again and until they do their reviews fail | Stored GitHub tokens become unreadable |
| `GROQ_API_KEY` | Set on `prism-api`, redeploy | None |
| GitHub OAuth client secret | Regenerate at GitHub, set `GITHUB_CLIENT_SECRET`, redeploy | Sign-in is unavailable between the two steps |
| A repository's webhook secret | Disconnect and reconnect the repository (a fresh secret is generated and the hook re-created) | None |
| An API token | The user revokes it in *Settings -> API tokens* and creates a new one | The MCP config needs the new token |
| Slack webhook | The user replaces it in *Settings* | None |

## Capacity

- One review runs at a time per instance. A burst of pushes queues and drains in order; each
  review takes seconds to a few minutes depending on Groq.
- Groq's free tier is the first limit you will hit. The two models share a quota, so falling
  back to the 8B model does not help when the cause is a daily cap.
- Memory is 512 MB. A growing heap during large reviews is the symptom of a raised diff limit or
  concurrency; revert whichever was raised.

## Backups and data

Postgres is the only store with durable value; use your provider's point-in-time restore or
snapshots. Redis holds the queue, caches, 30-day designs and 90-day saved risk; losing it loses
in-flight jobs and designs, not reviews. Before any DDL, branch or snapshot the database
([database.md](database.md#changing-the-schema)).

## Handling a user's data request

| Request | Action |
|---|---|
| "What do you store about me?" | They can open `/security/my-data` themselves |
| "Delete my account" | They use *Security -> My data -> Delete My Data...*, which asks for confirmation; the API equivalent is `DELETE /security/my-data` with `{"confirm":"DELETE"}` as that user |
| "Revoke access" | Revoking the OAuth app at GitHub does not clean up PRism's data; ask them to delete their data in PRism too |
