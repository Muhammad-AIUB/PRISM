# Risk Radar and Design Studio

Status: shipped · 2026-09-24

## The problem

PRism answers one question well: *what is wrong with these lines?* A developer's
day raises two more, and PRism answered neither:

1. **"How carefully should I look at this?"** A senior reviewer settles that in
   the first ten seconds of opening a pull request, from where the change lands
   rather than what it says. A forty-line change to a login guard needs more
   attention than a nine-hundred-line docs rewrite. The AI score can't express
   that, because it reads lines and not their blast radius.
2. **"What should I build?"** The most expensive mistakes are made before any
   diff exists: no timeout budget, a queue with no idempotency, a single database
   whose restore nobody has ever tested. A code reviewer arrives too late for
   those.

## What shipped

### Risk Radar: deterministic change risk, on every review

`prism-api/src/diff/risk-radar.ts`, a pure function from a unified diff to:

- a **0–100 score and level** (low < 25 ≤ medium < 50 ≤ high), built from
  weighted, named **signals**: auth paths, migrations, hardcoded secrets or known
  token shapes, no tests changed, tests removed, CI/deploy config, dependency
  manifests, public API surface, runtime config, size and spread;
- a **"Before merging" checklist** of at most six questions, prioritised with
  what cannot be undone first. Each one is triggered by what the *added lines*
  do: a network call with no timeout in the same file, SQL built by
  interpolation, a swallowed error, retries, queue publishes, unbounded
  concurrency, caching, a manifest changed without a lockfile, a new migration
  with no way back.

It appears in three places:

| Surface | How |
|---|---|
| GitHub comment | One line after the summary plus a `<details>` task list. Omitted entirely when no assessment was supplied, so the old comment is byte-identical. |
| Review pages (PR and commit) | `RiskPanel` below the verdict, loaded after the page renders |
| MCP | `get_change_risk` tool → `GET /api/v1/{pull-requests,commits}/:id/risk` |

**Why deterministic, not another model pass.** The same diff always gives the
same answer, so every rule has a test. It costs nothing on every push, and it
still works when Groq is down, which means a review whose AI pass degraded still
carries a useful signal. The output is phrased as questions because a path name
is evidence of where to look, not proof that anything is wrong.

**Why it can't break a review.** The runners call `tryAssessRisk()`, which
returns `null` on any exception. A pattern bug costs the comment its risk
section, never the user their review or a BullMQ retry.

**Bound to the reviewed revision.** A pull request's diff moves with every
push, while the page keeps showing the previous review until the next one
completes. So the PR runner saves the assessment of the exact diff it reviewed
(`ReviewRiskStore`, Redis, 90 days), and the pages serve that with
`basis: "reviewed"`. Only when none exists (reviews older than this feature, or
expired) is the live head assessed, through the runners' diff-cache keys, and it
is returned as `basis: "current"` with a visible note. A commit's diff is
immutable per SHA, so its risk is always the reviewed revision. This was
tightened after review: the first version keyed on the live pull request, which
could put a panel about a later push beside a verdict about an earlier one.

### Design Studio: a system design before the first commit

A brief goes in: the product, a scale band, up to four ordered priorities, and
constraints. A **blueprint** comes out: components, data stores, request flow,
failure modes (impact / mitigation / detection), reliability patterns, SLOs, a
scaling plan with numeric triggers, trade-offs, security, observability, risks,
first milestones, and a **production-readiness checklist**.

- Web: `/design` (form and history), `/design/[id]` (blueprint, Copy Markdown,
  Download `.md`). Nav entry "Design Studio".
- MCP: `design_system` returns the design as Markdown an agent can commit, and
  `get_design` fetches or lists saved designs.

Design choices, each deliberate:

- **The prompt argues against over-engineering.** Scale bands are sent as
  numbers ("~50 requests/second peak"), not words. The model is told the simplest
  design that meets the load wins, and that every component needs a reason tied
  to the brief. Failure modes are the section it must spend its words on.
  `design-prompt.ts` is separate from `prompt-builder.service.ts`, so the frozen
  review fixtures are untouched.
- **Model output is untrusted.** `normaliseBlueprint()` coerces types, trims and
  caps every string and list, drops entries missing their defining field, and
  rejects a "design" with no components and no failure modes.
- **It degrades to less, never to nothing.** Rate limiting, the 55s budget
  firing, no model answering, or unusable output all produce the deterministic
  `baselineBlueprint()` for the brief's scale. It is labelled as a baseline, with
  a notice saying which of those happened. This matches the review pipeline's
  rule that a completed review with the raw text beats a failed job.
- **The readiness checklist is never generated.** `readinessChecklist()` is a
  pure function of scale and priorities, so it is the part of every blueprint
  that is the same every time and true every time.
- **Inline, not on the review queue.** The queue runs at concurrency 1 to fit in
  512MB, so a design waiting behind three reviews would take minutes. The cost is
  bounded instead: `AbortSignal.timeout(55s)` cancels the Groq fetch rather than
  abandoning it, and a per-user limit of 10 per hour applies, checked in Redis
  *before* the model is called. The 429 body is exactly `Too Many Attempts.`
- **Why a service-level limit, not `@Throttle`:** the global `RateLimitGuard`
  runs before the per-controller auth guards, so `request.user` is not set yet
  and it buckets by IP. Every web request leaves from the Next.js server's one
  IP, so a `@Throttle` limit would be shared by all users.

**Storage is Redis, 30 days, not Postgres.** A new table means hand-applied DDL
against a production schema this codebase does not own the history of (the same
open question as TODOS item 1). A blueprint is a working document whose durable
copy is the Markdown committed to the repo, and the UI says so. The owner id is
stored *beside* the blueprint, never in it, and a missing, expired, malformed or
foreign id all return one identical 404. If blueprints need to outlive 30 days,
the stored shape is already the row.

## What was verified, and how

- `prism-api`: 325 tests (66 new) and `typecheck`. `prism-web`: `typecheck` and
  `next build`.
- Booted against a real Postgres 16 and Redis (`noeviction`) per
  `LOCAL-VERIFICATION.md`: every new route mapped and the DI graph resolved;
  401/422/404/403/502/429 bodies; cross-user isolation on designs and risk; the
  30-day TTL; `design_created` audit rows; runner-cache reuse; the 11th design in
  an hour refused.
- The UI was driven with Playwright: generate → redirect → download → the
  checklist persisting across reload, the risk panel on a PR, and no horizontal
  overflow at 390px on the new pages or the existing ones.
- MCP: `tools/list` over stdio returns all nine tools.

**Not verified:** a live Groq design. The sandbox's egress policy blocks
`api.groq.com`, so only the fallback path ran end to end. The normaliser is
tested against malformed and oversized output, but the first real run against
`llama-3.3-70b-versatile` should be read by a person before this is announced.

## Follow-ups worth doing

1. **Measure the design prompt.** Run 20 briefs across all four scales and read
   the output for over-engineering and for failure modes that are only generic
   ("add monitoring"). Tighten the prompt from evidence, as TODOS item 3 does
   for reviews.
2. **Feed the blueprint into reviews.** A repository could link a design, and
   the review prompt could check a PR against its stated SLOs and failure-mode
   mitigations: design drift detection.
3. **Risk calibration from outcomes.** Once reverts or incident-linked PRs are
   recorded, fit the signal weights to them instead of to judgement.
4. **Persist risk on the review row** when the next DDL window opens, so the
   dashboard can trend risk per repository without refetching diffs.
