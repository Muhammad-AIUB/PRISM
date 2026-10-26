# PRism App Flow

Status: describes how people and systems move through PRism as built at `3ae7b5f`
(2026-10-26). Screen layouts are in [Ui-spec.md](Ui-spec.md); endpoint details are in
[trd.md](trd.md).

Related: [PRD](PRD.md) · [UI spec](Ui-spec.md) · [TRD](trd.md) · [Schema](schema.md) · [Plan](plan.md)

---

## 1. Actors

| Actor | Talks to | How |
|---|---|---|
| **Visitor / user** (browser) | `prism-web` only | Pages and server actions. The one exception is `/waking`, where the browser pings the API directly. |
| **prism-web** (Next.js) | `prism-api` | Server-side fetches from React Server Components and Server Actions, forwarding the session cookie and `X-Request-Id`. |
| **GitHub** | `prism-api` | OAuth redirects, webhooks to `/webhook/github`. PRism calls GitHub's REST API for repos, branches, diffs, hooks and comments. |
| **MCP client** (Claude Code, Cursor…) | `prism-api` `/api/v1` | Bearer API token, through the `prism-code-review-mcp` server on the developer's machine. |
| **Groq** | — | Called by `prism-api` for reviews, fixes and designs. |
| **Slack** | — | Receives a message per completed review when configured. |

Both services answer on **one hostname**. `prism-web` rewrites `/auth/*`, `/api/v1/*`
and `/webhook/*` to the API, so the session cookie the API sets is first-party for every
page.

---

## 2. Site map

```mermaid
flowchart LR
    subgraph Public
        root["/"] --> login["/login"]
        login --> demo["/demo"] --> demoReview["/demo/review/:id"]
        login --> loginGh["/login/github"]
        security["/security"]
        waking["/waking"]
    end

    subgraph API["Proxied to prism-api"]
        authGh["/auth/github"] --> cb["/auth/github/callback"]
        logout["POST /auth/logout"]
    end

    subgraph App["Signed in (AuthenticatedLayout)"]
        dash["/dashboard"]
        repos["/repositories"] --> repo["/repositories/:id"] --> repoSettings["/repositories/:id/settings"]
        repos --> repoSettings
        review["/reviews/:id"] --> pdf["/reviews/:id/export (PDF)"]
        commit["/commits/:id"]
        design["/design"] --> blueprint["/design/:id"] --> md["/design/:id/markdown"]
        settings["/settings"]
        profile["/profile"]
        myData["/security/my-data"]
        audit["/security/audit-log"]
        help["/help/how-to-use"]
    end

    loginGh --> authGh
    cb --> dash
    root -->|"signed in"| dash
    dash --> review
    dash --> commit
    repo --> review
    repo --> commit
    security --> myData
    security --> audit
```

### Route table

| Path | Access | Purpose |
|---|---|---|
| `/` | public | Redirects to `/dashboard` if signed in, else `/login` |
| `/login` | public | Sign-in card, demo link, permissions disclosure. Shows `?error=` and `?status=` |
| `/login/github` | public (route handler) | Checks the API is awake, then hands over to `/auth/github` |
| `/waking` | public | Wakes a sleeping API from the browser, then returns to `?next=` |
| `/demo`, `/demo/review/:id` | public | Sample data, no session |
| `/security` | public, session-aware | Security & Privacy explainer; extra actions when signed in |
| `/dashboard` | session | Stats, score timeline, latest PR and commit reviews |
| `/repositories` | session | GitHub repos, connect with a review mode |
| `/repositories/:id` | session | All reviews for one repository (`?kind=prs\|commits&page=n`) |
| `/repositories/:id/settings` | session | Review mode and watched branches |
| `/reviews/:id` | session | PR review (`:id` is the pull request row id) |
| `/reviews/:id/export` | session (route handler) | PDF download |
| `/commits/:id` | session | Commit review |
| `/design` | session | Design Studio form and saved designs |
| `/design/:id` | session | Blueprint |
| `/design/:id/markdown` | session (route handler) | Markdown download |
| `/settings` | session | Slack webhook, API tokens |
| `/profile` | session | Name and email |
| `/security/my-data` | session | Everything stored, delete everything |
| `/security/audit-log` | session | Activity timeline |
| `/help/how-to-use` | session | Guide and FAQ |

