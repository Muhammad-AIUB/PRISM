# PRism "Google-scale review" Roadmap (master plan)

> **For agentic workers:** This is a roadmap, not an executable task list. Only Phase 0 has a task-by-task plan ([2026-11-07-phase0-honest-coverage.md](2026-11-07-phase0-honest-coverage.md)). Every later phase gets its own plan, written with superpowers:writing-plans **after** the previous phase ships, because each one changes what the next one has to build on. Execute plans with superpowers:subagent-driven-development.

**Source:** `google-review-concept.html` (19 sections, concept only: "numbers are targets, not measurements").

**Goal:** An engineer opens a review and knows in 10 seconds what to do, sees proof in a minute, and is never told "clean" about code the system did not read.

**Architecture:** Keep the existing pipeline (webhook, BullMQ, runners, `prepareDiff`, validated anchors, derived verdict) and add stages around it: triage, verification, feedback. Every phase ships alone and is worth having alone.

**Tech Stack:** NestJS 11, BullMQ, Postgres (hand-applied DDL), Redis, Groq, Next.js 15.

## Global Constraints

- No schema change without hand-applied DDL in `schema.sql` and a note in `docs/database.md`; status columns stay `varchar`.
- `/api/v1` additive-only. API error bodies are contracts.
- Groq is the only provider until a superseding ADR for ADR 0007 exists. Model order and temperature are measured; do not change without re-measuring.
- Golden fixtures are frozen; a prompt change must break a test on purpose (`docs/testing.md#changing-a-prompt-on-purpose`).
- Anything that runs untrusted code (fix verification, project build) needs a sandbox and an ADR first. **Owner decision 2026-11-07: sandbox work is deferred; no new server is being bought, and nothing in Phase 0, 1 or Track D P1 needs one.**
- No CI exists: each plan's last task runs typecheck, lint and tests in every touched package.

## Where the concept is already behind the code (correct before planning)

| Concept says | Code today | Consequence |
|---|---|---|
| 8,000-char sequential cut, "1 of 8 files" | `diff/file-selection.ts` already picks whole files or hunks and reports partial/skipped; `prepare.ts` writes the coverage sentence | Phase 0 is smaller: add the ratio and the partial verdict, not a new selector |
| Need a verdict instead of a score | ADR 0010: four verdicts derived on read, score reconciled | Done; Phase 0 adds a fifth |
| Cap inline comments at ~5 | `SHOWN = 3` in `summary-comment.builder.ts` | Already stricter; decide if inline review comments also need a budget |
| MCP clients read the score | MCP server removed (commit 1ae9bd0) | The "keep the score" reason is weaker; still keep it, `/api/v1` is additive-only |
| Anchors validate findings | ADR 0006, `issue-validator.ts` | Evidence tier A/B/C builds on this |
| "Groq retired two models" | Fixed in 279c870; list not re-measured | Eval set (Phase 4) is the real fix |

## Phases

### Phase 0: Full coverage, honestly reported (about 2 to 3 weeks)
Owner requirement (2026-11-07): the AI must review **everything** in every PR and commit. A partial review is a defect, not a feature. So Phase 0 has two parts.

**0a: Honest label (about 1 week), detailed plan exists** ([phase0-honest-coverage](2026-11-07-phase0-honest-coverage.md)). Ratio, `partial` verdict, score withheld under 50%, GitHub comment label, web panel, ADR 0011. It stays as the safety net for when full coverage fails (model error, deadline), never as the normal outcome.
Done when: an 8-file change where 2 files fit shows "Partial review", no score, on web and in the GitHub comment.

