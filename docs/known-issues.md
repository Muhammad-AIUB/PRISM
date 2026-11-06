# Known issues and roadmap

An honest list of what is wrong or unfinished. It exists so nobody has to rediscover these, and
so a reader can judge what to rely on. If you fix an item, delete it here in the same pull
request. If you find one, add it.

**How to read the labels.** *Confirmed* means the behaviour was checked by reading the code on
the current `main` while writing this page. *Reported* means it came from the 2026-10-26 code
audit and was not re-read; treat it as a strong lead, not a fact. IDs (`T1`, `G2`, ...) are the
audit's and are kept so older commits and notes still resolve. None of these has caused a
reported incident; PRism has no outside users yet.

## Priorities

1. **A review that checked nothing can read as clean** (T1). This contradicts the product's
   central promise. Fix first.
2. **Review quality has never been measured** against the current pipeline (the model-accuracy
   half of the harness has not been run).
3. **Schema integrity fixes wait on one decision**: who applies DDL to production, and how it is
   rolled back.
4. **Reviews can be lost while the free-tier API sleeps** (T15).
5. A set of smaller correctness, privacy and UI defects.

## Correctness and safety

<a id="t1"></a>
### T1. Valid JSON without the expected keys becomes a clean review

*Confirmed.* `extractJson()` accepts any JSON object. If the model returns `{}` or
`{"error": "..."}`, the runner sees a parsed object, builds empty findings, computes the verdict
`nothing_found`, and posts a comment saying **NOTHING FOUND**. Separately, the API computes a
verdict for commit reviews that are `pending`, `analyzing` or `failed`, so the commit page can
read "Nothing found" before anything ran. Both contradict the rule that unparseable output
completes as `not_reviewed`.

**Fix:** in both runners require at least one of `security_issues`, `performance_issues`,
`code_quality_issues` or `summary` with the right type, otherwise take the
`incompleteReviewSummary` path; and compute no verdict for a commit review that is not
`completed`. Specs: a parsed object with none of the keys yields `not_reviewed` with no comment,
Slack message or `review_completed` audit row.

<a id="t2"></a>
### T2. Secrets in two responses

*Confirmed for `POST /repositories`, reported for `PATCH /profile`.* Connecting a repository
returns the saved entity spread into the response, which includes `webhookSecret`.
`PATCH /profile` returns the full user, including the token ciphertext and the password hash.
Only the owner receives them and `prism-web` discards them, but they should never leave the API.
**Fix:** return DTOs without those fields, and use `iso8601` timestamps there.

<a id="t3"></a>
### T3. `/health` is rate-limited

*Confirmed.* `@SkipThrottle()` with no argument skips a throttler named `default`; the only
throttler is named `api`, so the decorator does nothing. Each caller of `/health` is still capped
at 100 per minute. **Fix:** `@SkipThrottle({ api: true })`, with a spec on the metadata.

<a id="t4"></a>
### T4. Login handling of email and profile

*Confirmed.* Login writes `''` as the email when GitHub returns none, and `users.email` is
UNIQUE, so a **second** user without a public email cannot sign in. Every login overwrites the
name and email, discarding profile edits. A sign-in failure is redirected as
`/login?error=GitHub sign-in failed: <raw exception message>`. **Fix:** never write `''` (use
`{id}+{login}@users.noreply.github.com` or keep the existing value), do not overwrite edited
fields, and show a fixed message while logging the detail.

<a id="t5"></a>
### T5. Account deletion leaves residue

*Confirmed for tokens, reported for the rest.* Deleting an account does not delete the user's
`personal_access_tokens` rows (no foreign key) and does not purge the diff and GitHub-response
caches (up to an hour). `DELETE /profile` does not remove GitHub webhooks. The `account_deleted`
audit row is written and then removed by the cascade, so nothing records the deletion
(G10).

<a id="t6"></a>
### T6. Repository connect trusts the client

*Confirmed in part.* `POST /repositories` takes `github_repo_id` and `full_name` from the request
without checking them against GitHub, so a wrong id can block the real owner (the id is UNIQUE
across users); a duplicate connect is an unhandled unique violation (500); and there is **no
disconnect route**. **Fix:** verify with the user's token, answer 409 for a duplicate, add
`DELETE /repositories/:id` that removes the webhook and the rows.

