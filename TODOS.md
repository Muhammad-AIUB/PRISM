# TODOS

Deferred work with its reasoning attached. Each item records why it was deferred,
not just what it is, so the decision can be re-made rather than re-discovered.

Seeded 2026-09-14 from `/gstack-plan-eng-review` on
`docs/designs/review-output-trust-and-brevity.md`. Six of the eight original items
have since been built; what remains is below, with the closed ones recorded at the
bottom so the reasoning is not lost.

---

## 1. Separate a per-minute rate limit from a daily one

**What:** Read Groq's `retry-after` header on a 429 and branch on its magnitude
instead of treating every rate limit the same way.

**Why:** An all-models-429 now throws, so BullMQ retries on `[60, 180, 600]`. That
schedule fits a per-minute token limit well. It fits a **daily** limit badly: three
attempts burn in 13 minutes and the review is marked `failed` permanently. Before this
change the same case produced a completed review containing an error blob, which was
uglier but recoverable with Re-analyze. For that specific failure the new behaviour is
a regression, and it was accepted knowingly.

**Pros:** One header read separates the two cases. A long limit could surface as a
clear "rate limited, try later" state instead of a dead review.

**Cons:** Needs a third value in the review status model. Status columns are
`varchar` + CHECK (`schema.sql`), so a new value is hand-applied DDL against
production — the same open question that blocked the `coverage` column.

**Context:** An in-job wait was considered and rejected. The reason recorded at the
time ("the runners' contract is that exceptions propagate") was weak; that contract is
about where terminal cleanup lives. The strong argument, found later, is that the
worker runs at `concurrency: 1`, so a sleeping job blocks every other review behind it.

**Depends on / blocked by:** A decision about who applies CHECK-constraint DDL to
production and what the rollback is.

---

## 2. Verify what GitHub returns for a merge-commit diff

**What:** Call `GET /repos/{owner}/{repo}/commits/{sha}` with
`Accept: application/vnd.github.v3.diff` where `{sha}` is a merge commit, and look at
what comes back.

**Why:** `webhook.service.ts:172-176` reviews the head commit of a push. After a pull
request merges into the default branch, that head commit is a merge commit. If GitHub
returns an empty or combined-format (`@@@`) diff for one, then every post-merge review
produces an empty index, drops every finding, and shows "no issues we could verify" as
its standard output.

**Pros:** One API call settles it. The answer decides whether the parser needs to
handle combined-diff headers at all, which is the single biggest open question about
`hunk-index.ts`.

**Cons:** None. It is a measurement.

**Context:** Raised by an outside reviewer and explicitly NOT verified. An attempt was
made on 2026-09-14 and hit GitHub's unauthenticated rate limit (60/hour, spent by the
measurement harness). It needs a `GITHUB_TOKEN` in the environment. Recorded as a claim
to check, never as a known fact — do not build around it either way until someone runs
the call.

**Depends on / blocked by:** A GitHub token. Nothing else.

---

## 3. Run the model-accuracy arm of the measurement harness

**What:**

```
cd prism-api
GROQ_API_KEY=gsk_... npx ts-node scripts/measure-anchoring.ts \
  --prs scripts/prs.txt --budgets 8000,40000 --schemes raw,lines,anchors --repeats 2
```

**Why:** It is the only thing that can still overturn the anchor decision, and the only
thing that can set the diff budget from evidence rather than from a guess. The coverage
and prompt-overhead halves have already been run (`--dry-run`, no key needed) and are
recorded in the design doc. The model-accuracy half has not.

**Pros:** Decides two open questions at once: whether `llama-3.3-70b-versatile` handles
opaque anchors better or worse than plain line numbers, and what `DIFF_LIMIT` should
actually be. Also the only way to know the real fabrication rate, which is the number
premise 2 was always about.

**Cons:** Costs Groq tokens across 40 runs. Nothing else.

**Context:** Never point this at the production `.env`. Pass the key inline for the one
command.

**Depends on / blocked by:** A Groq API key.

---

## 4. Remove the five-tab layout from both detail views

**What:** Replace the tabbed layout in `ReviewShowView.tsx` and `CommitShowView.tsx`
with the single prioritized list the design doc specified.

**Why:** The verdict panel now sits above the tabs and answers the question at a glance,
so the tabs became the "show all" affordance rather than the primary interface. That
delivers the goal, but it leaves two ways of reading the same data on one page.

**Pros:** One reading order instead of two. `SeverityFilters` would filter across layers
rather than within one, which is what a reader actually wants.

**Cons:** `prism-web` has **zero test files**, so every change to these views is verified
only by typecheck, build and eye. A wholesale rewrite of both is the riskiest possible
way to spend a change on this codebase.

**Context:** The engineering review decided to remove the tabs. That was knowingly
narrowed during implementation to "add the panel above them", and the narrowing is
recorded in the design doc rather than hidden. Worth pairing with the first frontend
test setup this project has ever had.

**Depends on / blocked by:** Ideally a test runner for `prism-web`.

---

## Closed

- **Streaming diff read.** Done. `github-client.service.ts` now reads diffs through
  `readBounded()` with a 2MB ceiling enforced during the read, cutting on a line
  boundary. The earlier plan to cap at the caller would have freed nothing, because
  `await response.text()` had already materialized the whole string.
- **Evaluate opaque anchors.** Done and decided: anchors. The in-place-edit collision
  that makes a "prefer added" tiebreak unsafe is a passing test in
  `hunk-index.spec.ts`, and the prompt-overhead measurement favoured anchors roughly
  two to one. The harness (item 3) can still overturn it on accuracy.
- **Score computed from unvalidated output.** Done. `reconcileScore()` pulls
  `overall_score` into agreement with the verdict using the bands the prompt itself
  defines, so the page cannot show BLOCKING above 88/100.
- **Oversized file skipped at every budget.** Done. `selectForReview()` falls back to
  whole hunks, then to a line boundary, so a file larger than the budget is reviewed in
  part instead of dropped. Found by the harness on `microsoft/TypeScript#64245`.
- **Phase 2 of the design.** Done: prompt rewritten with intent rules and an explicit
  anti-lint instruction, all 26 fixtures regenerated, verdict and worst-first ordering,
  findings in the GitHub comment, verdict panel on both detail pages.