**0b: Review every reviewable file, in batches (about 2 weeks), plan to be written after the spike.** Today one model call sees about 8,000 characters (`DIFF_LIMIT` in both runners). The fix is to split the reviewable files into batches, review each batch, and merge the results (dedupe, then the same anchor validation and verdict).
Task 1 is a **spike, not code to ship**: measure on real PRs how many batches a typical PR needs, how long it takes, and whether Groq's rate limits and the job deadline allow it. Reuse `scripts/measure-anchoring.ts`. The outcome decides the rest.
Questions the spike must answer before the 0b plan is written:
- Batch count p50/p95 and total Groq calls per review; does it fit the rate limit and the derived job budget (`review.queue.ts`, never hard-code)?
- Does worker memory (512 MB, concurrency 1) hold?
- Cross-file blind spot: a change in file A and its caller in file B land in different batches. Mitigation to test: put files that import each other in the same batch, and add a one-line summary of the other batches to each call.
- Cost of a huge PR: cap by risk order (Risk Radar), and report anything past the cap through 0a's partial label, never silently.
Constraints: new work must stay safe to repeat (the deadline aborts and BullMQ retries), `signal.throwIfAborted()` before each side effect, both runners change together, golden fixtures stay frozen (do not touch the system prompt; batching changes the user message only).

### Phase 1: More signal, less noise (2 to 4 weeks)
Candidate tasks, to be re-scoped after Phase 0:
1. Risk-ranked file/hunk choice using Risk Radar (`diff/risk-radar.ts`) instead of diff order in `selectForReview`. Needs an ADR-0008-style note: Risk Radar stays deterministic.
2. Mechanical-change folding (rename, formatting, lockfile) shown as a count, never silently dropped.
3. Evidence tiers A/B/C on each finding: A = anchor resolves and a deterministic check agrees, B = anchor resolves, C = model only. Blocking requires A or B. Extends `issue-validator.ts`; BLOCKING_CATEGORIES stays.
4. Existence check for invented packages/functions (lockfile + symbol lookup).
5. Finding budget for inline comments (comment builder already caps the summary at 3).
Risk: tier labels can themselves be wrong (concept section 12); the golden set must score label accuracy.

### Phase 2: Do the work for the engineer (4 to 6 weeks)
GitHub `suggestion` blocks from `fix-validator.ts` output, "Copy as agent prompt", dismiss-with-reason. New `finding_feedback` table (hand-applied DDL). Sandbox-verified fixes are a separate sub-phase and need their own ADR (fork PRs off by default, network off, time/memory caps).

### Phase 2a: History and scale, the "500 commits" problem (4 to 6 weeks, parallel to Phase 2)
Compare-API commit capture on push (`webhook.service.ts`), resumable backfill on `review.queue.ts`, Risk Radar first and AI only on top N, cost estimate and cancel on connect (`RepositoriesView.tsx`). Redis data about a user must be erasable (`AccountDataService`). Respect the 512 MB worker, concurrency 1.

### Phase 3: Right person, right time (6 to 9 weeks)
CODEOWNERS/blame reviewer suggestion, human-time estimate, guided mode, saved views, "what changed since last push", calm notification policy, linter/type-check/test in the verifier (sandbox dependency).

### Phase 4: Learn and measure (9+ weeks)
Eval set of real bugs and traps (this is also the blocker for any model change), per-repo suppression, weekly precision report, abstain ("not sure"), "wrong claim" button. First task: measure baselines (accepted-fix rate, noise rate) before setting any target. **Decided 2026-11-07:** no separate analytics tool; the numbers start accumulating when Phase 2 ships Apply/Dismiss with a reason (the `finding_feedback` table is the source).

### Track B: Bring your own model (sections 15 and 16) , SCOPE SET 2026-11-07: API key only; detailed plan: [track-b-own-api-key](2026-11-07-track-b-own-api-key.md)
Owner direction so far: Groq on the server stays the default for every user; a user may optionally connect their own AI and pick from that provider's models. Open point raised and not yet settled: consumer subscriptions (ChatGPT Plus, Claude Pro) do not come with API keys, so the connect flow can only use API keys. **Owner decision (2026-11-07): API key only.** Server Groq stays the default for everyone; a user may add their own provider API key and pick from that provider's models. Deferred, not cancelled: OpenRouter Connect button, the "Sign in with ChatGPT" spike. Rejected: any local bridge to a logged-in CLI, and any Claude subscription login. The UI must say "API key, not a subscription; billed by the provider". Still needs a superseding ADR for ADR 0007 before code.