<a id="t7"></a>
### T7. No transactions, and stale results on failure paths

*Confirmed that no transaction is used anywhere; the stale-result paths are reported.*
Multi-step writes (persisting a PR review, web re-analyze, connecting a repository) can stop
half-way, and the "no usable output" paths can leave earlier findings, fixes or comments beside a
`not_reviewed` summary.

<a id="t8"></a>
### T8. No job de-duplication

*Confirmed.* `ReviewQueueService` calls `queue.add` with no `jobId`. A double click on
Re-analyze, or a redelivered webhook, enqueues two jobs and posts two comments. **Fix:** a
BullMQ `jobId` from the row id and revision (PR `updated_at`, or the commit SHA).

<a id="t9"></a>
### T9. Pull-request events ignore the repository mode

*Confirmed.* `handlePullRequest` does not read `reviewMode`. Mode is enforced only through
GitHub's event subscription, so a failed hook update leaves PR reviews running on a `commit_only`
repository. **Fix:** check the mode in the handler as `push` does.

<a id="t10"></a>
### T10. The dashboard timeline shows the oldest 50 reviews

*Confirmed.* The query orders `created_at ASC` and takes 50, so after 50 scored reviews the trend
chart stops moving. **Fix:** take the newest 50 and present them oldest to newest.

<a id="t11"></a>
### T11. Configuration safety

*Confirmed.* `ConfigModule.forRoot` has no `envFilePath`, so it loads `.env` from the working
directory; starting the API from the repository root reads the production credentials.
`DB_SSLMODE` other than `disable` enables TLS with `rejectUnauthorized: false`, which never
verifies the server certificate. **Fix:** an explicit `envFilePath` and `ignoreEnvFile: true` in
production; support `DB_SSLMODE=verify-full`.

<a id="t12"></a>
### T12. Webhook intake details

*Confirmed.* The handler returns 404 `Repository not connected` before it checks the signature,
so anyone can learn whether a repository id is connected. The HMAC is computed over the
UTF-8-decoded string rather than the raw bytes, and bodies are limited to the parser default of
100 kB while GitHub allows payloads up to 25 MB. **Fix:** answer 401 for both cases, hash the
`Buffer`, and raise the body limit for this route only.

<a id="t13"></a>
### T13. A daily Groq limit fails a review in about four minutes

*Confirmed.* If every model answers 429 the attempt throws and BullMQ retries at +60 s and
+180 s; the 600 s step is never reached with three attempts. A per-minute limit usually clears;
a **daily** limit marks the review `failed` permanently. This is a knowingly accepted regression
from when the same case completed with an error blob. **Fix (needs no DDL):** read `retry-after`;
keep throwing for a per-minute limit; for a long one, finish as `not_reviewed` with a third fixed
summary prefix that `isIncompleteReview()` recognises. Waiting in-job was rejected because the
worker runs at concurrency 1 and would block every other review.

<a id="t14"></a>
### T14. Rate limiting is per route, in memory, and spoofable behind a proxy

*Confirmed.* Counters live in process memory and reset on deploy. `trust proxy` is `true`, so
the IP bucket can be evaded with a forged `X-Forwarded-For`. **Fix:** set `trust proxy` to the
real hop count and move counters to Redis.

<a id="t15"></a>
### T15. Webhooks received while the API sleeps may be lost

*Reported; the mechanism is confirmed.* Through `prism-web`, a sleeping API answers with Render's
429 and is never woken; direct to the API, a 40 to 60 s cold start exceeds GitHub's 10 s delivery
timeout. GitHub does not redeliver automatically. Whether this bites depends on the production
`APP_URL`. **Fix:** first check "Recent deliveries" on a connected repository after a sleep; if
they fail, redeliver failed ones on boot and on a timer through GitHub's hook-deliveries API using
each repository's `webhook_id`.

<a id="t16"></a>
### T16. Smaller defects

*Reported, except the branch cache (confirmed).* The PDF export crashes on an unknown legacy
severity. A failed branch lookup is cached as `[]` for 10 minutes. Revoking an unknown API token
reports success. Redis errors in `DesignStore.find` and `list` become 500s instead of degrading.
`varchar(255)` values from webhooks and DTOs are not length-guarded, so an over-long branch,
title or path fails the insert. `/api/v1/reviews` merges two lists by the `created_at` string
with no tiebreak.

