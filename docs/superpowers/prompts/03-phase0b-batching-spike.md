# Session prompt: Phase 0b spike, can PRism review every file by batching?

You are a senior engineer on PRism (AI code reviewer for GitHub). You start with no memory of earlier conversation. This is a **measurement task, not a feature**: you ship a script and a written report, and you change no product code.

## Why
The owner requires that every PR and commit is reviewed in full. Today one model call sees about 8,000 characters (`DIFF_LIMIT` in `prism-api/src/modules/review/pr-review.runner.ts` and `commit-review.runner.ts`); `prism-api/src/diff/file-selection.ts` picks whole files or hunks until the budget is spent and reports the rest as skipped or partial (Phase 0a then labels such reviews "partial"). The proposed fix, "Phase 0b", splits the reviewable files into batches, reviews each batch with its own model call, and merges the results. Before anyone designs it, we need numbers.

## Read first
1. `E:\prism\CLAUDE.md` (rules; never load the root `.env`; no CI; cheapest check first).
2. `docs/superpowers/plans/2026-11-07-google-review-roadmap.md`, section "Phase 0" (0b), for the questions this spike must answer.
3. Code you will reuse, read ranges not whole files: `prism-api/src/diff/file-selection.ts`, `prism-api/src/diff/prepare.ts`, `prism-api/src/diff/hunk-index.ts`, `prism-api/scripts/measure-anchoring.ts` (the existing measuring script and how it fetches real PRs), `prism-api/src/modules/review/review.queue.ts` (derived job budget, worker settings), `prism-api/src/ai/ai-client.service.ts` (timeouts, models, rate-limit handling), `docs/adr/0003-derive-the-job-budget-and-cancel-on-deadline.md`, `docs/adr/0007-groq-is-the-only-ai-provider.md` (free-tier quota, known issue T13 in `docs/known-issues.md`).

## Git
You are in a shared checkout on branch `track-b-own-api-key`. Create branch `spike-phase0b-batching` from it. Commit only: the script under `prism-api/scripts/` and the report. Stage by name. No push, merge or PR. Commit message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## What to measure

**A. Offline, no model calls (always do this).** Build a sample of at least 30 real diffs: public GitHub pull requests and commits of varied size from well-known repositories (a mix: small, typical, large, one lockfile-heavy, one very large like `microsoft/TypeScript#64245` named in `file-selection.spec.ts`). Fetch the `.diff` unauthenticated from public URLs (mind GitHub's 60 requests/hour; cache raw diffs under the scratchpad directory, not the repo). For each diff compute, using the real `selectForReview`/`prepareDiff` code (import it; do not reimplement):
- changed files, noise files, reviewable files, total reviewable characters;
- today's coverage at the 8,000 budget (`coverageRatio` from Phase 0a);
- the number of batches a simple greedy packer would need at several batch budgets (8,000 / 16,000 / 24,000 characters), where an over-budget file is split by hunk exactly as `partialFile` does; report p50/p90/p99 and max batches;
- how many diffs need more than 4, 8 and 16 batches.
Prototype the packer inside the script only (a pure function). Also prototype the "files that import each other go in the same batch" idea cheaply (TS/JS `import ... from './x'` relative imports only) and report how often it changes batch assignment and how often a cross-file pair is split by plain greedy packing.

**B. Capacity arithmetic (always do this).** From the code, not from memory: `GROQ_TIMEOUT_MS`, `GROQ_MODELS`, the derived `REVIEW_JOB_TIMEOUT_MS`, worker concurrency and memory notes. Compute how many sequential batch calls fit in the current job budget at worst case and at a realistic per-call latency; say what the budget formula would have to become for N batches and whether the retry/backoff schedule still makes sense. Note Groq's free-tier limits from `docs/` and from Groq's official docs page if reachable; label every figure as measured, from code, or from documentation.

**C. Live Groq, only if a key is provided.** Look for an environment variable named `GROQ_API_KEY_DEV` in the shell. If it is NOT set, skip this part, write "not measured: no development key" in the report, and do not look for any other key. Never read the repo-root `.env`. If set: run at most 15 real batch calls on 3 to 5 of the sampled diffs with the existing system prompt via the existing client path, and record latency per call, tokens, 429s, and whether the parsed result is valid JSON. Respect rate limits; stop at the first sustained 429.

**D. Quality risk, qualitative.** From the sampled diffs list concrete examples where a cross-file relationship would be split across batches (e.g. a changed function signature in one file and its caller in another) and say how the import-grouping heuristic or a short cross-batch summary would or would not help. Do not claim review quality was measured.

## Deliverables
1. `prism-api/scripts/measure-batching.ts`: runnable with a documented command, writes a JSON results file to the scratchpad and prints the summary table. Keep it dependency-free beyond what the repo already has.
2. `docs/superpowers/spikes/2026-11-08-batching-spike.md`: the report. Sections: question, method, sample (list the PRs), results tables (A), capacity (B), live results or "not measured" (C), cross-file risk (D), **recommendation** (is batched full review feasible on the current free-tier setup; at which batch budget; what the job budget formula should become; what must be built; what is still unknown), and a short **inputs for the Phase 0b implementation plan** list. Separate measured facts from estimates in every table.
3. Update `docs/superpowers/PROGRESS.md`: row 2 status plus a 3 to 6 line note.

## Hard rules
- Do not edit anything under `prism-api/src/` or `prism-web/src/`. If you think product code must change, put it in the report's recommendations.
- Never load the repo-root `.env`; never print or write any API key.
- Do not claim a number you did not compute. If a fetch or call failed, say so and say what that does to the conclusion.
- Verify the script with `npm run typecheck` (and lint) in `prism-api/` before the commit; scripts in `scripts/` may be outside the typecheck, in which case run it once with the project's TS runner and show the output.

## Done means
Report and script committed on `spike-phase0b-batching`; the final message states the recommendation in one paragraph, the headline numbers (p50/p90/max batches at each budget, and what share of real diffs exceed 8 batches), what was and was not measured (explicitly whether live Groq was run), and anything surprising.
