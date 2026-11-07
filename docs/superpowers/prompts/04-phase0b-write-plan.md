# Session prompt: write the Phase 0b implementation plan (batched full review)

You are a senior engineer on PRism (AI code reviewer for GitHub). You start with no memory of earlier conversation. **Your deliverable is a plan document, not code.** A different fresh session will execute it, so it must stand alone.

## Read first
1. `E:\prism\CLAUDE.md` (repo rules; they bind the plan you write).
2. **`docs/superpowers/spikes/2026-11-08-batching-spike.md`**: measured facts, the recommended design and "Inputs for the Phase 0b implementation plan". This is your spec. Defaults chosen by the owner: **use the spike's defaults** (16,000-character batches, cap 8, partial-label overflow, derived budget, per-batch checkpoint, pacing), all as named constants/config so they can be retuned after a live Groq measurement.
3. `docs/superpowers/plans/2026-11-07-google-review-roadmap.md` (Phase 0 / 0b section and constraints) and `docs/superpowers/plans/2026-11-07-phase0-honest-coverage.md` (what 0a already built: `coverageRatio`, `partial` verdict, `PARTIAL_REVIEW`, `scoreFor`).
4. `docs/superpowers/plans/2026-11-07-track-b-own-api-key.md` (a user may have their own provider key: batching must work with it, and personal keys have different rate limits).
5. Code, by range (use `docs/code-map.md`, don't explore): `prism-api/src/diff/{prepare,file-selection,hunk-index,render}.ts`, `prism-api/src/modules/review/{pr-review.runner,commit-review.runner,review.queue,review.processor}.ts`, `prism-api/src/ai/{ai-client.service,issue-validator,fixes.service,verdict}.ts`, `prism-api/src/modules/review/review-summary.ts`, `prism-api/scripts/measure-batching.ts` (its pure packer is the prototype to productionise), `docs/review-pipeline.md`, `docs/adr/0003-*.md`, `docs/adr/0006-*.md`, `docs/known-issues.md` (T13).

## Git
You are in a shared checkout. Create branch `phase0b-batching` from `spike-phase0b-batching` (it contains 0a and Track B, which the work builds on). Commit only the plan file (and, if you add one, an ADR draft) with a message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push, merge or PR. Never load the root `.env`.

## How to write it
Use the `superpowers:writing-plans` skill and follow its format exactly: header with the agentic-workers line, Goal, Architecture, Tech Stack, **Global Constraints** (copy the repo's binding rules verbatim where they apply), a File Structure table, then right-sized tasks, each with Files, Interfaces (Consumes/Produces with exact signatures), and bite-sized TDD steps with complete code, exact commands and expected output. No placeholders. Save to `docs/superpowers/plans/2026-11-08-phase0b-batched-review.md`.

The plan must solve these, each with an explicit decision and test (you decide; justify in the plan):
1. **Pure packer** in `prism-api/src/diff/` (productionise the spike's prototype): file order, greedy fit, per-hunk split, line-boundary split of a giant hunk, noise exclusion, cap with the overflow reported through the existing 0a `Selection`/`coverageRatio` mechanism, ordering by Risk Radar when over the cap. Constants in one config module (`BATCH_CHARS=16000`, `MAX_BATCHES=8`, pacing values).
2. **Anchors across batches.** Today `prepareDiff` renders one selection with anchor ids that `validateLayers` resolves. Decide how ids stay unique/resolvable per batch (per-batch maps vs global numbering) so validation stays exactly as strict (ADR 0006). System prompt and golden fixtures are frozen: batch framing goes in the user message only.
3. **Running batches in both runners** (`pr-review.runner.ts` and `commit-review.runner.ts` stay near-parallel; share the logic in one module rather than duplicating) with `signal.throwIfAborted()` before each side effect, safe to repeat.
4. **Merge and dedupe** of findings across batches, severity/order via the existing `orderFindings`, the finding budget, and how the summary and score are produced from several model replies without a new fixed-string contract unless unavoidable (if you add one, update `isIncompleteReview`-style recognisers together).
5. **Checkpointing so a BullMQ retry resumes** instead of repeating paid calls: choose the store (Redis with TTL is the likely choice; check the rule "Redis data about a user must be erasable" in `CLAUDE.md` and design the erasure-marker and `AccountDataService` purge) and the key; state what happens on a changed head SHA.
6. **Derived job budget** using the spike's formula (`GROQ_TIMEOUT_MS x (N x (M + 1) + 1) + 2 x GITHUB_TIMEOUT_MS + 30 s`, with N = `MAX_BATCHES`), the `review.queue.ts` change and its spec, per-batch deadline, and what the concurrency-1 worker does while a long review runs.
7. **Pacing and rate limits:** a pure, injectable pacer (fake clock in tests) for the per-minute token limit, configurable per provider, behaviour on a 429 mid-review (finish as partial with what exists, never fail the whole review silently), and the known daily-limit issue T13. Personal-key (Track B) providers use their own limits: make the pacer take a profile.
8. **The fixes pass** (`fixes.service.ts`): once for the merged result, with the existing 4000-character limit and unvalidated-line caveat unchanged; say so explicitly.
9. **Honest outcome states:** full coverage -> normal verdict and score; capped or 429-truncated -> 0a partial label with the real coverage sentence. Re-check `composeSummary` and `summary-comment.builder.ts`.
10. **Docs in the same commits:** `docs/review-pipeline.md`, `docs/architecture.md` if it describes the flow, `docs/known-issues.md` (T13 gets worse; quality of batched reviews unmeasured), `docs/code-map.md` rows for new files, an ADR (next free number) for the batching decision and its costs, and the `CLAUDE.md` pipeline rule lines that mention the 8,000-character limit if any.
11. **Verification tasks:** which narrow tests per task; one full gate at the end; a final task that runs part C of the spike (`GROQ_API_KEY_DEV`, at most 15 calls) and retunes the constants, written so the executing session reports "not measured" instead of faking it when no key exists; one local end-to-end review of a many-file diff using a fake AI server if no key.

## Self-review before you finish (mandatory)
Run the writing-plans self-review: spec coverage against the spike's "Inputs" list and the 11 items above (list each with its task number at the end of the plan), placeholder scan, and type/name consistency across tasks. Then check every file path, function name and line range you cite actually exists on this branch (grep it). Fix inline.

## Done means
Plan committed on `phase0b-batching`; `docs/superpowers/PROGRESS.md` row 4 updated to "Plan written, not executed" with a 3 to 5 line note listing the decisions you made and any open question for the owner. Final message: the plan path, task list (titles only), the decisions that need the owner's attention, and anything you could not verify.