**Provider research (2026-11-07, from web search; secondary sources, re-check each primary page before building):**

| Route | Finding | Verdict |
|---|---|---|
| Claude Pro/Max login | Anthropic's terms bar consumer-plan OAuth tokens in any third-party product (enforced since Jan 2026, made explicit Feb 2026). Developers are directed to Console API keys. | **Not allowed.** API key only. |
| ChatGPT plan | OpenAI has an official "Sign in with ChatGPT" for third-party apps (terms dated 2026-09-29): tokens only via the supported flow, no pooling/sharing, usage counts against the user's own plan limits. Eligibility per plan is unconfirmed. | **Possibly allowed, via the official flow only.** Needs reading OpenAI's primary terms and developer docs, and registering the app. Spike first. |
| GitHub Models | Every GitHub account gets rate-limited free access; paid usage opt-in; billing separate from Copilot. Reported free limits are low (about 10 requests/min, 50 to 150/day, 8k input tokens), unverified. | Useful for light use, **too small for batched full-PR reviews** (Phase 0b makes several calls per review). |
| Google AI Studio (Gemini) | Free API key without payment info is reported; limits only visible in AI Studio, model eligibility varies, new users may be forced to prepaid from 2026-03-23 (unverified). | API key route. Verify limits in AI Studio before promising "free". |
| OpenRouter | Official PKCE "Connect" flow returns a per-user API key; usage is paid by the user. | **Allowed and simple.** Best first "Connect" button. |
| Local bridge to a logged-in CLI | Breaks webhook-triggered reviews (user's PC must be on), needs a tunnel, and a Claude CLI bridge would still run into the Anthropic rule above. | **Do not build.** |

Recommendation for the Track B plan: Step A (provider interface, Groq default, no behaviour change); Step B (API key entry + OpenRouter Connect); a separate spike for "Sign in with ChatGPT". Every custom-key review must also tolerate that a user's provider rate limit may be lower than Phase 0b's call count (batch count must be configurable and fall back to the 0a partial label).

A: provider interface behind `ai-client.service.ts` with Groq default and no behaviour change. B: **key stored encrypted on the server** (changed from the concept's browser-held key: webhook-triggered reviews run with no browser open, and CSP `connect-src 'self'` forbids browser-to-provider calls); fixed provider URLs only. C: eval-gated "Tested" badge. **Blocked on a new ADR superseding 0007.** Never promise subscription login; API keys only. Custom base URLs need SSRF controls (https only, block private ranges, re-check IP after DNS).

### Track C: Design Studio v2 (section 16, steps D to F)
Large and speculative. Do not plan until Track B step A exists. Steps E and F need the sandbox.

### Track D: Project Explainer (sections 17 to 19)
P1 (about 3 weeks, no AI): safe zip ingest (size, count, depth limits, path normalisation, temp dir wiped after), GitHub fetch via `github-client.service.ts`, static analysis to a project-map JSON, diagrams generated from the graph, HTML export. P2: map/reduce explanations, every claim carries `file:line` or is labelled "inference". P3: Bangla, PDF (pdfmake, Bengali shaping test first), DOCX. P4: Q&A and incremental update. Secrets files excluded before anything leaves the server; repository text is treated as data (prompt injection).

## Suggested order

Phase 0, Phase 1, then Phase 2 and 2a in parallel (different files), Phase 3, Phase 4. Track D P1 can start any time because it touches no review code. Track B waits for its ADR. Track C last.

## Decisions

Settled (2026-11-07):
- Every PR and commit must be reviewed in full; partial is only the failure fallback (Phase 0b).
- Sandbox deferred; no new infrastructure now.
- No analytics tool; baseline comes from Phase 2 feedback buttons.

Still open:
1. `MIN_COVERAGE = 0.5` for the fallback label: keep? (Matters only when 0b could not cover everything.)
2. Track B scope (see its section).