<a id="integrity-gaps"></a>
## Data integrity gaps

*Confirmed against `schema.sql` where it is about constraints; the rest reported.* Each is a way
the data can go wrong. Fixes that need DDL wait on the production-DDL decision.

| ID | Gap | Consequence |
|---|---|---|
| G1 | No UNIQUE on `reviews.pull_request_id`; the runner's upsert is find-then-insert | Two overlapping jobs for one PR can create two reviews; reads pick one arbitrarily |
| G2 | No UNIQUE on `pull_requests (repository_id, github_pr_id)`; the webhook upsert is find-then-insert | Concurrent deliveries can create duplicate PR rows |
| G3 | `commit_reviews.status` and `repositories.review_mode` have no CHECK (unlike `pull_requests.status`) | Only TypeScript guards the values |
| G4 | No CHECK on `overall_score` | The 0 to 100 range is enforced only in code |
| G5 | `users.email` is NOT NULL UNIQUE but login writes `''` when GitHub returns none | See T4 |
| G6 | `personal_access_tokens` has no FK, is not deleted with the account, the guard does not check `tokenable_type`, and `abilities` is never enforced | Orphaned rows; tokens are all-powerful within their user |
| G7 | No transactions anywhere | See T7 |
| G9 | Account deletion does not purge diff caches (user code, up to 1 h) or GitHub-response caches (up to 10 min) | Breaks the erasure rule for up to an hour |
| G10 | The `account_deleted` audit row is written just before the cascade removes it | It never persists |
| G11 | `updated_at` is skipped by most runner writes, `markFailed`, the API commit re-analyze and token use | Misleading timestamps; for PRs it also feeds the diff-cache key |
| G12 | A deletion that fails late has already removed some GitHub webhooks and Redis data | The surviving account stops receiving events for those repositories |
| G13 | See T6 | |
| G14 | Webhook and diff values go into `varchar(255)` without truncation | See T16 |
| G15 | `/api/v1/reviews` sorts by `created_at` string with no tiebreak | Rows in the same second order unpredictably |

(G8 is the stale-results part of T7.)

## Free tier and operations

<a id="hosted-offline"></a>
- **The hosted instance is offline.** On 2026-11-06 both `https://prism-api-wmam.onrender.com/health`
  and `https://prism-web-fgts.onrender.com/login` returned Render's 404 with
  `x-render-routing: no-server`, which means no service answers at those hostnames. Whether the
  services were deleted, suspended or renamed has not been determined; it needs the Render dashboard.
  The keep-alive run at 04:57 UTC that day succeeded and the next, at 12:45 UTC, failed with the API's
  404. Consequences: there is no live demo; the MCP server's default `PRISM_URL` points at the dead
  host, so its tools fail with a 404 until `PRISM_URL` is set; and the keep-alive workflow's default
  hosts are the same, so every scheduled run fails. **Fix:** restore or redeploy the services from
  `render.yaml`, and if Render assigns new hostnames update `PRISM_API_URL`/`PRISM_WEB_URL`, the
  GitHub OAuth app's callback URL and the docs. **Proposed code changes, not made:** make `PRISM_URL` required in
  `mcp-server/index.js` instead of defaulting to a dead host, and stop defaulting the keep-alive hosts.

<a id="f3"></a>
- **Node is not pinned on Render.** `render.yaml` sets no `NODE_VERSION`, so Render resolves the
  `engines.node` ranges (`>=20.11` API, `>=22.12` web) and the major version can change under the
  app while CI tests on 22. Set `NODE_VERSION=22` or add a `.node-version`.
- **The keep-alive workflow does not keep the API awake.** GitHub runs a `*/10` cron far less often
  than every ten minutes (every few hours has been observed).
- **`/health` cannot see the worker.** `queue: running` means the queue is reachable, not that a
  job is being consumed. A heartbeat from the worker would close that.
- **The MCP package is not published.** `npm view prism-code-review-mcp` returns 404 as of
  2026-11-06, so `npx -y prism-code-review-mcp` fails. Run it from a clone
  ([mcp-server/README.md](../mcp-server/README.md)), or publish 1.1.1.