Signed-out access to any session page redirects to `/login` (the PDF and Markdown
download routes return the API's JSON error instead). The original URL is not kept, so
after sign-in the user lands on `/dashboard`.

---

## 3. Sign in

```mermaid
sequenceDiagram
    actor U as User
    participant W as prism-web
    participant A as prism-api
    participant G as GitHub

    U->>W: GET /login, click "Continue with GitHub"
    U->>W: GET /login/github
    W->>A: GET /health
    alt API asleep (Render edge 429, x-render-routing: hibernate…)
        W-->>U: 307 /waking?next=/login/github
        Note over U,A: Wake flow (§4), then back to /login/github
    else API awake
        W-->>U: 307 /auth/github
    end
    U->>W: GET /auth/github (rewritten)
    W->>A: proxy
    A-->>U: Set-Cookie prism_oauth_state (10 min), 302 to GitHub authorize
    U->>G: Consent: scopes repo, read:user
    G-->>U: 302 /auth/github/callback?code&state
    U->>W: GET /auth/github/callback (rewritten)
    W->>A: proxy
    A->>A: Verify state (constant-time), clear state cookie
    A->>G: Exchange code, then GET /user (and /user/emails if needed)
    A->>A: Upsert user by github_id, encrypt token, audit "login"
    A-->>U: Set-Cookie prism_session (JWT, 30 days), 302 /dashboard
```

- **Failure:** any error in the callback redirects to
  `/login?error=GitHub sign-in failed: <message>`.
- **Throttle:** `/auth/github` and the callback allow 10 requests per minute.
- **Already signed in:** `/login` does not redirect away; `/` does.

---

## 4. Waking a sleeping API

On Render's free tier `prism-api` sleeps after 15 idle minutes. While it sleeps,
Render's edge answers requests from `prism-web` with a 429 carrying
`x-render-routing: hibernate-rate-limited` and **does not start the service**. Only a
request from outside Render wakes it.

```mermaid
sequenceDiagram
    actor U as Browser
    participant W as prism-web
    participant E as Render edge
    participant A as prism-api

    U->>W: GET /reviews/42
    W->>E: GET /reviews/42 (server-side)
    E-->>W: 429 x-render-routing: hibernate-rate-limited
    W-->>U: 307 /waking?next=/reviews/42
    loop every 10 s
        U->>A: GET {apiOrigin}/health (no-cors, direct)
    end
    loop every 3 s
        U->>W: GET /auth/me (same origin)
    end
    Note over A: Wakes in ~40-60 s
    W-->>U: any non-hibernating answer (200 or 401)
    U->>U: location.replace("/reviews/42")
```

- `next` must be a same-site path; anything else falls back to `/dashboard`.
- After 90 s the page adds "This is taking longer than usual." and a "Try again" link.
- **Server actions never redirect.** An action that finds the API asleep returns the
  message "The server was asleep. Reload this page to wake it, then try again."
- `/waking` is the only page whose CSP `connect-src` allows the API origin.

---

## 5. First use: connect a repository

```mermaid
flowchart TD
    A[Dashboard, empty state] -->|Connect Repository| B["/repositories"]
    B --> C{GitHub list loaded?}
    C -->|error| C1[Hint by status:<br/>401 sign in again · 403/429 rate limited ·<br/>no response reload]
    C -->|ok| D[Search, click Connect on a repo]
    D --> E[Mode modal]
    E --> F{Mode}
    F -->|"PR only (default)"| H[Connect]
    F -->|Commits only / Both| G[Pick watched branches<br/>default branch pre-selected]
    G --> H
    H --> I[API: insert repository,<br/>create GitHub webhook for the mode's events]
    I -->|webhook failed| J[Row removed,<br/>400 'Failed to install webhook…']
    I -->|ok| K[Flash 'Connected …',<br/>card shows Connected + mode]
    K --> L[Card links to /repositories/:id]
```

Mode → webhook events:

| Mode | GitHub events | Reviews |
|---|---|---|
| `pr_only` | `pull_request` | PR opened or synchronized |
| `commit_only` | `push` | Pushes to watched branches |
| `both` | `pull_request`, `push` | Both |

**Changing settings** (`/repositories/:id/settings`) saves the mode and branches and
updates the webhook's events. If the GitHub update fails it is only logged, so the hook
can keep sending events the new mode does not want. Leaving branches empty means
`main` and `master`.

There is no disconnect. A repository stays connected until the account is deleted.

---

## 6. Automatic review

### 6.1 Webhook intake

```mermaid
flowchart TD
    W[POST /webhook/github] --> P[Parse JSON body]
    P --> R{repository.id present?}
    R -->|no| R400[400 Missing repository id]
    R -->|yes| F{Repository connected?}
    F -->|no| F404[404 Repository not connected]
    F -->|yes| S{HMAC sha256 valid<br/>for this repo's secret?}
    S -->|no| S401[401 Invalid signature]
    S -->|yes| E{X-GitHub-Event}
    E -->|ping| PONG[200 pong]
    E -->|pull_request| PA{action opened<br/>or synchronize?}
    PA -->|no| IGN1[200 Ignored action]
    PA -->|yes| PR[Upsert pull_requests row,<br/>status pending]
    PR --> QP[Enqueue pr-review<br/>with the row id] --> OKP[200 Review queued]
    E -->|push| M{mode pr_only?}
    M -->|yes| IGN2[200 PR-only mode]
    M -->|no| B{branch watched?}
    B -->|no| IGN3[200 Branch not watched]
    B -->|yes| D{deleted, or no head commit?}
    D -->|yes| IGN4[200 skipped]
    D -->|no| CR[First-or-create commit_reviews row<br/>for repo + head SHA<br/>an existing row is re-queued as it is]
    CR --> QC[Enqueue commit-review<br/>with the row id] --> OKC[200 Commit review queued]
    E -->|other| IGN5[200 Ignored event]
```

- Only the head commit of a push is reviewed.
- PR events are not checked against mode or branches; the webhook subscription is the
  only gate.
- The webhook route allows 60 requests per minute.

### 6.2 Job processing

```mermaid
sequenceDiagram
    participant Q as BullMQ (prism-reviews, concurrency 1)
    participant R as Runner
    participant G as GitHub
    participant AI as Groq
    participant DB as Postgres
    participant S as Slack

    Q->>R: job {pullRequestId} or {commitReviewId}
    R->>DB: status = analyzing
    R->>G: fetch diff (Redis cache 1 h, ≤ 2 MB)
    R->>R: select files within 8,000 chars, anchor changed lines,<br/>detect languages, assess risk (deterministic)
    R->>AI: pass 1: llama-3.3-70b, then llama-3.1-8b-instant
    alt no model returned parseable JSON
        R->>DB: completed, score null, fixed fallback summary (raw text kept)
        Note over R: verdict not_reviewed, no comment, audit or Slack
    else parsed
        R->>R: drop findings whose anchor does not resolve,<br/>verdict, reconcile score, coverage sentence
        R->>DB: save findings, score, summary (PR: review row,<br/>review_comments, saved risk)
        R->>AI: pass 2 (fixes), same model
        R->>R: keep fixes whose quoted code is within ±3 lines
        R->>DB: save suggested_fixes
        R->>G: post summary comment (PR timeline or commit)
        R->>DB: status = completed, audit review_completed
        R->>S: message, if configured (failure only logged)
    end
```

Each attempt has a 270-second budget. When it runs out, an `AbortController` cancels
every in-flight call, and the runner checks it before saving results and before posting,
so a timed-out attempt never posts a comment.

### 6.3 Status lifecycle

```mermaid
stateDiagram-v2
    [*] --> pending: webhook
    pending --> analyzing: job starts
    analyzing --> completed: result saved (includes not_reviewed)
    analyzing --> analyzing: attempt fails, retry after 60 s, then 180 s
    analyzing --> failed: third attempt fails
    completed --> analyzing: re-analyze, or the same commit SHA pushed again
    failed --> analyzing: re-analyze
    completed --> pending: new push to the PR (synchronize)
```

The review and dashboard pages poll while anything is `pending` or `analyzing`
(review pages every 5 s, dashboard and repository pages every 8 s).

---

## 7. Reading a review

```mermaid
flowchart LR
    D["/dashboard"] -->|row| RV["/reviews/:id or /commits/:id"]
    RP["/repositories/:id"] -->|row| RV
    GH[GitHub comment<br/>'View full review'] --> RV
    RV --> V[Verdict panel:<br/>verdict + top 3 findings]
    V --> RK[Risk panel<br/>loaded after render]
    RK --> SM[AI summary]
    SM --> T[Tabs: Security · Performance ·<br/>Code Quality · Auto-Fixes · Diff*]
    T --> X[Copy a fix · Export PDF* · View on GitHub]
```

`*` PR reviews only. Reading order is deliberate: verdict first, then how risky the
change is, then detail.

- A review id the user does not own, or that does not exist, shows the same 404 page.
- The verdict is computed when the page is read, so legacy reviews (before 2026-09-14)
  get a panel too. On a commit review the panel also renders while the review is
  pending, analyzing or failed, where it wrongly reads "Nothing found"
  ([Ui-spec.md](Ui-spec.md#11-known-deviations) D31).

---

## 8. Re-analyze

| From | What happens before the new job runs |
|---|---|
| PR page (web) | Status `analyzing`; the old review and its comments are **deleted**; saved risk forgotten |
| Commit page (web, failed reviews only) | Status `analyzing`; score, summary, findings and fixes cleared; diff cache forgotten |
| MCP / `/api/v1` PR | Status `analyzing`; the old review **stays visible** until the new one lands |
| MCP / `/api/v1` commit | As the web commit path |

Each re-analyze enqueues a new job and writes a `review_reanalyzed` audit entry. Clicking
twice enqueues twice (no de-duplication).

---

## 9. Design Studio

```mermaid
sequenceDiagram
    actor U as User
    participant W as prism-web
    participant A as prism-api
    participant AI as Groq

    U->>W: /design: product, scale, ≤ 4 priorities, constraints
    W->>A: POST /design (server action)
    A->>A: Account being deleted? → 410
    A->>A: Redis counter: > 10 this hour? → 429 (Redis down → 503)
    A->>AI: Generate (55 s budget, cancelled on timeout)
    alt usable answer
        A->>A: Normalise and cap every field
    else timeout, rate limit, no answer, unusable
        A->>A: Baseline blueprint for the scale, with a notice
    end
    A->>A: Add readiness checklist (deterministic), save to Redis (30 days),<br/>audit design_created
    A-->>W: {design}
    W-->>U: redirect /design/:id
    U->>W: Copy Markdown / Download .md / tick readiness items (kept in this browser)
```

From an editor the same thing happens through MCP `design_system`, which returns the
blueprint as Markdown; `get_design` lists or fetches saved designs.

---

## 10. API tokens and MCP

```mermaid
sequenceDiagram
    actor U as Developer
    participant W as prism-web /settings
    participant A as prism-api
    participant M as MCP server (local)

    U->>W: Generate token "laptop"
    W->>A: POST /settings/api-tokens
    A-->>W: "{id}|{plaintext}" (shown once)
    U->>M: configure PRISM_API_TOKEN (+ PRISM_URL, default the hosted API)
    M->>A: GET /api/v1/reviews/latest  (Authorization: Bearer …)
    A-->>M: {type, review}
    M-->>U: score, findings, fixes in the assistant
    U->>M: "re-run it"
    M->>A: POST /api/v1/pull-requests/:id/re-analyze
```

Revoking a token in Settings stops it immediately. Every token failure is a 401 with the
body `{"message":"Unauthenticated."}`; rate limiting is a 429 with
`{"message":"Too Many Attempts."}`. The MCP server shows them as
`PRism API 401: {…}`.

---

## 11. Settings, data and sign-out

**Slack:** paste an `https://hooks.slack.com/…` URL, Test (sends a test message and shows
Slack's answer), Save. Clearing the field turns notifications off.

**My Data → delete everything:**

```mermaid
flowchart TD
    A["/security/my-data"] --> B[Delete My Data…]
    B --> C[Type DELETE]
    C --> D[Permanently Delete Everything]
    D --> E[API: set erasure marker]
    E --> F[Purge saved risk and designs in Redis]
    F --> G[Remove each repository's GitHub webhook<br/>failures only logged, then audit account_deleted]
    G --> H[Delete user row → cascade]
    H --> I[200, redirect to /login]
    E -.any step fails.-> J[Clear marker, 503<br/>'…it has not been deleted…']
```

**Profile → delete account** asks for a password that GitHub users do not have; the page
sends them to My Data instead.

**Sign out:** user menu → Log out → `POST /auth/logout` (revokes the JWT in Redis until
it would expire, clears the cookie) → `/login`.

---

## 12. Error handling, as the user sees it

| Situation | Page load (RSC) | Server action |
|---|---|---|
| Not signed in / session revoked (401) | Redirect to `/login` | `ok: false`, message "Unauthenticated." |
| Not yours, malformed id, missing (400/403/404) | 404 page: "does not exist, or it belongs to another account" | `ok: false` with the API message |
| Validation (422) | — | `ok: false`, field errors under the inputs |
| Rate limited (429) | GET retried once if the wait is ≤ 5 s, otherwise error | `ok: false`; Design Studio shows "You have generated a lot of designs this hour…" |
| API asleep | Redirect to `/waking?next=…` | 503 "The server was asleep. Reload this page to wake it, then try again." |
| Anything else (5xx) | Error boundary: "Something went wrong", digest, Try again | `ok: false` with a fallback message |

Gaps in these paths (actions with no `.catch`, raw JSON from the PDF route on failure)
are listed in [Ui-spec.md §11](Ui-spec.md#11-known-deviations).

---

## 13. Demo

`/login` → "Explore Demo" → `/demo` (sample dashboard) → `/demo/review/:id` (sample
review with Issues and Auto-Fixes tabs). Every demo navigation item except Security &
Privacy (the real `/security`) leads back to `/demo`; "Sign in with GitHub" leads to
`/login`. Nothing in the demo calls GitHub or
writes data.
