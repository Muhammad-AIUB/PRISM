# PRism Product Requirements Document

Status: baseline for the product as built at `3ae7b5f` (2026-10-26), plus the
requirements that apply to every change from here. Owner: Muhammad Jubayer.

Related: [App flow](Appflow.md) · [UI spec](Ui-spec.md) · [TRD](trd.md) · [Schema](schema.md) · [Plan](plan.md)

---

## 1. Summary

PRism is a self-hostable AI code reviewer for GitHub. Connect a repository and
PRism reviews every pull request, or every push to a watched branch, within about a
minute. It posts one short comment on GitHub that says whether anything should stop the
merge, lists the findings worst first, and says how risky the change is regardless of
what the AI found. The full review, with suggested fixes checked against the diff, is on
a dashboard, in a PDF, and inside the developer's AI assistant through an MCP server. A separate tool, Design Studio,
turns a short product brief into a system design before any code exists.

It runs at zero recurring cost on free tiers (Render, Neon, Upstash, Groq) and is MIT
licensed.

## 2. Problem

1. **Review time from experienced engineers is scarce.** Pull requests wait hours or days
   for a first look.
2. **Paid AI reviewers are expensive** (CodeRabbit lists $24 per developer per month),
   which prices out small teams, solo developers and developers in emerging markets.
3. **AI review output is hard to trust and slow to read.** Earlier versions of PRism
   showed line numbers the model invented and long lists of lint-level remarks. One
   wrong line costs more trust than ten correct findings earn.
4. **Nobody says how carefully to look.** A forty-line change to a login guard deserves
   more attention than a nine-hundred-line docs rewrite. A score built from reading lines
   cannot express blast radius.
5. **The most expensive mistakes happen before the first commit**: no timeout budget, a
   queue with no idempotency, a database whose restore was never tested. A code
   reviewer arrives too late for those.

## 3. Users

| Persona | Situation | What PRism gives them |
|---|---|---|
| **Solo developer** | Pushes straight to `main`, no second reviewer | Commit mode: a review of every push to watched branches |
| **Small team** | Juniors' PRs wait for a senior | PR mode: a first pass on every opened or updated PR, with a verdict that says whether to stop |
| **Price-sensitive developer** | Cannot justify a paid seat | The same pipeline for free, self-hostable |
| **Assistant-first developer** | Works inside Claude Code, Claude Desktop, Cursor | MCP tools to read reviews, apply fixes, re-run analysis and check risk without leaving the editor |
| **Builder at the design stage** | Has an idea and a scale, no code yet | Design Studio blueprint with failure modes and a readiness checklist |

**Which of these is the primary user is undecided** (open question Q1). There is no
outside usage yet. The live instance is also a portfolio piece, so engineering quality
is itself a goal.

## 4. Goals and non-goals

### Goals

- **G1 Trustworthy output.** Every location PRism shows points at a line the change
  actually touched, on the side it touched. A review that checked nothing never looks
  like a clean one.
- **G2 Readable in five seconds.** The verdict and at most three findings answer "should
  this stop the merge?" before anything else.
- **G3 Useful when the AI is down.** Risk Radar and the readiness checklist are
  deterministic and still work.
- **G4 Zero recurring cost** on free tiers, inside 512 MB per service.
- **G5 Private by default.** Repositories are never cloned or stored; diffs are cached for
  an hour; reviews keep only the short snippets they quote. Tokens encrypted, every action
  visible to the user, deletion on request.
- **G6 Available where developers already are:** GitHub, the browser, and AI assistants.

### Non-goals (for now)

- Inline line-by-line PR comments (GitHub Reviews API).
- Dismissing or triaging findings inside PRism.
- GitLab or Bitbucket.
- A second AI provider. PRism is Groq only; reordering or adding models requires
  re-measuring parse rates first.
- Chunked multi-pass review of very large PRs.
- Billing, teams or organisations as first-class accounts.

## 5. Product principles

These decide disputes about behaviour. Each is already true in the code; a change that
breaks one is a regression.

1. **Show only what can be checked.** A finding whose location does not resolve to a
   changed line is dropped, and the summary says how many were dropped.
2. **Only a checkable claim can block.** `blocking` requires a finding in a category a
   reader can confirm against the diff in seconds (auth weakened, public contract
   changed, outbound call with no timeout). The model calling something "critical" is not
   enough.