## Review quality (needs keys)

- **The model-accuracy arm of the harness has never been run against the current pipeline.**
  It is the only evidence that could overturn the anchor decision, set `DIFF_LIMIT` (8,000 today;
  an earlier dry run reported that 40,000 would fully cover four of five under-covered PRs; not
  re-run for this page), and measure the real fabrication rate. The coverage and prompt-overhead
  halves have run with `--dry-run`. See
  [testing.md](testing.md#measuring-model-behaviour). Do not change the diff budget, the model
  list, the prompt or a threshold before this is done.
- **Does GitHub return a usable diff for a merge commit?** A push's head commit is a merge commit
  after every PR merge. If GitHub returns an empty or combined (`@@@`) diff for
  `GET /repos/{owner}/{repo}/commits/{sha}` with `Accept: application/vnd.github.v3.diff`, every
  post-merge commit review would say it found nothing it could verify. This was raised by an outside
  reviewer and **has not been verified**; it needs one authenticated call against a real merge commit.
- **Design Studio output has not been read by a person.** No live Groq design has been reviewed for
  over-engineering or generic failure modes; only the fallback path has run end to end. Run about
  twenty briefs across all four scales and tighten the prompt from evidence.
- **No one but the author has read a review.** Watch one person who is not the author read one
  review and say what to fix.

<a id="ui-deviations"></a>
## UI deviations

*Reported.* Areas where `prism-web` does not yet meet [its own standards](frontend.md#standards):

- `hover:` and `active:` backgrounds that do not render; `@tailwindcss/forms` not scoped to the
  `class` strategy; some divider colours unset.
- No `--danger-solid` token; the chart is not themed; raw `rgba()` tints and some hard-coded hex in
  components.
- Some icon buttons are under 44 px and some primary touch actions are 36 px.
- Modal, drawer and menu lack dialog semantics, a focus trap and Escape handling; the closed drawer
  is not `inert`; tabs and toggles lack roles; live regions and some labels are missing; some pages
  have more than one `<h1>`.
- The connect modal does not reset per repository or show its errors; not every action call has a
  `.catch`; the return URL is lost through sign-in; "Reviews" is a nav item without a page;
  Profile's password-based delete is dead code; headings are inconsistent; deleting a design does
  not confirm.
- Both review pages carry five tabs *and* a verdict panel: two ways of reading the same data on one
  page. A single prioritised findings list is the intended replacement, after tests exist for the
  current views.
- In-app copy is stale in places: a PHP sample and a `.jsx` path in the Security page, a CSRF claim,
  an "IP Whitelist" card, and the score bands.

<a id="roadmap"></a>
## Roadmap

Ordered by value, not by date. Nothing here is committed.

**Correctness first** (no schema change): T1, T2, T3, T8, T9, T10, T11, T12, T13, then T4 to T7.

**Schema** (needs the production-DDL decision, written down as a runbook with a Neon branch dry
run): UNIQUE on `reviews(pull_request_id)` and `pull_requests(repository_id, github_pr_id)` with
`INSERT ... ON CONFLICT`; CHECKs for G3 and G4; persisting `risk_score`, `risk_level` and
`coverage` on the review row so the dashboard can trend risk; dropping `email_notifications` and
the legacy tables.

**Product:**

- **GitHub App installation alongside OAuth**: per-repository permissions and installation tokens
  without breaking OAuth users. No code exists. Design it against [database.md](database.md) first.
- **Inline PR comments** through the Reviews API using the validated anchor locations
  (`review_comments.github_comment_id` already exists). Only after the accuracy measurement shows
  locations are reliable.
- **A merge gate**: a GitHub commit status or check run from the verdict (blocking fails). The
  verdict, not the score, is the trustworthy signal.
- **PDF parity** with the web page: verdict, ordered findings, fixes and risk; commit-review export.
- **Design drift**: link a blueprint to a repository and check pull requests against its SLOs and
  failure-mode mitigations.
- **Calibrate Risk Radar weights from outcomes** (reverts, incident-linked PRs) once there is data.
- **Redeliver missed webhooks** (T15) and report worker liveness in `/health`.

**Not planned:** a second AI provider (see [ADR 0007](adr/0007-groq-is-the-only-ai-provider.md)),
email notifications (removed), and password sign-in.