3. **Say what was not reviewed.** The summary states coverage ("Reviewed 7 of 14 changed
   files. 1 of them only in part.").
4. **Degrade to less, never to nothing.** Unparseable AI output still completes the
   review, labelled `not_reviewed` with the raw text. Design Studio falls back to a
   labelled baseline. Notifications failing never undo a review.
5. **No lint.** The prompt tells the model not to report what a linter catches.
6. **Never confirm what you cannot see.** A review id that is missing and one that belongs
   to someone else return the same "not found".
7. **Contracts only grow.** `/api/v1` fields may be added, never removed. Token formats
   and stored encodings never change.
8. **Measure before building.** Budgets, model choice and thresholds change on evidence,
   not on guesses.

## 6. Functional requirements

Status: **Shipped** (in `main`), **Partial** (shipped with a known gap), **Planned**.
Gaps reference [plan.md](plan.md).

### F1. Sign in with GitHub — Shipped

- One button: "Continue with GitHub". OAuth scopes `repo` and `read:user` only; the login
  page explains both before the user clicks.
- No passwords. The session is an httpOnly cookie valid for 30 days.
- Sign-out revokes the session on the server, so a copied cookie stops working.
- Acceptance: a new user goes from `/login` to the dashboard in one GitHub consent;
  signing out and replaying the old cookie returns 401.
- Gap: a GitHub account with no retrievable email cannot sign in if another such account
  exists (plan A4).

### F2. Connect a repository — Shipped

- The user sees their GitHub repositories (searchable) and connects one with a review
  mode: **PR only** (default), **Commits only**, or **Both**. Commit modes take a list
  of watched branches; the picker pre-selects the repository's default branch, and an
  empty list means `main` and `master`.
- Connecting installs a webhook subscribed to exactly the events the mode needs.
- Acceptance: after connecting, the next matching event produces a review with no
  further setup.
- Gaps: no disconnect; a duplicate connect fails with a server error (plan A6).

### F3. Repository settings — Shipped

- Change mode and watched branches without reconnecting; the webhook's event
  subscription follows.

### F4. Automatic PR review — Shipped

- Triggered when a PR is opened or a new commit is pushed to it.
- Acceptance: the review page shows progress within seconds and a result typically within
  a minute; the GitHub comment appears on the PR.

### F5. Automatic commit review — Shipped

- Triggered by a push to a watched branch in a commit-mode repository. The head commit of
  the push is reviewed. There is one row per repository and SHA, but a redelivered webhook
  or the same SHA pushed to another watched branch reviews it again and posts another
  comment (plan A8).
- Open question: what GitHub returns for a merge commit's diff (plan C1).

### F6. Review content — Shipped

Each review has:

| Element | Requirement |
|---|---|
| **Verdict** | One of Blocking, Worth a look, Nothing found, Not reviewed (principles 2 and 4) |
| **Findings** | Security, Performance and Code Quality, each with file, line, side, severity and category; ordered blocking first, then by severity |
| **Coverage** | One sentence when anything was skipped or partly reviewed |
| **Summary** | The model's summary after the coverage and dropped-finding notes |
| **Score** | 0-100, kept for compatibility and reconciled with the verdict (≤ 60 when blocking, ≥ 80 when nothing found); not the headline |
| **Suggested fixes** | Up to five before/after snippets, each checked against the diff (quoted code must appear within ±3 lines) |
| **Languages** | Detected from file extensions: PHP, JavaScript, TypeScript, Python, Go, Ruby, Java; language-specific rules exist for PHP, JS/TS, Python and Go |

Gap: valid JSON with none of the expected fields is shown as "Nothing found" instead of
"Not reviewed" (plan A1).

### F7. Risk Radar — Shipped

- Every review carries a deterministic change-risk score (0-100) and level (low < 25 ≤
  medium < 50 ≤ high) built from named signals: secrets, auth paths, migrations, removed
  or missing tests, CI and deploy files, dependency manifests, public API, config, size,
  spread.
- A "Before merging" checklist of at most six questions, triggered by the paths a change
  touches (secrets, auth, migrations, CI and deploy, public API) and by what its added
  lines do (network call with no timeout, string-built SQL, swallowed error, retries,
  queue publishes, unbounded concurrency, caching, manifest without lockfile).
- Shown in the GitHub comment, on both review pages, and through MCP. For a PR it always
  describes the revision that was reviewed; a live assessment of the current head is
  labelled as such.

### F8. GitHub summary comment — Shipped

- One comment per review: verdict line with finding count and score, the top three
  findings, the rest collapsed, the summary, the risk line with a collapsed checklist,
  and a link to the full review.

### F9. Reading reviews in the app — Shipped

- **Dashboard:** counts, average score, score timeline, latest PR and commit reviews,
  auto-refresh while anything is in progress.
- **Repository page:** every review for one repository, PRs and commits, 25 per page.
- **Review pages (PR and commit):** verdict panel, risk panel, summary, findings by layer,
  fixes with copy buttons, and for PRs a severity filter and the raw diff.
- Gaps: a commit review that is still pending, analyzing or failed shows "Nothing found"
  (plan A1); the five-tab layout duplicates the verdict panel (plan D2); "Reviews" in the
  nav has no page of its own.

### F10. Re-analyze — Shipped

- From the PR page, the commit page (when failed), or MCP. Re-analysis from the web
  clears the old result first, for PRs and commits alike; from the API a PR's old review
  stays visible until the new one lands.

### F11. PDF export — Partial

- PR reviews export to a PDF with score, summary and issues by layer.
- Gap: no verdict, ordered findings, fixes or risk in the PDF; no export for commit
  reviews.

### F12. Slack notifications — Shipped

- Optional incoming-webhook URL in Settings with a Test button. One message per completed
  review, coloured by score. Never sent for a review no model produced.

### F13. API tokens, REST API and MCP server — Shipped

- Users generate named tokens in Settings (shown once, revocable, last-used time shown).
- `/api/v1` offers: current user, recent reviews, latest review, review detail (commit
  and PR), risk, re-analyze, and designs.
- The `prism-code-review-mcp` server (v1.1.1) exposes nine tools: `get_latest_review`,
  `list_recent_reviews`, `get_commit_review`, `get_pr_review`, `reanalyze_commit`,
  `reanalyze_pull_request`, `get_change_risk`, `design_system`, `get_design`.
- Gap: the package is not yet on the npm registry, though its README says `npx` it
  (plan E3).

### F14. Design Studio — Shipped

- Input: product description (20-4,000 characters), scale (Prototype, Startup, Growth,
  Enterprise, each sent as concrete numbers), up to four ordered priorities, optional
  constraints.
- Output: a blueprint with components, data stores, request flow, failure modes (impact,
  mitigation, detection), reliability patterns, SLOs, scaling plan with numeric triggers,
  trade-offs, security, observability, risks, first milestones, and a production-readiness
  checklist that is never generated.
- Limits: 10 designs per user per hour; 55-second budget; kept 30 days; export as
  Markdown. Any AI failure returns the labelled baseline for the chosen scale.
- Gap: no real Groq output has been read by a person yet (plan C3).

### F15. Trust and data control — Partial

- Public Security & Privacy page explaining access, storage and permissions.
- **My Data:** everything PRism stores about the user, including a masked token preview.
- **Activity log:** sign-ins, connections, settings changes, reviews, exports, designs.
- **Delete everything:** typed confirmation, removes webhooks and all rows and stored
  designs and risk.
- Gaps: API tokens and short-lived caches survive deletion; some page copy is out of date
  (plan A5, D1).

### F16. Demo — Shipped

- `/demo` shows sample data with no sign-in.

### F17. Help — Shipped

- In-app "How to Use" guide covering PR and commit workflows, every feature, and an FAQ.

### F18. Waking a sleeping server — Shipped

- On the free tier the API sleeps after 15 idle minutes. A visitor who arrives while it
  sleeps sees "Starting the server" and is returned to their page when it answers
  (about a minute). Actions taken while it sleeps show a clear "reload to wake it"
  message.
- A scheduled GitHub Action is meant to ping the API every 10 minutes, but GitHub runs it
  only every few hours, so it does not keep the API awake.
- Gap: webhooks that arrive while the API sleeps may be lost (plan F1).

### F19. GitHub App sign-in — Planned

- Let teams install PRism per repository with granular permissions instead of the
  OAuth `repo` scope. Existing OAuth users keep working. No code exists yet.

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| **Cost** | $0 recurring. Free tiers only. |
| **Memory** | Each service stays inside 512 MB. Review worker concurrency is 1. |
| **Latency** | A review finishes within one job budget (270 s worst case per attempt); the UI tells users to expect 15-30 s. Design Studio answers within 55 s. |
| **Reliability** | Reviews retry up to three attempts. A completed review is never rolled back by a notification failure. |
| **Security** | GitHub tokens AES-256 encrypted at rest; webhook HMAC; per-request CSP nonce on the web; strict CSP on the API; rate limits on API (100/min), webhook (60/min), OAuth (10/min). |
| **Privacy** | Repositories are never cloned or stored. Diffs live in a one-hour cache; a review keeps only the snippets quoted in its suggested fixes, plus up to 1,500 characters of raw model output when parsing fails. Users can see their data and delete their account (API token rows currently survive; plan A5). |
| **Accessibility** | WCAG AA contrast in both themes, 12 px minimum text, 44 px targets for icon-only buttons (32 px for inline chips), keyboard focus always visible, reduced motion respected. See [Ui-spec.md](Ui-spec.md). |
| **Responsiveness** | Every page works at 390 px with no horizontal scroll. |
| **Compatibility** | `/api/v1` is additive-only; API token format and stored encryption are frozen; the production database schema is hand-managed. |
| **Quality gates** | Typecheck, lint, tests, builds and dependency audit pass in CI on every pull request. |

## 8. Success metrics

Pre-registered on 2026-09-14 for the review-output work, over 10 real PRs × 2 budgets ×
2 repeats = 40 runs. (The harness has since grown to 11 PRs and 3 rendering schemes.)
**None has been measured yet**; measuring them is plan C2.

| Metric | Target |
|---|---|
| Displayed line numbers that point at a changed line, on the right side | 100% |
| Median share of changed files sent to the model | Rises from the 8,000-character baseline to the budget the measurement supports |
| Median findings surfaced per review | ≤ 3 |
| Lint-category findings (`console.log`, `any`, missing `key`) across 40 runs | ≤ 1 |
| Same PR reviewed twice gives the same verdict | ≥ 18 of 20 pairs |
| A reader who is not the author can say what to fix from the review alone | Yes, on one observed read |

Operational signals to watch once there are users: reviews completed vs failed per day,
share of `not_reviewed` verdicts, time from webhook to comment, design fallbacks per day.

Known baseline (dry-run, 11 real PRs): 6 get full file coverage at 8,000 characters; the
other 5 get 22-50%, and a 40,000-character budget fixes 4 of those 5.

## 9. Constraints and assumptions

- **Hosting:** Render free tier; the API sleeps when idle and has no background-worker
  type, so the queue worker runs in the API process.
- **AI:** Groq free tier, `llama-3.3-70b-versatile` then `llama-3.1-8b-instant`, JSON
  mode. Daily token limits exist and are not handled separately from per-minute limits.
- **Data:** the production database, its schema and existing API tokens predate this
  codebase. Schema changes are hand-applied, and there is no agreed owner or rollback
  for them yet.
- **Diff budget:** 8,000 characters per review today. Larger PRs are reviewed in part,
  and the review says so.

## 10. Open questions

| # | Question | Blocks |
|---|---|---|
| Q1 | Who is the primary user: solo developers, price-sensitive developers, or teams drowning in noisy AI comments? | Prioritisation of plan workstream E |
| Q2 | Can `llama-3.3-70b-versatile` follow the rule set accurately? | The success metrics; any prompt change |
| Q3 | What diff budget and file cap should replace 8,000 characters? | Coverage on large PRs |
| Q4 | Does the score leave the UI entirely, or stay as a secondary number? | Comment and PDF layout |
| Q5 | Who applies production DDL, and what is the rollback? | Every schema change in plan workstream B |
| Q6 | What does GitHub return for a merge commit's diff? | Commit-mode reviews after every merge |

## 11. Release history

| Date | Milestone |
|---|---|
| 2026-05-17 | First version (Laravel): OAuth, webhooks, AI pipeline, hardening, commit mode, trust pages |
| 2026-06-12 | MCP server and token API |
| 2026-08-30 to 09-01 | Port to NestJS + Next.js; original application deleted |
| 2026-09-03 | Groq only |
| 2026-09-14 | Trustworthy review output: anchors, validation, verdict, coverage |
| 2026-09-24 | Risk Radar, Design Studio, CSP, server-side sign-out, request ids, web test suite, CI |
| 2026-10-04 | Repository reviews page; wake page |
| 2026-10-26 | Dependency patches; MCP server 1.1.1 (not yet published) |
