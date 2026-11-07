# Phase 0b: Batched Full Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Review every reviewable file of every PR and commit, by splitting the change into 16,000-character batches (cap 8), one model call each, and merging the results, so that "partial" becomes the failure fallback instead of the normal case for big changes.

**Architecture:** A pure packer (`diff/batch-pack.ts`) turns the diff into batches. One new service (`BatchedReviewService`) runs them for **both** runners: per-batch anchors and validation, a token pacer, a per-batch checkpoint in Redis so a BullMQ retry resumes, a pure merge, and a `Selection` built from the batches that actually completed so the Phase 0a coverage mechanism (`coverageRatio`, `PARTIAL_REVIEW`, `scoreFor`) reports the truth. The job budget is derived from the batch cap.

**Tech Stack:** NestJS 11, TypeScript, Jest (ts-jest), ioredis (Lua script), BullMQ. No new dependency, no schema change, no new env variable, no new API field.

**Branch:** `phase0b-batching` (cut from `spike-phase0b-batching`, which contains Phase 0a and Track B). Spec: [the batching spike](../spikes/2026-11-08-batching-spike.md), "Inputs for the Phase 0b implementation plan". The owner chose to **use the spike's defaults** (16,000 characters, cap 8, partial-label overflow, derived budget, per-batch checkpoint, pacing), all as named constants so a live Groq measurement can retune them (Task 12).

**How the code in this plan was produced.** The author wrote every new file below and ran its tests (`tsc --noEmit` clean; the narrow suites for `src/diff`, `src/ai`, `src/modules/review/` and `src/modules/account` passed, 360 tests; then, with every file applied together, `npm run typecheck`, `npm run lint` (`--max-warnings 0`) and the **full** `npm test` were clean: 61 suites, 642 tests; the Lua script was run against a local Redis) and then reverted the working tree, so this plan is the only copy. Treat the code blocks as the intended content; if a test turns out to be wrong rather than the implementation, fix the test and say so in the commit.

## Global Constraints

Copied from `CLAUDE.md` and the repo docs; every task includes them.

- **Don't explore; trust the code map.** Open only the files a task names. Cheapest check first: `npm run typecheck` while editing (api about 5 s); one narrow `npm test -- <path fragment>` when logic changed; **full suite, lint and the stack boot once, in Task 11**. Never re-run a green check. Use `git diff` to see your change; don't re-read files you just wrote.
- **There is no CI.** You are the gate: typecheck, lint and test in every package you touch before each commit. In `prism-api`, `no-floating-promises` and `no-misused-promises` are errors; fix the finding, or disable with the reason on the same line. `npm run test:e2e` always fails (no `test/jest-e2e.json`); ignore it.
- Run commands from inside the package (`prism-api/`, Node >= 20.11). Run the API from `prism-api/`, **on port 3999**. **The `.env` in the repo root holds production credentials: never load or point anything at it**, and check connection strings say `127.0.0.1`. Redis must be `maxmemory-policy noeviction`. Local setup: `docs/development.md`.
- **Never load the root `.env`.** The live measurement (Task 12) reads `GROQ_API_KEY_DEV` from the shell and nothing else.
- `synchronize: false` and `migrationsRun: false`, forever. DDL is hand-applied from `schema.sql`. **This plan adds no DDL.**
- Status columns are `varchar`, never enums. `bigint` ids serialise as JSON numbers. Timestamps go through `common/utils/iso8601.ts`, never `toISOString()`.
- `esModuleInterop` is off: use `import x = require('x')` for CommonJS. (The code below uses `node:crypto` named imports and `ioredis` exactly as existing files do.)
- Error bodies are contracts: 422 `{message, errors}`; 401 exactly `Unauthenticated.`; 429 exactly `Too Many Attempts.`. `/api/v1` is additive-only. **No API shape changes in this plan.**
- **Golden fixtures in `prism-api/test/fixtures/` are frozen. The system prompt is frozen.** Batch framing goes in the **user** message only.
- `pr-review.runner.ts` and `commit-review.runner.ts` are near-parallel. Change both (this plan puts the shared logic in one service so they cannot drift).
- Runners throw so BullMQ retries; terminal cleanup lives in the processor's `failed` handler.
- The deadline **cancels**: the `AbortSignal` reaches every `fetch`, and a runner calls `signal.throwIfAborted()` before each side effect (persist, GitHub comment). New side effects must be safe to repeat. The job budget is **derived** in `review.queue.ts`; never hard-code it.
- Notification failures never fail a review. Worker `concurrency: 1` (512 MB).
- No usable model output **completes** the review as `not_reviewed`, behind two fixed summary strings in `ai/verdict.ts` that `isIncompleteReview()` recognises. Change both or neither. Under half coverage the score is `null` and the summary leads with `PARTIAL_REVIEW`, recognised by `isPartialReview()` (ADR 0011); reword the pair together. **This plan adds no new fixed string.**
- Groq is the default and the fallback; a user may add their own provider API key (ADR 0012): encrypted, last 4 characters only, never logged, fixed provider URLs. The Groq model list is **not re-measured** (ADR 0007). Order and temperature are measured: don't change them.
- Findings are validated against the anchors the model was shown; the **anchor's** location is displayed.
- Risk Radar is pure and `tryAssessRisk()` never throws.
- **Redis data about a user must be erasable: write through the erasure-marker script and purge it in `AccountDataService`.** (Task 5 does both for the new checkpoint store.)
- Log with Nest's `Logger`, never `console.*`.
- **Docs are part of the change.** Update the owning doc in the same commit. Don't hard-code counts or line numbers in prose. If you add, rename or delete a file the code map lists, update the map. A surprising, data-constrained or hard-to-reverse choice gets an ADR (Task 10: ADR 0013).
- Commits: one logical change, imperative subject, body says **why**. **Stage files by name.** Never commit `.env`, `dist/`, `.next/` or `node_modules/`. Nothing is pushed, merged or opened as a PR by this plan.
- **Shared checkout.** Other sessions may be editing here. Never `git stash`, reset or switch branches. Commit only the files your task names.

---

## Decisions

Each decision was made by the plan's author from the spike and the code; the number is the item in the owner's brief. "Test" names where it is pinned.

| # | Decision | Why | Test |
|---|---|---|---|
| 1 Packer | Pure `packForReview(diff, {batchChars, maxBatches}, rank?)` in `diff/batch-pack.ts`. Files stay in diff order; greedy sequential fit (the spike's measured packer); a file over the budget is cut into header + whole hunks; a hunk over the room is cut at **line boundaries** and **every cut piece gets its own synthetic `@@ -a,b +c,d @@` header with the true starting line numbers**. Noise is excluded exactly as `selectForReview` does (`NOISE` is now exported). Over the cap, files are re-sorted by Risk Radar weight (`diff/risk-rank.ts`) and the lowest-ranked fall off. A diff with nothing reviewable still yields one empty batch, so the caller still makes its one call as today. The spike's prototype only counted batches; without the synthetic header a later piece of a giant hunk has no `@@` line and `buildHunkIndex` would index none of it. | Anchors must resolve to true lines (ADR 0006). | Task 1 |
| 1b Overflow | The cap's overflow is reported through the **existing** `Selection` / `coverageRatio` / `coverageSentence` / `scoreFor` path. `selectionFor(packed, completedIndexes)` builds the `Selection` from the batches that **completed**, so a batch that timed out or never ran lowers coverage exactly like a file dropped by the old byte budget. A file with only some pieces reviewed is `partial` (counts as half). | One honesty mechanism, already pinned by the 0a tests. | Tasks 1, 6, 7 |
| 1c Constants | One module, `modules/review/batching.config.ts`: `BATCH_CONFIG` (16,000 / 8), `MAX_MERGED_FINDINGS` (40), `CHECKPOINT_VERSION`, `CHECKPOINT_TTL_SECONDS`, `GROQ_FREE_PACE`, `OWN_KEY_PACE`, `BATCH_WORST_CASE_MS`, `jobBudgetMs()`. | Retune after a live run without touching logic. | Task 3 |
| 2 Anchors | **Per-batch numbering, per-batch maps.** `prepareBatch(text)` renders each batch with ids starting at 1 and returns that batch's `Map<number, Anchor>`; `validateLayers` is called with **that batch's map only**. A finding is accepted only if it names an anchor shown in the same call, which is exactly as strict as ADR 0006 and stricter than a global map would be (an id cited from another batch is unknown, so it is dropped, not mis-attributed). Global numbering was rejected: it would let a hallucinated id resolve to a file in a different call. `validateLayers`, `issue-validator.ts` and the frozen prompt are unchanged. | Zero change to the validator or fixtures. | Tasks 4, 6 (`rejects an anchor id that only exists in another batch`) |
| 3 Running batches | `BatchedReviewService.review()` is the only place that loops over batches. Both runners call it and then do their own persistence, comment, notification. The service checks `signal.throwIfAborted()` before every paced call and before every checkpoint save; both are safe to repeat (same field written again). | Near-parallel runners stay in step by construction. | Tasks 6, 7, 8 |
| 4 Merge | `mergeBatchResults()` (pure): de-duplicate on `file|side|line|category` walking layers in the order security, performance, code_quality (so a security report wins); order with the existing `orderFindings`; cut to `MAX_MERGED_FINDINGS`. **Summary:** one batch keeps the model's summary verbatim; several give `Part N: <summary clipped to 400 characters>` lines, plus a plain note when findings were cut. **Score:** the lowest batch score, then the existing `scoreFor` reconciliation. No new fixed string, so no recogniser changes. | The summary is the model's words, labelled; nothing for `isIncompleteReview` to learn. | Task 4 |
| 5 Checkpoint | **Redis hash with a 2 h TTL**, key `review-batches:{ownerId}:{pr\|commit}:{id}`, fields `fp`, `b0`, `b1`... Each validated batch is saved before the next call. `fp` = sha256 of (`CHECKPOINT_VERSION`, batch size, cap, diff) so **a changed head SHA (a different diff) or retuned settings never resumes**: `load` ignores a hash with another fingerprint and the next `save` replaces it atomically in Lua. Saves go through the **erasure-marker script**; `AccountDataService` calls `purgeOwner` (SCAN on the owner prefix). The runners clear the hash when the review finishes, so a re-analyze starts fresh. A failed Redis never fails a review. | Redis, not a column: no DDL. | Task 5 (and a one-off run of the Lua against local Redis) |
| 6 Budget | `REVIEW_JOB_TIMEOUT_MS = jobBudgetMs(MAX_BATCHES) = MAX_BATCHES x (GROQ_TIMEOUT_MS x (models + 1) + PACE_MAX_WAIT) + GROQ_TIMEOUT_MS + 2 x GITHUB_TIMEOUT_MS + 30 s`. That is the spike's formula **plus one pacing wait per batch** (the spike's formula leaves out time spent waiting for the token allowance, which is inside the job): 8 x (180 + 60) + 60 + 60 + 30 = **2,070 s = 34.5 min** at the defaults (the spike's formula alone gives 26.5 min). Each batch also has its own deadline, `BATCH_WORST_CASE_MS`, combined with the job signal, so one hung batch cannot spend the budget of the others; a batch that times out is skipped and lowers coverage. `reviewBackoffStrategy` is unchanged: `[60,180,600]`, and the 600 s step is still never reached with 3 attempts. **The concurrency-1 worker is blocked for the whole review.** A one-batch review (the median) still takes seconds, and the 34.5 min is a ceiling that holds only if every call hangs; this cost is stated in ADR 0013 and flagged for the owner. `ERASURE_MARKER_TTL_SECONDS` rises to 2 h so the marker still outlasts two attempts (a test pins it). | The budget must follow the cap, never be typed in. | Tasks 3, 9 |
| 7 Pacing / 429 | Pure `TokenPacer` (`ai/token-pacer.ts`), injectable clock, sliding 60 s window, `acquire(tokens)` waits at most `maxWaitMs` and then lets the provider decide. `PaceProfile` is a parameter: `GROQ_FREE_PACE` = 8,000 tokens/min; `OWN_KEY_PACE` (a Track B user's provider) = **unpaced**, because their limits are unknown and usually far higher (Gemini/OpenAI keys). The profile is chosen once per review from `UserAiSettingsService.resolve(ownerId)`. **A 429 that outlasts the model chain** (`RateLimitedError`): if at least one batch finished, **stop and finish with what exists** (coverage falls, the 0a label applies below 50%); if none finished, **rethrow** so BullMQ's backoff retries exactly as today (known issue T13 is therefore *unchanged* for a first-batch daily limit, and a daily limit hitting mid-review now ends partial instead of failing). | Never fail a whole review silently, never loop on a dead quota. | Tasks 2, 6 |
| 8 Fixes pass | **Once, for the merged result**, `FixesService.generate(merged.lastModel, layers, outcome.selection.text, ...)`, then `validateFixes` against the merged hunk index (`mergeHunkIndexes`). **`FixesService` and `buildFixesPrompt` are not touched: the 4,000-character diff limit and the unvalidated-line caveat (a fix quotes code from the first 4,000 characters of the selected text) are unchanged.** Consequence, stated honestly: with batching the findings can sit anywhere in a much larger selection while the fixes prompt still sees only its first 4,000 characters, so fixes for later files are more often dropped by `validateFixes`. Documented in known-issues; not fixed here. | Scope. | Task 7 (call args) |
| 9 Outcome states | Full coverage: normal verdict and score, no coverage sentence. Capped, or truncated by a 429, or a batch skipped: the coverage sentence ("Reviewed 3 of 5 changed files.") always appears; under `MIN_COVERAGE = 0.5` the 0a label leads and the score is `null`. **`MIN_COVERAGE` stays 0.5 (owner question, see end).** No batch usable: `not_reviewed` via `incompleteReviewSummary`, as today. `composeSummary`, `summary-comment.builder.ts` and `verdictForReview` need **no change** (re-read: the builder takes the already-composed summary and shows its own "PARTIAL REVIEW" badge from `verdictForReview`). | Reuse, not reinvent. | Tasks 6, 7, 8 |
| 10 Docs | Task 10: `review-pipeline.md` (sections 2, 4, 8), `architecture.md` (limits table), `configuration.md`, `README.md` bullet, `known-issues.md`, `code-map.md`, `CLAUDE.md` (one pipeline rule), ADR 0013 + ADR index. `CLAUDE.md` does not mention the 8,000 limit today. | Docs are part of the change. | Task 10 |
| 11 Verification | Narrow test per task; one full gate + stack boot in Task 11; the in-process end-to-end review of a many-file diff is the `commit-review.runner.spec.ts` / `pr-review.runner.spec.ts` many-batch tests (Groq's URL is fixed in code, so a fake HTTP AI server would need a code seam; the in-process fake `AiClientService` exercises the real packer, service, merge, pacer and runner); Task 12 is the conditional live measurement. | See Task 11/12. | Tasks 11, 12 |

**Not built, on purpose (YAGNI):** import grouping (changed 3 of 70 assignments in the spike); a cross-batch summary in each call (untested; a separate quality experiment); resuming a `failed` batch within one attempt; any new table or env variable; removing `prepareDiff` (still tested; no longer called by the runners, listed in known-issues as cleanup).

---

## File Structure

| Path | Create / Modify | Responsibility |
|---|---|---|
| `prism-api/src/diff/batch-pack.ts` (+ `.spec.ts`) | Create | Pure packer: `packForReview`, `splitFile`, `cutHunk`, `selectionFor` |
| `prism-api/src/diff/risk-rank.ts` (+ `.spec.ts`) | Create | `riskRankOf(RiskAssessment \| null)` for ordering past the cap |
| `prism-api/src/diff/file-selection.ts` | Modify | Export `NOISE` (one regex, two users) |
| `prism-api/src/diff/hunk-index.ts` (+ spec) | Modify | `mergeHunkIndexes` |
| `prism-api/src/diff/prepare.ts` (+ spec) | Modify | `prepareBatch`, export `coverageSentence` |
| `prism-api/src/ai/token-pacer.ts` (+ `.spec.ts`) | Create | `PaceProfile`, `TokenPacer`, `systemClock` |
| `prism-api/src/ai/batch-merge.ts` (+ `.spec.ts`) | Create | `BatchResult`, `mergeBatchResults` |
| `prism-api/src/modules/review/batching.config.ts` (+ spec) | Create | Every batching constant, `jobBudgetMs` |
| `prism-api/src/modules/review/review-checkpoint.store.ts` (+ spec), `review-checkpoint.module.ts` | Create | Redis checkpoint, erasure-safe |
| `prism-api/src/modules/review/batched-review.service.ts` (+ spec), `batched-review.testing.ts` | Create | The loop both runners call; shared test doubles |
| `prism-api/src/modules/review/pr-review.runner.ts` (+ spec) | Modify | Use the service |
| `prism-api/src/modules/review/commit-review.runner.ts` | Modify | Use the service |
| `prism-api/src/modules/review/commit-review.runner.spec.ts` | Create | First spec for the commit runner |
| `prism-api/src/modules/review/review.module.ts` | Modify | Provide the service, import the checkpoint module |
| `prism-api/src/modules/review/review.queue.ts` (+ spec) | Modify | Budget from `jobBudgetMs` |
| `prism-api/src/modules/account/*` | Modify | Purge checkpoints on erasure; marker TTL 2 h |
| `docs/...`, `CLAUDE.md`, ADR 0013 | Modify / Create | Task 10 |
| `prism-api/scripts/measure-batching-live.ts` | Create (Task 12, conditional) | Part C of the spike |

---

### Task 1: The pure packer and the risk rank

**Files:**
- Create: `prism-api/src/diff/batch-pack.ts`, `prism-api/src/diff/batch-pack.spec.ts`, `prism-api/src/diff/risk-rank.ts`, `prism-api/src/diff/risk-rank.spec.ts`
- Modify: `prism-api/src/diff/file-selection.ts` (export `NOISE`)

**Interfaces:**
- Consumes: `parseGitHeader` (`diff/git-paths.ts`), `Selection` and `NOISE` (`diff/file-selection.ts`), `RiskAssessment` (`diff/risk-radar.ts`).
- Produces:
  - `interface BatchConfig { batchChars: number; maxBatches: number }`, `type RiskRank = (path: string) => number`
  - `interface ReviewBatch { index: number; text: string; files: string[]; pieces: BatchPiece[] }`, `interface PackedReview { batches: ReviewBatch[]; order: string[]; pieceTotals: Map<string, number>; noise: string[]; unfit: string[]; totalFiles: number }`
  - `packForReview(diff: string, config: BatchConfig, rank?: RiskRank): PackedReview` (always at least one batch)
  - `selectionFor(packed: PackedReview, completed: ReadonlySet<number>): Selection`
  - `splitFile(body: string, budget: number): string[] | null`, `cutHunk(hunk: string, room: number): string[]`
  - `riskRankOf(risk: RiskAssessment | null): RiskRank`

- [x] **Step 1: Write the failing tests**

Create `prism-api/src/diff/batch-pack.spec.ts`:

```ts
import { coverageRatio } from './file-selection';
import { packForReview, selectionFor, splitFile } from './batch-pack';
import { buildHunkIndex } from './hunk-index';
import { renderWithAnchors } from './render';

const header = (name: string): string => `diff --git a/${name} b/${name}\n--- a/${name}\n+++ b/${name}\n`;

/** One hunk: a context line, a removed line, then `added` added lines, then a context line. */
const file = (name: string, added: number): string =>
  header(name) +
  `@@ -1,2 +1,${added + 2} @@\n ctx1\n-old\n` +
  Array.from({ length: added }, (_, i) => `+line ${i}`).join('\n') +
  '\n ctx2\n';

const CONFIG = { batchChars: 16_000, maxBatches: 8 };

describe('packForReview', () => {
  it('keeps a small change in one batch and leaves noise out of it', () => {
    const diff = file('a.ts', 10) + file('b.ts', 10) + 'diff --git a/x.png b/x.png\nBinary files differ\n';
    const packed = packForReview(diff, CONFIG);

    expect(packed.batches).toHaveLength(1);
    expect(packed.batches[0]?.files).toEqual(['a.ts', 'b.ts']);
    expect(packed.noise).toEqual(['x.png']);
    expect(coverageRatio(selectionFor(packed, new Set([0])))).toBe(1);
  });

  it('opens a new batch when the next file does not fit, in diff order', () => {
    const packed = packForReview(file('a.ts', 200) + file('b.ts', 200) + file('c.ts', 200), {
      batchChars: 3000,
      maxBatches: 8,
    });

    expect(packed.batches.map((b) => b.files)).toEqual([['a.ts'], ['b.ts'], ['c.ts']]);
  });

  it('cuts an oversized file into hunks and a giant hunk at line boundaries, keeping real line numbers', () => {
    const packed = packForReview(file('big.ts', 1500), { batchChars: 4000, maxBatches: 8 });

    expect(packed.batches.length).toBeGreaterThan(3);

    const seen = new Set<number>();
    let added = 0;

    for (const batch of packed.batches) {
      expect(batch.text.length).toBeLessThanOrEqual(4000);

      const hunks = buildHunkIndex(batch.text).get('big.ts');

      for (const line of hunks?.added.keys() ?? []) {
        expect(seen.has(line)).toBe(false);
        seen.add(line);
      }

      added += hunks?.added.size ?? 0;
    }

    expect(added).toBe(1500);
    // "ctx1" is new-side line 1, so "+line 0" is line 2 and "+line 1499" is line 1501.
    expect(Math.max(...seen)).toBe(1501);
  });

  it('gives a later piece anchors that resolve to the true line of the file', () => {
    const packed = packForReview(file('big.ts', 1500), { batchChars: 4000, maxBatches: 8 });
    const second = renderWithAnchors(buildHunkIndex(packed.batches[1]?.text ?? ''));
    const first = second.anchors.get(1);

    expect(first?.file).toBe('big.ts');
    expect(first?.text).toBe(`line ${(first?.line ?? 0) - 2}`);
  });

  it('cuts a single line longer than a batch rather than emitting an oversized batch', () => {
    const long = `${header('min.ts')}@@ -1,1 +1,2 @@\n ctx\n+${'x'.repeat(9000)}\n`;
    const packed = packForReview(long, { batchChars: 2000, maxBatches: 8 });

    expect(packed.batches.every((b) => b.text.length <= 2000)).toBe(true);
    expect(packed.batches.map((b) => b.text).join('')).toContain('[line cut]');
  });

  it('reports a file whose header alone cannot fit as unfit, not as noise', () => {
    const packed = packForReview(file('a.ts', 400), { batchChars: 100, maxBatches: 8 });

    expect(packed.unfit).toEqual(['a.ts']);
    expect(packed.noise).toEqual([]);
  });

  it('caps the batches and reports the overflow through the coverage ratio', () => {
    const diff = ['a', 'b', 'c', 'd', 'e'].map((n) => file(`${n}.ts`, 200)).join('');
    const packed = packForReview(diff, { batchChars: 3000, maxBatches: 3 });
    const selection = selectionFor(packed, new Set([0, 1, 2]));

    expect(packed.batches).toHaveLength(3);
    expect(selection.files).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(selection.skipped).toEqual(['d.ts', 'e.ts']);
    expect(coverageRatio(selection)).toBeCloseTo(0.6);
  });

  it('keeps the riskiest files when over the cap, in risk order then diff order', () => {
    const diff = ['a', 'b', 'c', 'd', 'e'].map((n) => file(`${n}.ts`, 200)).join('');
    const rank = (path: string): number => (path === 'e.ts' ? 10 : path === 'd.ts' ? 5 : 0);
    const packed = packForReview(diff, { batchChars: 3000, maxBatches: 3 }, rank);

    expect(packed.batches.map((b) => b.files)).toEqual([['e.ts'], ['d.ts'], ['a.ts']]);
  });

  it('does not reorder when everything fits, whatever the rank says', () => {
    const packed = packForReview(file('a.ts', 5) + file('b.ts', 5), CONFIG, (p) => (p === 'b.ts' ? 9 : 0));

    expect(packed.batches[0]?.files).toEqual(['a.ts', 'b.ts']);
  });

  it('counts a file with only some of its pieces reviewed as partial', () => {
    const packed = packForReview(file('big.ts', 1500), { batchChars: 4000, maxBatches: 2 });
    const selection = selectionFor(packed, new Set([0, 1]));

    expect(selection.files).toEqual(['big.ts']);
    expect(selection.partial).toEqual(['big.ts']);
    expect(coverageRatio(selection)).toBe(0.5);
  });

  it('treats a batch that never completed as not reviewed', () => {
    const packed = packForReview(file('a.ts', 200) + file('b.ts', 200), { batchChars: 3000, maxBatches: 8 });
    const selection = selectionFor(packed, new Set([1]));

    expect(selection.files).toEqual(['b.ts']);
    expect(selection.skipped).toEqual(['a.ts']);
  });

  it('yields one empty batch for a diff with nothing to review, so the caller still makes its one call', () => {
    const packed = packForReview('diff --git a/x.png b/x.png\nBinary files differ\n', CONFIG);

    expect(packed.batches).toHaveLength(1);
    expect(packed.batches[0]?.text).toBe('');
    expect(coverageRatio(selectionFor(packed, new Set([0])))).toBe(1);
  });
});

describe('splitFile', () => {
  it('returns the file untouched when it fits', () => {
    const body = file('a.ts', 3);

    expect(splitFile(body, 10_000)).toEqual([body]);
  });
});
```

Create `prism-api/src/diff/risk-rank.spec.ts`:

```ts
import { riskRankOf } from './risk-rank';
import type { RiskAssessment } from './risk-radar';

const assessment = (): RiskAssessment =>
  ({
    level: 'high',
    score: 60,
    stats: { files: 3, additions: 1, deletions: 0, sourceFiles: 3, testFiles: 0 },
    signals: [
      { id: 'auth_touched', label: 'Auth', weight: 20, detail: '', files: ['auth.ts'] },
      { id: 'sql_touched', label: 'SQL', weight: 10, detail: '', files: ['auth.ts', 'db.ts'] },
    ],
    checklist: [{ id: 'timeouts', question: 'q', why: 'w', files: ['db.ts'] }],
  }) as unknown as RiskAssessment;

describe('riskRankOf', () => {
  it('sums signal weights and checklist hits per file', () => {
    const rank = riskRankOf(assessment());

    expect(rank('auth.ts')).toBe(30);
    expect(rank('db.ts')).toBe(11);
    expect(rank('readme.md')).toBe(0);
  });

  it('ranks everything 0 when the scan failed', () => {
    expect(riskRankOf(null)('auth.ts')).toBe(0);
  });
});
```

- [x] **Step 2: Run them to verify they fail**

Run (from `prism-api/`): `npm test -- src/diff/batch-pack src/diff/risk-rank`
Expected: FAIL, `Cannot find module './batch-pack'` and `Cannot find module './risk-rank'`.

- [x] **Step 3: Implement**

Export the regex (one character change in `prism-api/src/diff/file-selection.ts`):

```diff
diff --git a/prism-api/src/diff/file-selection.ts b/prism-api/src/diff/file-selection.ts
--- a/prism-api/src/diff/file-selection.ts
+++ b/prism-api/src/diff/file-selection.ts
@@ -34,7 +34,7 @@ export interface Selection {
  * Generated, vendored, locked or binary. None of it is code a person wrote, and
  * every character of it is a character of real code the model does not see.
  */
-const NOISE =
+export const NOISE =
   /(^|\/)(dist|build|vendor|node_modules|__snapshots__)\/|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|Gemfile\.lock|go\.sum)$|\.min\.(js|css)$|\.(png|jpe?g|gif|ico|svg|pdf|woff2?|ttf|eot|zip|gz|lock)$/i;
 
 const FILE_START = /(?=^diff --git )/m;
```

Create `prism-api/src/diff/batch-pack.ts`:

```ts
import { parseGitHeader } from './git-paths';
import { NOISE, type Selection } from './file-selection';

/**
 * Splits everything a person would have to read into batches, one model call each.
 *
 * Pure. The old `selectForReview` answered "what fits one call?" and dropped the
 * rest; this answers "how many calls does the whole change need?" and only
 * reports a file as not reviewed when the call cap is hit.
 */
export interface BatchConfig {
  /** Characters of diff per model call. */
  batchChars: number;
  /** Calls per review; anything past it is reported as not reviewed. */
  maxBatches: number;
}

/** Higher means review sooner. Only consulted when the change does not fit the cap. */
export type RiskRank = (path: string) => number;

export interface BatchPiece {
  path: string;
  text: string;
}

export interface ReviewBatch {
  /** 0-based position among the kept batches. */
  index: number;
  text: string;
  /** Paths with at least one piece in this batch, in order. */
  files: string[];
  pieces: BatchPiece[];
}

export interface PackedReview {
  /** Always at least one. A diff with nothing to review yields one empty batch, as it always did. */
  batches: ReviewBatch[];
  /** Reviewable paths in diff order. */
  order: string[];
  /** Pieces each reviewable path was cut into, kept or not. */
  pieceTotals: Map<string, number>;
  noise: string[];
  /** Reviewable files that cannot be shown at all (a header larger than a batch). */
  unfit: string[];
  totalFiles: number;
}

const FILE_START = /(?=^diff --git )/m;
const HUNK_START = /(?=^@@ )/m;
const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Smallest slice of a batch worth cutting a file for. */
const MIN_ROOM = 200;
/** Room kept for the `@@ -a,b +c,d @@` line written on every cut piece. */
const HEADER_RESERVE = 48;
const CUT_MARK = ' [line cut]';

/**
 * Cuts one hunk that is larger than a batch at line boundaries. Every piece
 * starts with its own `@@` header carrying the real starting line numbers, so
 * the hunk index and the anchors resolve to true lines. A single line longer
 * than the room is cut and marked: it is the only content this ever drops.
 */
export function cutHunk(hunk: string, room: number): string[] {
  const lines = hunk.split('\n');

  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  const declared = HUNK_HEADER.exec(lines[0] ?? '');
  let oldLine = declared ? Number(declared[1]) : 1;
  let newLine = declared ? Number(declared[2]) : 1;
  const limit = Math.max(room - HEADER_RESERVE, MIN_ROOM - HEADER_RESERVE);
  const pieces: string[] = [];
  let body = '';
  let startOld = oldLine;
  let startNew = newLine;
  let oldCount = 0;
  let newCount = 0;

  const flush = (): void => {
    if (body !== '') {
      pieces.push(`@@ -${startOld},${oldCount} +${startNew},${newCount} @@\n${body}`);
    }

    body = '';
    startOld = oldLine;
    startNew = newLine;
    oldCount = 0;
    newCount = 0;
  };

  for (const raw of lines.slice(1)) {
    const line = raw.length + 1 > limit ? raw.slice(0, limit - CUT_MARK.length - 1) + CUT_MARK : raw;

    if (body !== '' && body.length + line.length + 1 > limit) {
      flush();
    }

    body += `${line}\n`;

    if (raw.startsWith('+')) {
      newLine += 1;
      newCount += 1;
    } else if (raw.startsWith('-')) {
      oldLine += 1;
      oldCount += 1;
    } else if (raw.startsWith(' ')) {
      oldLine += 1;
      newLine += 1;
      oldCount += 1;
      newCount += 1;
    }
  }

  flush();

  return pieces;
}

/**
 * One file as pieces that each fit `budget`: the whole file when it fits,
 * otherwise header plus whole hunks, and a hunk bigger than the room is cut at
 * line boundaries. Null when not even the header leaves room.
 */
export function splitFile(body: string, budget: number): string[] | null {
  if (body.length <= budget) {
    return [body];
  }

  const parts = body.split(HUNK_START);
  const header = parts[0] ?? '';
  const room = budget - header.length;

  if (room < MIN_ROOM) {
    return null;
  }

  const pieces: string[] = [];
  let current = header;

  const flush = (): void => {
    if (current !== header) {
      pieces.push(current);
    }

    current = header;
  };

  for (const hunk of parts.slice(1)) {
    if (hunk.length <= room) {
      if (current.length + hunk.length > budget) {
        flush();
      }

      current += hunk;
      continue;
    }

    flush();

    for (const cut of cutHunk(hunk, room)) {
      pieces.push(header + cut);
    }
  }

  flush();

  return pieces.length === 0 ? null : pieces;
}

interface FileEntry {
  path: string;
  pieces: string[];
}

/** Greedy and sequential: fill the open batch, otherwise open a new one. */
function place(entries: readonly FileEntry[], budget: number): BatchPiece[][] {
  const batches: BatchPiece[][] = [];
  let used = 0;

  for (const entry of entries) {
    for (const text of entry.pieces) {
      let open = batches[batches.length - 1];

      if (!open || used + text.length > budget) {
        open = [];
        batches.push(open);
        used = 0;
      }

      open.push({ path: entry.path, text });
      used += text.length;
    }
  }

  return batches;
}

export function packForReview(diff: string, config: BatchConfig, rank?: RiskRank): PackedReview {
  const chunks = diff.split(FILE_START).filter((chunk) => chunk.startsWith('diff --git'));
  const entries: FileEntry[] = [];
  const noise: string[] = [];
  const unfit: string[] = [];

  for (const body of chunks) {
    const path = parseGitHeader(body.split('\n', 1)[0] ?? '')?.oldPath;

    if (!path) {
      continue;
    }

    if (NOISE.test(path)) {
      noise.push(path);
      continue;
    }

    const pieces = splitFile(body, config.batchChars);

    if (pieces === null) {
      unfit.push(path);
    } else {
      entries.push({ path, pieces });
    }
  }

  let placed = place(entries, config.batchChars);

  // Over the cap, the files left out should be the least risky, not the last.
  if (placed.length > config.maxBatches && rank) {
    const byRisk = entries
      .map((entry, position) => ({ entry, position }))
      .sort((a, b) => rank(b.entry.path) - rank(a.entry.path) || a.position - b.position)
      .map(({ entry }) => entry);

    placed = place(byRisk, config.batchChars);
  }

  const batches = placed.slice(0, config.maxBatches).map(
    (pieces, index): ReviewBatch => ({
      index,
      text: pieces.map((piece) => piece.text).join(''),
      files: [...new Set(pieces.map((piece) => piece.path))],
      pieces,
    }),
  );

  if (batches.length === 0) {
    batches.push({ index: 0, text: '', files: [], pieces: [] });
  }

  return {
    batches,
    order: entries.map((entry) => entry.path),
    pieceTotals: new Map(entries.map((entry) => [entry.path, entry.pieces.length])),
    noise,
    unfit,
    totalFiles: chunks.length,
  };
}

/**
 * What the model was actually shown, in the shape the rest of the pipeline
 * already understands (`coverageRatio`, `coverageSentence`). Only batches in
 * `completed` count, so a batch that failed or was never run lowers coverage
 * exactly as a file dropped by the old byte budget did. A file with some of
 * its pieces reviewed counts as partial, which is worth half.
 */
export function selectionFor(packed: PackedReview, completed: ReadonlySet<number>): Selection {
  const seen = new Map<string, number>();
  let text = '';

  for (const batch of packed.batches) {
    if (!completed.has(batch.index)) {
      continue;
    }

    text += batch.text;

    for (const piece of batch.pieces) {
      seen.set(piece.path, (seen.get(piece.path) ?? 0) + 1);
    }
  }

  const files: string[] = [];
  const partial: string[] = [];
  const skipped: string[] = [...packed.noise, ...packed.unfit];

  for (const path of packed.order) {
    const got = seen.get(path) ?? 0;

    if (got === 0) {
      skipped.push(path);
    } else {
      files.push(path);

      if (got < (packed.pieceTotals.get(path) ?? got)) {
        partial.push(path);
      }
    }
  }

  return { text, files, skipped, partial, noise: [...packed.noise], totalFiles: packed.totalFiles };
}
```

Create `prism-api/src/diff/risk-rank.ts`:

```ts
import type { RiskAssessment } from './risk-radar';
import type { RiskRank } from './batch-pack';

/**
 * How early a file should be reviewed when the change is too big for the call
 * cap: the weight of every Risk Radar signal that names it, plus one per
 * reliability question that does. Risk Radar names files by their new path and
 * at most a handful per signal, so a renamed file or one outside the lists
 * ranks 0 and keeps diff order. That is accepted: the rank only decides who is
 * left out past the cap, and a tie keeps the diff's own order.
 */
export function riskRankOf(risk: RiskAssessment | null): RiskRank {
  const weight = new Map<string, number>();

  for (const signal of risk?.signals ?? []) {
    for (const path of signal.files) {
      weight.set(path, (weight.get(path) ?? 0) + signal.weight);
    }
  }

  for (const check of risk?.checklist ?? []) {
    for (const path of check.files) {
      weight.set(path, (weight.get(path) ?? 0) + 1);
    }
  }

  return (path) => weight.get(path) ?? 0;
}
```

- [x] **Step 4: Run to verify they pass**

Run: `npm test -- src/diff/batch-pack src/diff/risk-rank && npm run typecheck`
Expected: PASS, `Tests: 15 passed, 15 total`; typecheck prints no errors.

- [x] **Step 5: Commit**

```bash
git add prism-api/src/diff/batch-pack.ts prism-api/src/diff/batch-pack.spec.ts prism-api/src/diff/risk-rank.ts prism-api/src/diff/risk-rank.spec.ts prism-api/src/diff/file-selection.ts
git commit -m "Add a pure packer that splits a change into reviewable batches" -m "Today one model call sees about 8,000 characters and the rest of a big change is silently out of scope. The packer turns the whole change into batches, cutting a giant hunk at line boundaries with true line numbers on every piece, and reports what a capped review left out through the existing Selection so the 0a coverage label stays the single honesty mechanism."
```
(End the commit message with the `Co-Authored-By` line your session instructions specify.)

---

### Task 2: The token pacer

**Files:**
- Create: `prism-api/src/ai/token-pacer.ts`, `prism-api/src/ai/token-pacer.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface PaceProfile { tokensPerMinute: number; charsPerToken: number; promptOverheadTokens: number; assumedOutputTokens: number; maxWaitMs: number }`
  - `interface PaceClock { now(): number; sleep(ms: number, signal?: AbortSignal): Promise<void> }`, `const systemClock: PaceClock`
  - `class TokenPacer { constructor(profile: PaceProfile, clock?: PaceClock); estimate(inputChars: number): number; acquire(tokens: number, signal?: AbortSignal): Promise<number> }`

- [x] **Step 1: Write the failing test** `prism-api/src/ai/token-pacer.spec.ts`:

```ts
import { systemClock, TokenPacer, type PaceClock, type PaceProfile } from './token-pacer';

const PROFILE: PaceProfile = {
  tokensPerMinute: 8000,
  charsPerToken: 3.5,
  promptOverheadTokens: 800,
  assumedOutputTokens: 1200,
  maxWaitMs: 60_000,
};

function fakeClock(): PaceClock & { time: number; slept: number[] } {
  const clock = {
    time: 0,
    slept: [] as number[],
    now: () => clock.time,
    sleep: (ms: number) => {
      clock.slept.push(ms);
      clock.time += ms;

      return Promise.resolve();
    },
  };

  return clock;
}

describe('TokenPacer', () => {
  it('estimates input characters, prompt overhead and an assumed reply', () => {
    expect(new TokenPacer(PROFILE, fakeClock()).estimate(16_000)).toBe(4572 + 800 + 1200);
  });

  it('lets the first call go at once', async () => {
    const clock = fakeClock();

    expect(await new TokenPacer(PROFILE, clock).acquire(6572)).toBe(0);
    expect(clock.slept).toEqual([]);
  });

  it('holds a second large call until the first has left the minute window', async () => {
    const clock = fakeClock();
    const pacer = new TokenPacer(PROFILE, clock);

    await pacer.acquire(6572);
    const waited = await pacer.acquire(6572);

    expect(clock.slept).toEqual([60_000]);
    expect(waited).toBe(60_000);
  });

  it('lets two small calls share one minute', async () => {
    const clock = fakeClock();
    const pacer = new TokenPacer(PROFILE, clock);

    await pacer.acquire(3000);
    await pacer.acquire(3000);

    expect(clock.slept).toEqual([]);
  });

  it('counts a call only for the minute it was made in', async () => {
    const clock = fakeClock();
    const pacer = new TokenPacer(PROFILE, clock);

    await pacer.acquire(6572);
    clock.time += 61_000;
    await pacer.acquire(6572);

    expect(clock.slept).toEqual([]);
  });

  it('never waits longer than maxWaitMs, then lets the provider decide', async () => {
    const clock = fakeClock();
    const pacer = new TokenPacer({ ...PROFILE, maxWaitMs: 20_000 }, clock);

    await pacer.acquire(6572);
    const waited = await pacer.acquire(6572);

    expect(waited).toBe(20_000);
    expect(clock.slept).toEqual([20_000]);
  });

  it('admits a call bigger than the whole allowance when the window is empty', async () => {
    const clock = fakeClock();

    await new TokenPacer(PROFILE, clock).acquire(20_000);

    expect(clock.slept).toEqual([]);
  });

  it('does not pace a profile with no limit', async () => {
    const clock = fakeClock();
    const pacer = new TokenPacer({ ...PROFILE, tokensPerMinute: Number.POSITIVE_INFINITY }, clock);

    await pacer.acquire(1_000_000);
    await pacer.acquire(1_000_000);

    expect(clock.slept).toEqual([]);
  });
});

describe('systemClock.sleep', () => {
  it('rejects with the abort reason instead of finishing the wait', async () => {
    await expect(systemClock.sleep(10_000, AbortSignal.abort(new Error('job over')))).rejects.toThrow('job over');
  });

  it('resolves after the delay', async () => {
    await expect(systemClock.sleep(5)).resolves.toBeUndefined();
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `npm test -- src/ai/token-pacer`
Expected: FAIL, `Cannot find module './token-pacer'`.

- [x] **Step 3: Implement** `prism-api/src/ai/token-pacer.ts`:

```ts
/**
 * Keeps a multi-call review inside a provider's per-minute token allowance.
 *
 * Groq's free tier allows about 8,000 tokens a minute per model, which a
 * 16,000-character batch alone nearly fills. Without pacing, batch two meets a
 * 429 by design and a review that needed no retry fails its way into one. Pure
 * apart from the injected clock, so tests run on a fake one and take no time.
 *
 * It only ever delays; it never refuses. A wait is capped at `maxWaitMs`, after
 * which the call goes ahead and the provider decides, because a pacer that
 * blocked forever would spend the job budget on sleeping.
 */
export interface PaceProfile {
  /** The provider's tokens-per-minute allowance. Infinity means do not pace. */
  tokensPerMinute: number;
  /** Characters per token used to estimate a prompt. An assumption, not a measurement. */
  charsPerToken: number;
  /** The system prompt and framing every call carries. */
  promptOverheadTokens: number;
  /** What a reply is expected to cost. Unknown until measured against a live key. */
  assumedOutputTokens: number;
  /** The longest one call may be held back. */
  maxWaitMs: number;
}

export interface PaceClock {
  now(): number;
  /** Rejects with the signal's reason when it aborts. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export const systemClock: PaceClock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve, reject) => {
      const fail = (): void =>
        reject(signal?.reason instanceof Error ? signal.reason : new Error(String(signal?.reason)));

      if (signal?.aborted) {
        fail();

        return;
      }

      const onAbort = (): void => {
        clearTimeout(timer);
        fail();
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      signal?.addEventListener('abort', onAbort, { once: true });
    }),
};

const WINDOW_MS = 60_000;

export class TokenPacer {
  private readonly spent: { at: number; tokens: number }[] = [];

  constructor(
    private readonly profile: PaceProfile,
    private readonly clock: PaceClock = systemClock,
  ) {}

  /** Tokens one call is expected to cost, given the characters it sends. */
  estimate(inputChars: number): number {
    return (
      Math.ceil(inputChars / this.profile.charsPerToken) +
      this.profile.promptOverheadTokens +
      this.profile.assumedOutputTokens
    );
  }

  /** Resolves when the call may go. Returns how long it was held back, in ms. */
  async acquire(tokens: number, signal?: AbortSignal): Promise<number> {
    if (!Number.isFinite(this.profile.tokensPerMinute)) {
      return 0;
    }

    const started = this.clock.now();

    for (;;) {
      const now = this.clock.now();

      while (this.spent.length > 0 && now - (this.spent[0]?.at ?? now) >= WINDOW_MS) {
        this.spent.shift();
      }

      const used = this.spent.reduce((sum, entry) => sum + entry.tokens, 0);
      const waited = now - started;
      const oldest = this.spent[0];

      // An empty window always admits one call, even one bigger than the whole
      // allowance: nothing it could wait for would make it fit.
      if (!oldest || used + tokens <= this.profile.tokensPerMinute || waited >= this.profile.maxWaitMs) {
        this.spent.push({ at: now, tokens });

        return waited;
      }

      await this.clock.sleep(Math.min(oldest.at + WINDOW_MS - now, this.profile.maxWaitMs - waited), signal);
    }
  }
}
```

- [x] **Step 4: Run to verify it passes**

Run: `npm test -- src/ai/token-pacer && npm run typecheck`
Expected: PASS, `Tests: 10 passed, 10 total`.

- [x] **Step 5: Commit**

```bash
git add prism-api/src/ai/token-pacer.ts prism-api/src/ai/token-pacer.spec.ts
git commit -m "Add a token pacer for the provider's per-minute allowance" -m "Groq's free tier allows about 8,000 tokens a minute, which one 16,000-character batch nearly fills. Without pacing the second batch of a review meets a 429 by design. The pacer is pure apart from an injected clock and takes a profile so a personal provider key can use different limits."
```

---

### Task 3: The batching config and the derived job budget function

**Files:**
- Create: `prism-api/src/modules/review/batching.config.ts`, `prism-api/src/modules/review/batching.config.spec.ts`

**Interfaces:**
- Consumes: `BatchConfig` (Task 1), `PaceProfile` (Task 2), `GROQ_MODELS`, `GROQ_TIMEOUT_MS` (`ai/ai-client.service.ts`), `REQUEST_TIMEOUT_MS` (`github/github-client.service.ts`).
- Produces: `BATCH_CONFIG: BatchConfig`, `MAX_MERGED_FINDINGS = 40`, `CHECKPOINT_VERSION = 1`, `CHECKPOINT_TTL_SECONDS`, `GROQ_FREE_PACE: PaceProfile`, `OWN_KEY_PACE: PaceProfile`, `BATCH_WORST_CASE_MS`, `jobBudgetMs(maxBatches: number, pace?: PaceProfile): number`.

- [x] **Step 1: Write the failing test** `prism-api/src/modules/review/batching.config.spec.ts`:

```ts
import { GROQ_MODELS, GROQ_TIMEOUT_MS } from '../../ai/ai-client.service';
import { REQUEST_TIMEOUT_MS as GITHUB_TIMEOUT_MS } from '../../github/github-client.service';
import { BATCH_CONFIG, BATCH_WORST_CASE_MS, GROQ_FREE_PACE, jobBudgetMs } from './batching.config';

describe('batching config', () => {
  it('starts from the spike defaults', () => {
    expect(BATCH_CONFIG).toEqual({ batchChars: 16_000, maxBatches: 8 });
  });

  it('gives one batch the own-model attempt plus the whole Groq chain', () => {
    expect(BATCH_WORST_CASE_MS).toBe(GROQ_TIMEOUT_MS * (GROQ_MODELS.length + 1));
  });

  it('derives the budget from the spike formula plus the pacing wait', () => {
    const n = 8;
    const spike = GROQ_TIMEOUT_MS * (n * (GROQ_MODELS.length + 1) + 1) + 2 * GITHUB_TIMEOUT_MS + 30_000;

    expect(jobBudgetMs(n)).toBe(spike + n * GROQ_FREE_PACE.maxWaitMs);
  });

  it('grows by one batch worst case and one pacing wait per batch', () => {
    expect(jobBudgetMs(5) - jobBudgetMs(4)).toBe(BATCH_WORST_CASE_MS + GROQ_FREE_PACE.maxWaitMs);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `npm test -- src/modules/review/batching.config`
Expected: FAIL, `Cannot find module './batching.config'`.

- [x] **Step 3: Implement** `prism-api/src/modules/review/batching.config.ts`:

```ts
import { GROQ_MODELS, GROQ_TIMEOUT_MS } from '../../ai/ai-client.service';
import type { PaceProfile } from '../../ai/token-pacer';
import type { BatchConfig } from '../../diff/batch-pack';
import { REQUEST_TIMEOUT_MS as GITHUB_TIMEOUT_MS } from '../../github/github-client.service';

/**
 * Every number batched review depends on, in one place.
 *
 * None of these is measured against a live Groq key yet (docs/superpowers/spikes/
 * 2026-11-08-batching-spike.md, part C), so each is a starting value chosen from
 * the spike's offline results and Groq's published free-tier limits. Retune
 * them here after a live run; nothing else hard-codes them, and the job budget
 * (`jobBudgetMs`) follows.
 */
export const BATCH_CONFIG: BatchConfig = {
  /** Characters of diff per model call. 16,000 halves the calls of 8,000 and keeps one call near 5,000 input tokens. */
  batchChars: 16_000,
  /** Calls per review. Covers 97% of the sampled diffs; the rest finish with the partial label. */
  maxBatches: 8,
};

/** Findings shown for one review, after de-duplication. The comment builder shows fewer; the page shows all. */
export const MAX_MERGED_FINDINGS = 40;

/** Bumping this abandons every saved checkpoint, e.g. after a change to the prompt or to `BatchResult`. */
export const CHECKPOINT_VERSION = 1;

/** Long enough to outlast every retry of one job; short enough that a re-analyze days later starts fresh. */
export const CHECKPOINT_TTL_SECONDS = 2 * 60 * 60;

/** Groq's free tier: about 8,000 tokens a minute per model (console.groq.com/docs/rate-limits, 2026-11-08). */
export const GROQ_FREE_PACE: PaceProfile = {
  tokensPerMinute: 8000,
  charsPerToken: 3.5,
  promptOverheadTokens: 800,
  assumedOutputTokens: 1200,
  maxWaitMs: 60_000,
};

/**
 * A user's own provider key (ADR 0012). Their limits are unknown and usually
 * far higher, so batches are not delayed; a 429 ends the review as partial
 * instead. The Groq fallback behind it is paced by nothing, which can cost a
 * 429 on a long review: accepted and documented.
 */
export const OWN_KEY_PACE: PaceProfile = {
  ...GROQ_FREE_PACE,
  tokensPerMinute: Number.POSITIVE_INFINITY,
};

/**
 * One batch's worst case: the user's own model and the whole Groq chain, each
 * hanging until its timeout. Also the per-batch deadline, so one stuck batch
 * cannot spend the budget of the others.
 */
export const BATCH_WORST_CASE_MS = GROQ_TIMEOUT_MS * (GROQ_MODELS.length + 1);

/**
 * The per-attempt job budget, derived from the batch cap and never typed in:
 * every batch at its worst plus the longest pacing wait, the one fixes pass, a
 * GitHub round trip either side, and 30 s for database work. It is a ceiling
 * that holds only if every call hangs; a review that fits one batch uses a
 * small fraction of it. It is also how long the single worker can be blocked.
 */
export function jobBudgetMs(maxBatches: number, pace: PaceProfile = GROQ_FREE_PACE): number {
  return (
    maxBatches * (BATCH_WORST_CASE_MS + pace.maxWaitMs) + GROQ_TIMEOUT_MS + 2 * GITHUB_TIMEOUT_MS + 30_000
  );
}
```

- [x] **Step 4: Run to verify it passes**

Run: `npm test -- src/modules/review/batching.config && npm run typecheck`
Expected: PASS, `Tests: 4 passed, 4 total`.

- [x] **Step 5: Commit**

```bash
git add prism-api/src/modules/review/batching.config.ts prism-api/src/modules/review/batching.config.spec.ts
git commit -m "Gather every batching constant in one module" -m "Nothing about batching has been measured against a live key yet, so each number is a starting value. Keeping them in one file, with the job budget derived from them, lets a live run retune them without touching logic."
```

---

### Task 4: Per-batch preparation, hunk-index merge and finding merge

**Files:**
- Modify: `prism-api/src/diff/hunk-index.ts` (+ `hunk-index.spec.ts`), `prism-api/src/diff/prepare.ts` (+ `prepare.spec.ts`)
- Create: `prism-api/src/ai/batch-merge.ts`, `prism-api/src/ai/batch-merge.spec.ts`

**Interfaces:**
- Consumes: `buildHunkIndex`, `renderWithAnchors`, `Anchor`, `orderFindings` (`ai/verdict.ts`), `ReviewIssue`.
- Produces:
  - `prepareBatch(text: string): PreparedBatch` where `PreparedBatch = { body: string; anchors: Map<number, Anchor>; index: HunkIndex }`; `coverageSentence(selection: Selection): string | null` is now exported.
  - `mergeHunkIndexes(indexes: readonly HunkIndex[]): HunkIndex`
  - `interface BatchResult { index: number; model: string; security: ReviewIssue[]; performance: ReviewIssue[]; code_quality: ReviewIssue[]; dropped: number; score: number | null; summary: string | null }`
  - `interface MergedReview { layers: {security; performance; code_quality: ReviewIssue[]}; kept; dropped; trimmed: number; score: number | null; summary: string | null; models: string[]; lastModel: string }`
  - `mergeBatchResults(results: readonly BatchResult[], maxFindings: number): MergedReview`

- [x] **Step 1: Write the failing tests**

Append the `prepareBatch` tests to `prism-api/src/diff/prepare.spec.ts` and the `mergeHunkIndexes` tests to `prism-api/src/diff/hunk-index.spec.ts` (the import line of each changes as shown):

```diff
diff --git a/prism-api/src/diff/prepare.spec.ts b/prism-api/src/diff/prepare.spec.ts
--- a/prism-api/src/diff/prepare.spec.ts
+++ b/prism-api/src/diff/prepare.spec.ts
@@ -1,4 +1,4 @@
-import { prepareDiff } from './prepare';
+import { prepareBatch, prepareDiff } from './prepare';
 
 /**
  * The stage both runners share.
@@ -89,3 +89,23 @@ index 1111111..2222222 100644
     expect(prepareDiff(diff, one('a').length).coverageRatio).toBeCloseTo(0.25);
   });
 });
+
+describe('prepareBatch', () => {
+  it('numbers anchors from 1 in every batch, so ids from another batch are unknown here', () => {
+    const first = prepareBatch(diff('a.ts', ['+one', '+two']));
+    const second = prepareBatch(diff('b.ts', ['+three']));
+
+    expect([...first.anchors.keys()]).toEqual([1, 2]);
+    expect([...second.anchors.keys()]).toEqual([1]);
+    expect(second.anchors.get(1)?.file).toBe('b.ts');
+    expect(second.anchors.get(2)).toBeUndefined();
+  });
+
+  it('carries the anchor instructions, which the frozen system prompt cannot', () => {
+    expect(prepareBatch(diff('a.ts', ['+x'])).body).toContain('anchor id in square brackets');
+  });
+
+  it('has an empty body for an empty batch', () => {
+    expect(prepareBatch('').body).toBe('');
+  });
+});
```

```diff
diff --git a/prism-api/src/diff/hunk-index.spec.ts b/prism-api/src/diff/hunk-index.spec.ts
--- a/prism-api/src/diff/hunk-index.spec.ts
+++ b/prism-api/src/diff/hunk-index.spec.ts
@@ -1,4 +1,4 @@
-import { buildHunkIndex, type HunkLine } from './hunk-index';
+import { buildHunkIndex, mergeHunkIndexes, type HunkLine } from './hunk-index';
 
 describe('buildHunkIndex', () => {
   it('records the new-side line numbers of added lines', () => {
@@ -198,3 +198,23 @@ describe('buildHunkIndex', () => {
     expect(index.get('a.ts')?.lines.map((line) => line.newLine)).toEqual([1, 2, 51]);
   });
 });
+
+describe('mergeHunkIndexes', () => {
+  const part = (hunk: string) => buildHunkIndex(`diff --git a/f.ts b/f.ts\n${hunk}`);
+
+  it('unions a file cut across batches and keeps the lines in batch order', () => {
+    const merged = mergeHunkIndexes([part('@@ -1,1 +1,2 @@\n ctx\n+a\n'), part('@@ -10,1 +11,2 @@\n ctx\n+b\n')]);
+    const file = merged.get('f.ts');
+
+    expect([...(file?.added.keys() ?? [])]).toEqual([2, 12]);
+    expect(file?.lines.filter((l) => l.kind === 'added').map((l) => l.text)).toEqual(['a', 'b']);
+  });
+
+  it('does not mutate the indexes it was given', () => {
+    const one = part('@@ -1,1 +1,2 @@\n ctx\n+a\n');
+
+    mergeHunkIndexes([one, part('@@ -5,1 +6,2 @@\n ctx\n+b\n')]);
+
+    expect(one.get('f.ts')?.added.size).toBe(1);
+  });
+});
```

Create `prism-api/src/ai/batch-merge.spec.ts`:

```ts
import type { ReviewIssue } from '../database/entities/review.entity';
import { mergeBatchResults, type BatchResult } from './batch-merge';

const issue = (over: Partial<ReviewIssue>): ReviewIssue => ({
  file: 'a.ts',
  line: 1,
  side: 'added',
  category: 'other',
  severity: 'suggestion',
  comment: 'c',
  ...over,
});

const result = (index: number, over: Partial<BatchResult> = {}): BatchResult => ({
  index,
  model: 'groq/m',
  security: [],
  performance: [],
  code_quality: [],
  dropped: 0,
  score: 80,
  summary: `s${index}`,
  ...over,
});

describe('mergeBatchResults', () => {
  it('returns a single batch as it was, summary untouched', () => {
    const merged = mergeBatchResults([result(0, { code_quality: [issue({})], summary: 'Looks fine.' })], 40);

    expect(merged.summary).toBe('Looks fine.');
    expect(merged.layers.code_quality).toHaveLength(1);
    expect(merged.trimmed).toBe(0);
  });

  it('drops a repeat of the same category on the same line, keeping the higher-priority layer', () => {
    const merged = mergeBatchResults(
      [
        result(0, { code_quality: [issue({ category: 'error_swallowed' })] }),
        result(1, { security: [issue({ category: 'error_swallowed' })] }),
      ],
      40,
    );

    expect(merged.layers.security).toHaveLength(1);
    expect(merged.layers.code_quality).toHaveLength(0);
  });

  it('keeps different categories or lines on the same file', () => {
    const merged = mergeBatchResults(
      [result(0, { code_quality: [issue({ line: 1 }), issue({ line: 2 }), issue({ line: 1, category: 'no_timeout' })] })],
      40,
    );

    expect(merged.kept).toBe(3);
  });

  it('keeps blocking findings first when the budget cuts the list', () => {
    const merged = mergeBatchResults(
      [
        result(0, {
          code_quality: [
            issue({ line: 1, severity: 'critical' }),
            issue({ line: 2, severity: 'critical' }),
            issue({ line: 3, severity: 'suggestion', category: 'auth_weakened' }),
          ],
        }),
      ],
      2,
    );

    expect(merged.layers.code_quality.map((i) => i.line)).toEqual([3, 1]);
    expect(merged.trimmed).toBe(1);
    expect(merged.summary).toBe('s0\n1 lower-priority finding was not shown.');
  });

  it('labels each part of a multi-batch summary and clips a long one', () => {
    const merged = mergeBatchResults([result(1, { summary: 'y'.repeat(900) }), result(0, { summary: 'first' })], 40);

    expect(merged.summary?.startsWith('Part 1: first\nPart 2: yyy')).toBe(true);
    expect(merged.summary?.length).toBeLessThan(500);
  });

  it('uses the lowest batch score, or null when none was given', () => {
    expect(mergeBatchResults([result(0, { score: 90 }), result(1, { score: 55 })], 40).score).toBe(55);
    expect(mergeBatchResults([result(0, { score: null })], 40).score).toBeNull();
  });

  it('sums validator drops and lists models once, remembering the last', () => {
    const merged = mergeBatchResults(
      [result(0, { dropped: 2, model: 'groq/a' }), result(1, { dropped: 1, model: 'groq/b' }), result(2, { model: 'groq/b' })],
      40,
    );

    expect(merged.dropped).toBe(3);
    expect(merged.models).toEqual(['groq/a', 'groq/b']);
    expect(merged.lastModel).toBe('groq/b');
  });
});
```

- [x] **Step 2: Run them to verify they fail**

Run: `npm test -- src/diff/prepare src/diff/hunk-index src/ai/batch-merge`
Expected: FAIL (`prepareBatch`, `mergeHunkIndexes` are not exported; `Cannot find module './batch-merge'`).

- [x] **Step 3: Implement**

```diff
diff --git a/prism-api/src/diff/hunk-index.ts b/prism-api/src/diff/hunk-index.ts
--- a/prism-api/src/diff/hunk-index.ts
+++ b/prism-api/src/diff/hunk-index.ts
@@ -85,3 +85,36 @@ export function buildHunkIndex(diff: string): HunkIndex {
 
   return index;
 }
+
+/**
+ * One index out of the per-batch indexes of a batched review. A file cut across
+ * batches appears in several of them with disjoint lines, so its maps are
+ * unioned and its lines concatenated in batch order. The second AI pass checks
+ * its fixes against this, so it has to cover everything that was reviewed.
+ */
+export function mergeHunkIndexes(indexes: readonly HunkIndex[]): HunkIndex {
+  const merged: HunkIndex = new Map();
+
+  for (const index of indexes) {
+    for (const [file, hunks] of index) {
+      const into = merged.get(file);
+
+      if (!into) {
+        merged.set(file, {
+          added: new Map(hunks.added),
+          removed: new Map(hunks.removed),
+          context: new Map(hunks.context),
+          lines: [...hunks.lines],
+        });
+        continue;
+      }
+
+      hunks.added.forEach((text, line) => into.added.set(line, text));
+      hunks.removed.forEach((text, line) => into.removed.set(line, text));
+      hunks.context.forEach((text, line) => into.context.set(line, text));
+      into.lines.push(...hunks.lines);
+    }
+  }
+
+  return merged;
+}
```

```diff
diff --git a/prism-api/src/diff/prepare.ts b/prism-api/src/diff/prepare.ts
--- a/prism-api/src/diff/prepare.ts
+++ b/prism-api/src/diff/prepare.ts
@@ -40,7 +40,7 @@ const ANCHOR_INSTRUCTIONS =
   'For each issue you report, put that anchor id in the "line" field. Report only lines that have an anchor.\n' +
   'Lines with no anchor are unchanged context, shown so you can understand the change.\n\n';
 
-function coverageSentence(selection: Selection): string | null {
+export function coverageSentence(selection: Selection): string | null {
   const left = selection.skipped.length;
   const partial = selection.partial.length;
 
@@ -58,6 +58,33 @@ function coverageSentence(selection: Selection): string | null {
   return parts.join(' ');
 }
 
+/** One batch, rendered with its own anchors. Ids start at 1 in every batch. */
+export interface PreparedBatch {
+  /** The rendered diff for the user message; empty when the batch has no text. */
+  body: string;
+  /** Anchor id to real location, for THIS batch only. */
+  anchors: Map<number, Anchor>;
+  index: HunkIndex;
+}
+
+/**
+ * The anchor scheme applied to one batch of a batched review. Ids are numbered
+ * per batch and validated against that batch's own map, so a finding is only
+ * ever accepted if it names an anchor the model was shown in the same call:
+ * exactly as strict as the single-call scheme (ADR 0006), never looser. An id
+ * from another batch is simply unknown here.
+ */
+export function prepareBatch(text: string): PreparedBatch {
+  const index = buildHunkIndex(text);
+  const rendered = renderWithAnchors(index);
+
+  return {
+    body: rendered.text === '' ? '' : ANCHOR_INSTRUCTIONS + rendered.text,
+    anchors: rendered.anchors,
+    index,
+  };
+}
+
 export function prepareDiff(diffBody: string, budget: number): PreparedDiff {
   const selection = selectForReview(diffBody, budget);
   const index = buildHunkIndex(selection.text);
```

Create `prism-api/src/ai/batch-merge.ts`:

```ts
import type { ReviewIssue } from '../database/entities/review.entity';
import { orderFindings } from './verdict';

/**
 * What one batch's model reply became after validation against that batch's own
 * anchors. This is the unit that is checkpointed, so it holds only plain JSON.
 */
export interface BatchResult {
  /** The batch's position in the review, 0-based. */
  index: number;
  /** Label stored in ai_model_used, e.g. "groq/openai/gpt-oss-120b". */
  model: string;
  security: ReviewIssue[];
  performance: ReviewIssue[];
  code_quality: ReviewIssue[];
  /** Findings the validator refused in this batch. */
  dropped: number;
  /** The model's own 0-100 score for this batch, before reconciliation. */
  score: number | null;
  summary: string | null;
}

export interface MergedReview {
  layers: { security: ReviewIssue[]; performance: ReviewIssue[]; code_quality: ReviewIssue[] };
  /** Findings shown. */
  kept: number;
  /** Validator drops summed over every batch. */
  dropped: number;
  /** Findings beyond the budget, not shown. */
  trimmed: number;
  /** The lowest batch score, or null when no batch gave one. Reconciled later by `scoreFor`. */
  score: number | null;
  summary: string | null;
  /** Distinct models that answered, in the order they first did. */
  models: string[];
  /** The model of the last batch, which the fixes pass reuses. */
  lastModel: string;
}

const LAYERS = ['security', 'performance', 'code_quality'] as const;
const PART_SUMMARY_CHARS = 400;

/**
 * Two reports of the same category on the same changed line are one finding,
 * whichever batch or layer raised them. Layers are walked in priority order, so
 * a security report wins over a quality one on the same line.
 */
const keyOf = (issue: ReviewIssue): string =>
  `${issue.file ?? ''}|${issue.side ?? ''}|${issue.line ?? ''}|${issue.category ?? ''}`;

const clip = (text: string): string =>
  text.length > PART_SUMMARY_CHARS ? `${text.slice(0, PART_SUMMARY_CHARS - 1)}…` : text;

/**
 * One review out of several batch replies. Already-validated findings are
 * de-duplicated, ordered worst first by the same `orderFindings` the pages use,
 * and cut to `maxFindings` so a large change cannot produce a comment nobody
 * scrolls. Nothing here invents text that a recogniser must know: the summary
 * is the model's own words, labelled by part.
 */
export function mergeBatchResults(results: readonly BatchResult[], maxFindings: number): MergedReview {
  const ordered = [...results].sort((a, b) => a.index - b.index);
  const seen = new Set<string>();
  const tagged: { issue: ReviewIssue; layer: (typeof LAYERS)[number] }[] = [];

  for (const layer of LAYERS) {
    for (const result of ordered) {
      for (const issue of result[layer]) {
        const key = keyOf(issue);

        if (!seen.has(key)) {
          seen.add(key);
          tagged.push({ issue, layer });
        }
      }
    }
  }

  const position = new Map(orderFindings(tagged.map((t) => t.issue)).map((issue, i) => [issue, i]));
  const shown = [...tagged]
    .sort((a, b) => (position.get(a.issue) ?? 0) - (position.get(b.issue) ?? 0))
    .slice(0, maxFindings);
  const layers: MergedReview['layers'] = { security: [], performance: [], code_quality: [] };

  for (const { issue, layer } of shown) {
    layers[layer].push(issue);
  }

  const trimmed = tagged.length - shown.length;
  const scores = ordered.map((r) => r.score).filter((s): s is number => s !== null);
  const parts = ordered
    .filter((r) => r.summary !== null && r.summary.trim() !== '')
    .map((r) => `Part ${r.index + 1}: ${clip((r.summary as string).trim())}`);
  let summary: string | null =
    ordered.length === 1 ? (ordered[0]?.summary ?? null) : parts.length > 0 ? parts.join('\n') : null;

  if (trimmed > 0) {
    const note = `${trimmed} lower-priority ${trimmed === 1 ? 'finding was' : 'findings were'} not shown.`;

    summary = summary === null ? note : `${summary}\n${note}`;
  }

  return {
    layers,
    kept: shown.length,
    dropped: ordered.reduce((sum, r) => sum + r.dropped, 0),
    trimmed,
    score: scores.length > 0 ? Math.min(...scores) : null,
    summary,
    models: [...new Set(ordered.map((r) => r.model))],
    lastModel: ordered[ordered.length - 1]?.model ?? '',
  };
}
```

- [x] **Step 4: Run to verify they pass**

Run: `npm test -- src/diff src/ai/batch-merge && npm run typecheck`
Expected: PASS (the whole `src/diff` directory, including the frozen-prompt-independent specs, stays green).

- [x] **Step 5: Commit**

```bash
git add prism-api/src/diff/hunk-index.ts prism-api/src/diff/hunk-index.spec.ts prism-api/src/diff/prepare.ts prism-api/src/diff/prepare.spec.ts prism-api/src/ai/batch-merge.ts prism-api/src/ai/batch-merge.spec.ts
git commit -m "Prepare anchors per batch and merge batch results" -m "Anchor ids restart at 1 in every batch and are validated only against that batch's own map, so a finding is accepted only if it names a line the model saw in the same call: as strict as ADR 0006, never looser. The merge de-duplicates, orders with the existing orderFindings and adds no new fixed summary string."
```

---

### Task 5: The checkpoint store and its erasure

**Files:**
- Create: `prism-api/src/modules/review/review-checkpoint.store.ts`, `review-checkpoint.store.spec.ts`, `review-checkpoint.module.ts`
- Modify: `prism-api/src/modules/account/account-data.service.ts` (+ `.spec.ts`), `account-data.module.ts`

**Interfaces:**
- Consumes: `BatchResult` (Task 4), `CHECKPOINT_TTL_SECONDS` (Task 3), `erasureMarkerKey` (`modules/account/erasure-marker.ts`), `REDIS_CLIENT`.
- Produces:
  - `type CheckpointKind = 'pr' | 'commit'`, `interface CheckpointRef { kind: CheckpointKind; id: number; ownerId: number }`
  - `class ReviewCheckpointStore { load(ref, fingerprint): Promise<Map<number, BatchResult>>; save(ref, fingerprint, result): Promise<boolean>; clear(ref): Promise<void>; purgeOwner(ownerId): Promise<void> }` (`load`, `save`, `clear` never throw; `purgeOwner` throws)
  - `SAVE_BATCH_SCRIPT` (the Lua), `ReviewCheckpointModule` (exports the store)
  - `AccountDataService` constructor gains a **last** parameter `checkpoints: ReviewCheckpointStore` and `deleteAccount` calls `checkpoints.purgeOwner(user.id)` after `designs.purgeOwner`.

- [x] **Step 1: Write the failing tests**

Create `prism-api/src/modules/review/review-checkpoint.store.spec.ts`:

```ts
import type { BatchResult } from '../../ai/batch-merge';
import { CHECKPOINT_TTL_SECONDS } from './batching.config';
import { ReviewCheckpointStore, SAVE_BATCH_SCRIPT, type CheckpointRef } from './review-checkpoint.store';

const REF: CheckpointRef = { kind: 'pr', id: 7, ownerId: 3 };

const result = (index: number): BatchResult => ({
  index,
  model: 'groq/m',
  security: [],
  performance: [],
  code_quality: [],
  dropped: 0,
  score: 80,
  summary: 's',
});

function build(redis: Record<string, jest.Mock>) {
  return new ReviewCheckpointStore(redis as never);
}

describe('ReviewCheckpointStore', () => {
  it('saves through the erasure-marker script under an owner-prefixed key', async () => {
    const redis = { eval: jest.fn().mockResolvedValue(1) };

    expect(await build(redis).save(REF, 'fp1', result(2))).toBe(true);
    expect(redis.eval).toHaveBeenCalledWith(
      SAVE_BATCH_SCRIPT,
      2,
      'review-batches:3:pr:7',
      'account:erased:3',
      'fp1',
      'b2',
      JSON.stringify(result(2)),
      CHECKPOINT_TTL_SECONDS,
    );
  });

  it('reports a refused write while the account is being erased', async () => {
    expect(await build({ eval: jest.fn().mockResolvedValue(0) }).save(REF, 'fp1', result(0))).toBe(false);
  });

  it('never throws on a Redis failure when saving', async () => {
    expect(await build({ eval: jest.fn().mockRejectedValue(new Error('down')) }).save(REF, 'fp1', result(0))).toBe(false);
  });

  it('loads the batches saved under the same fingerprint', async () => {
    const redis = {
      hgetall: jest.fn().mockResolvedValue({ fp: 'fp1', b0: JSON.stringify(result(0)), b2: JSON.stringify(result(2)) }),
    };
    const found = await build(redis).load(REF, 'fp1');

    expect([...found.keys()]).toEqual([0, 2]);
  });

  it('ignores a hash from a different diff or different settings', async () => {
    const redis = { hgetall: jest.fn().mockResolvedValue({ fp: 'old', b0: JSON.stringify(result(0)) }) };

    expect((await build(redis).load(REF, 'new')).size).toBe(0);
  });

  it('skips an entry that is not a batch result, and returns nothing when Redis fails', async () => {
    const odd = { hgetall: jest.fn().mockResolvedValue({ fp: 'fp1', b0: '{"index":0}', b1: 'not json' }) };

    expect((await build(odd).load(REF, 'fp1')).size).toBe(0);
    expect((await build({ hgetall: jest.fn().mockRejectedValue(new Error('down')) }).load(REF, 'fp1')).size).toBe(0);
  });

  it('clears one review and swallows a failure', async () => {
    const redis = { del: jest.fn().mockResolvedValue(1) };

    await build(redis).clear(REF);

    expect(redis.del).toHaveBeenCalledWith('review-batches:3:pr:7');
    await expect(build({ del: jest.fn().mockRejectedValue(new Error('down')) }).clear(REF)).resolves.toBeUndefined();
  });

  it('purges every key of an owner across scan pages, and throws if it cannot', async () => {
    const redis = {
      scan: jest
        .fn()
        .mockResolvedValueOnce(['17', ['review-batches:3:pr:7']])
        .mockResolvedValueOnce(['0', ['review-batches:3:commit:9']]),
      del: jest.fn().mockResolvedValue(1),
    };

    await build(redis).purgeOwner(3);

    expect(redis.scan).toHaveBeenCalledWith('0', 'MATCH', 'review-batches:3:*', 'COUNT', 100);
    expect(redis.del).toHaveBeenCalledTimes(2);
    await expect(build({ scan: jest.fn().mockRejectedValue(new Error('down')) }).purgeOwner(3)).rejects.toThrow('down');
  });
});
```

Update the account spec (the new fifth constructor argument, the call-order assertion, and a failing-purge test):

```diff
diff --git a/prism-api/src/modules/account/account-data.service.spec.ts b/prism-api/src/modules/account/account-data.service.spec.ts
--- a/prism-api/src/modules/account/account-data.service.spec.ts
+++ b/prism-api/src/modules/account/account-data.service.spec.ts
@@ -5,7 +5,7 @@ import { AccountDataService } from './account-data.service';
 
 const user = { id: 1, githubToken: null } as User;
 
-function build(overrides: { purgeOwner?: jest.Mock; purge?: jest.Mock } = {}) {
+function build(overrides: { purgeOwner?: jest.Mock; purge?: jest.Mock; purgeCheckpoints?: jest.Mock } = {}) {
   const query = {
     innerJoin: jest.fn().mockReturnThis(),
     where: jest.fn().mockReturnThis(),
@@ -24,15 +24,17 @@ function build(overrides: { purgeOwner?: jest.Mock; purge?: jest.Mock } = {}) {
     purge: overrides.purge ?? jest.fn().mockResolvedValue(undefined),
     count: jest.fn().mockResolvedValue(2),
   };
+  const checkpoints = { purgeOwner: overrides.purgeCheckpoints ?? jest.fn().mockResolvedValue(undefined) };
   const redis = { set: jest.fn().mockResolvedValue('OK') };
   const service = new AccountDataService(
     { createQueryBuilder: () => query } as never,
     designs as never,
     risk as never,
     redis as never,
+    checkpoints as never,
   );
 
-  return { service, designs, risk, redis };
+  return { service, designs, risk, redis, checkpoints };
 }
 
 describe('AccountDataService.deleteAccount', () => {
@@ -51,7 +53,7 @@ describe('AccountDataService.deleteAccount', () => {
   }
 
   it('sets the marker, purges Redis, then deletes the rows - in that order', async () => {
-    const { service, designs, risk, redis } = withRedis();
+    const { service, designs, risk, redis, checkpoints } = withRedis();
     const deleteRows = jest.fn().mockResolvedValue(undefined);
 
     await service.deleteAccount(user, deleteRows);
@@ -60,18 +62,31 @@ describe('AccountDataService.deleteAccount', () => {
       redis.set.mock.invocationCallOrder[0],
       risk.purge.mock.invocationCallOrder[0],
       designs.purgeOwner.mock.invocationCallOrder[0],
+      checkpoints.purgeOwner.mock.invocationCallOrder[0],
       deleteRows.mock.invocationCallOrder[0],
     ] as number[];
 
     expect(redis.set).toHaveBeenCalledWith(MARKER, '1', 'EX', expect.any(Number));
     expect(risk.purge).toHaveBeenCalledWith([41, 42]);
     expect(designs.purgeOwner).toHaveBeenCalledWith(1);
+    expect(checkpoints.purgeOwner).toHaveBeenCalledWith(1);
     expect(order).toEqual([...order].sort((a, b) => a - b));
     // On success the marker stays and expires: a review still running for
     // this id may yet try to save, and the marker is what refuses it.
     expect(redis.del).not.toHaveBeenCalled();
   });
 
+  it('clears the marker and keeps the account when purging saved review batches fails', async () => {
+    const { service, checkpoints, redis } = withRedis();
+    const deleteRows = jest.fn();
+
+    checkpoints.purgeOwner.mockRejectedValue(new Error('ECONNREFUSED'));
+
+    await expect(service.deleteAccount(user, deleteRows)).rejects.toBeInstanceOf(ServiceUnavailableException);
+    expect(deleteRows).not.toHaveBeenCalled();
+    expect(redis.del).toHaveBeenCalledWith(MARKER);
+  });
+
   it('clears the marker and keeps the account when a purge fails', async () => {
     const { service, designs, redis } = withRedis();
     const deleteRows = jest.fn();
```

- [x] **Step 2: Run them to verify they fail**

Run: `npm test -- src/modules/review/review-checkpoint src/modules/account`
Expected: FAIL (`Cannot find module './review-checkpoint.store'`; the account spec does not compile against the old constructor).

- [x] **Step 3: Implement**

Create `prism-api/src/modules/review/review-checkpoint.store.ts`:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import type { BatchResult } from '../../ai/batch-merge';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { erasureMarkerKey } from '../account/erasure-marker';
import { CHECKPOINT_TTL_SECONDS } from './batching.config';

/**
 * The finished batches of a review in progress, so a BullMQ retry resumes
 * instead of paying for them again.
 *
 * A review of several batches can fail after most of its paid, rate-limited
 * calls have succeeded (the next call times out, the process restarts, the
 * deadline fires). The retry would otherwise start at batch one. Each validated
 * batch is saved here the moment it completes; a retry loads them and runs only
 * what is missing.
 *
 * Redis rather than a table: a new table is hand-applied DDL, and this data is
 * worth keeping for hours, not for good. The same reason Design Studio and the
 * saved risk assessment live in Redis.
 *
 * One hash per review, `fp` plus `b0`, `b1`... The fingerprint covers the diff
 * and the batching settings, so a new push (a different diff) or a retuned
 * batch size never resumes from batches cut differently: `load` ignores a hash
 * with another fingerprint and the next `save` replaces it.
 *
 * It holds findings about a user's code, so it is erasable (CLAUDE.md): keys
 * start with the owner's id so `purgeOwner` finds them, and writes go through
 * the erasure-marker script (account/erasure-marker.ts) so a review running
 * during account deletion cannot re-create what was just purged.
 */
export type CheckpointKind = 'pr' | 'commit';

export interface CheckpointRef {
  kind: CheckpointKind;
  /** pull_requests.id or commit_reviews.id. */
  id: number;
  /** The repository owner's user id; what erasure is keyed on. */
  ownerId: number;
}

/**
 * Check-and-write in one atomic step: refuse while the owner's account is
 * being erased; replace a hash left by a different fingerprint.
 *
 * KEYS: review hash, erasure marker    ARGV: fingerprint, field, batch JSON, ttl seconds
 * Returns 1 when saved, 0 when refused.
 */
export const SAVE_BATCH_SCRIPT = `
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
local fp = redis.call('HGET', KEYS[1], 'fp')
if fp and fp ~= ARGV[1] then redis.call('DEL', KEYS[1]) end
redis.call('HSET', KEYS[1], 'fp', ARGV[1], ARGV[2], ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
return 1
`;

const FIELD = /^b(\d+)$/;

const isBatchResult = (value: unknown): value is BatchResult => {
  const v = value as Partial<BatchResult> | null;

  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.index === 'number' &&
    typeof v.model === 'string' &&
    Array.isArray(v.security) &&
    Array.isArray(v.performance) &&
    Array.isArray(v.code_quality)
  );
};

@Injectable()
export class ReviewCheckpointStore {
  private readonly logger = new Logger(ReviewCheckpointStore.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Never throws: a lost checkpoint costs calls on a retry, not the review. Empty when absent, stale or unreadable. */
  async load(ref: CheckpointRef, fingerprint: string): Promise<Map<number, BatchResult>> {
    const found = new Map<number, BatchResult>();

    try {
      const hash = await this.redis.hgetall(this.key(ref));

      if (hash['fp'] !== fingerprint) {
        return found;
      }

      for (const [field, value] of Object.entries(hash)) {
        const match = FIELD.exec(field);

        if (!match) {
          continue;
        }

        const parsed: unknown = JSON.parse(value);

        if (isBatchResult(parsed)) {
          found.set(Number(match[1]), parsed);
        }
      }
    } catch (error) {
      this.logger.warn(`Review checkpoint read failed (${this.describe(ref)}): ${this.messageOf(error)}`);

      return new Map();
    }

    return found;
  }

  /** Never throws. Returns whether it was written; false while the owner's account is being erased, or on a Redis failure. */
  async save(ref: CheckpointRef, fingerprint: string, result: BatchResult): Promise<boolean> {
    try {
      const saved = await this.redis.eval(
        SAVE_BATCH_SCRIPT,
        2,
        this.key(ref),
        erasureMarkerKey(ref.ownerId),
        fingerprint,
        `b${result.index}`,
        JSON.stringify(result),
        CHECKPOINT_TTL_SECONDS,
      );

      return Number(saved) === 1;
    } catch (error) {
      this.logger.warn(`Review checkpoint save failed (${this.describe(ref)}): ${this.messageOf(error)}`);

      return false;
    }
  }

  /** Called when a review has finished, so a later re-analyze of the same diff starts fresh. Never throws. */
  async clear(ref: CheckpointRef): Promise<void> {
    try {
      await this.redis.del(this.key(ref));
    } catch (error) {
      this.logger.warn(`Review checkpoint delete failed (${this.describe(ref)}): ${this.messageOf(error)}`);
    }
  }

  /**
   * For account erasure. Unlike `clear`, this throws: the caller is about to
   * tell someone their data is gone and must not if it is not.
   */
  async purgeOwner(ownerId: number): Promise<void> {
    let cursor = '0';

    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', `review-batches:${ownerId}:*`, 'COUNT', 100);

      if (keys.length > 0) {
        await this.redis.del(...keys);
      }

      cursor = next;
    } while (cursor !== '0');
  }

  private key(ref: CheckpointRef): string {
    return `review-batches:${ref.ownerId}:${ref.kind}:${ref.id}`;
  }

  private describe(ref: CheckpointRef): string {
    return `${ref.kind}_id=${ref.id}`;
  }

  private messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
```

Create `prism-api/src/modules/review/review-checkpoint.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ReviewCheckpointStore } from './review-checkpoint.store';

/** Its own module so account erasure can import the store without importing the whole review pipeline. Redis is global. */
@Module({
  providers: [ReviewCheckpointStore],
  exports: [ReviewCheckpointStore],
})
export class ReviewCheckpointModule {}
```

Wire erasure (the comment edit "for two hours" anticipates Task 9's marker change):

```diff
diff --git a/prism-api/src/modules/account/account-data.service.ts b/prism-api/src/modules/account/account-data.service.ts
--- a/prism-api/src/modules/account/account-data.service.ts
+++ b/prism-api/src/modules/account/account-data.service.ts
@@ -6,6 +6,7 @@ import { PullRequest, type User } from '../../database/entities';
 import { summarise, type BlueprintSummary } from '../../design/blueprint';
 import { DesignStore } from '../design/design.store';
 import { REDIS_CLIENT } from '../../redis/redis.constants';
+import { ReviewCheckpointStore } from '../review/review-checkpoint.store';
 import { ReviewRiskStore } from '../risk/review-risk.store';
 import { ERASURE_MARKER_TTL_SECONDS, erasureMarkerKey } from './erasure-marker';
 
@@ -28,6 +29,7 @@ export class AccountDataService {
     private readonly designs: DesignStore,
     private readonly reviewedRisk: ReviewRiskStore,
     @Inject(REDIS_CLIENT) private readonly redis: Redis,
+    private readonly checkpoints: ReviewCheckpointStore,
   ) {}
 
   /**
@@ -39,7 +41,7 @@ export class AccountDataService {
    * so work in flight cannot re-create what is being erased, and it is removed
    * if any step fails, because an attempt that failed has not deleted the
    * account: left in place, the marker would make the surviving account refuse
-   * new designs and skip saving review risk for an hour.
+   * new designs and skip saving review risk for two hours.
    *
    * On success it is left to expire on its own. The user id is never reused
    * and a review still running for it may yet try to save; the marker is what
@@ -58,6 +60,8 @@ export class AccountDataService {
 
       await this.reviewedRisk.purge(ids);
       await this.designs.purgeOwner(user.id);
+      // Finished batches of reviews in progress: findings about the user's code.
+      await this.checkpoints.purgeOwner(user.id);
       await deleteRows();
     } catch (error) {
       this.logger.error(
```

```diff
diff --git a/prism-api/src/modules/account/account-data.module.ts b/prism-api/src/modules/account/account-data.module.ts
--- a/prism-api/src/modules/account/account-data.module.ts
+++ b/prism-api/src/modules/account/account-data.module.ts
@@ -2,11 +2,12 @@ import { Module } from '@nestjs/common';
 import { TypeOrmModule } from '@nestjs/typeorm';
 import { PullRequest } from '../../database/entities';
 import { DesignModule } from '../design/design.module';
+import { ReviewCheckpointModule } from '../review/review-checkpoint.module';
 import { RiskModule } from '../risk/risk.module';
 import { AccountDataService } from './account-data.service';
 
 @Module({
-  imports: [TypeOrmModule.forFeature([PullRequest]), DesignModule, RiskModule],
+  imports: [TypeOrmModule.forFeature([PullRequest]), DesignModule, RiskModule, ReviewCheckpointModule],
   providers: [AccountDataService],
   exports: [AccountDataService],
 })
```

- [x] **Step 4: Run to verify they pass**

Run: `npm test -- src/modules/review/review-checkpoint src/modules/account && npm run typecheck`
Expected: PASS (`review-checkpoint.store.spec.ts` 8 tests; the account specs, including `erasure-marker.spec.ts`, green).

- [x] **Step 5: Run the Lua once against a LOCAL Redis**

The Lua is the one part a mock cannot test. Only if a local Redis answers (`redis-cli -h 127.0.0.1 ping` prints `PONG`; the dev containers in `docs/development.md` use port 56379, so use `-p 56379` if that is yours), run from `prism-api/`, with the port adjusted to your instance:

```bash
cat > lua-check.tmp.js <<'EOF'
const Redis = require('ioredis');
require('ts-node/register/transpile-only');
const { SAVE_BATCH_SCRIPT } = require('./src/modules/review/review-checkpoint.store.ts');
(async () => {
  const r = new Redis({ host: '127.0.0.1', port: 6379 });
  const k = 'review-batches:999999:pr:1', m = 'account:erased:999999';
  await r.del(k, m);
  console.log('save1', await r.eval(SAVE_BATCH_SCRIPT, 2, k, m, 'fpA', 'b0', '{"a":1}', 60));
  console.log('save2', await r.eval(SAVE_BATCH_SCRIPT, 2, k, m, 'fpA', 'b1', '{"a":2}', 60), await r.hgetall(k));
  console.log('newfp', await r.eval(SAVE_BATCH_SCRIPT, 2, k, m, 'fpB', 'b0', '{"a":3}', 60), await r.hgetall(k), await r.ttl(k));
  await r.set(m, '1', 'EX', 30);
  console.log('refused', await r.eval(SAVE_BATCH_SCRIPT, 2, k, m, 'fpB', 'b2', '{}', 60));
  await r.del(k, m); r.disconnect();
})();
EOF
node lua-check.tmp.js; rm lua-check.tmp.js
```
Expected output:
```
save1 1
save2 1 { fp: 'fpA', b0: '{"a":1}', b1: '{"a":2}' }
newfp 1 { fp: 'fpB', b0: '{"a":3}' } 60
refused 0
```
(The author saw exactly this.) The file is deleted by the command; do not commit it. If no Redis is up, skip and write "Lua not run against Redis" in the final report.

- [x] **Step 6: Commit**

```bash
git add prism-api/src/modules/review/review-checkpoint.store.ts prism-api/src/modules/review/review-checkpoint.store.spec.ts prism-api/src/modules/review/review-checkpoint.module.ts prism-api/src/modules/account/account-data.service.ts prism-api/src/modules/account/account-data.service.spec.ts prism-api/src/modules/account/account-data.module.ts
git commit -m "Checkpoint finished batches in Redis, erasable with the account" -m "A review of several paid, rate-limited calls can fail after most of them succeeded; the retry must resume, not pay again. The store writes through the erasure-marker script and AccountDataService purges it, because it holds findings about a user's code."
```

---

### Task 6: The batched review service

**Files:**
- Create: `prism-api/src/modules/review/batched-review.service.ts`, `batched-review.service.spec.ts`, `batched-review.testing.ts`
- Modify: `prism-api/src/modules/review/review.module.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 to 5; `AiClientService.callWithFallback(system, user, context, signal, {userId})` and `RateLimitedError`; `PromptBuilderService.buildSystemPrompt(languages, target)`; `UserAiSettingsService.resolve(userId)`; `validateLayers`, `droppedCount`; `FixesService.layersFrom`; `clampScore`.
- Produces:
  - `interface BatchedReviewInput { diffBody; languages: string[]; target: ReviewTarget; lead: string; context: AiCallContext; ref: CheckpointRef; risk: RiskAssessment | null; signal?: AbortSignal }`
  - `type BatchedOutcome = { status: 'reviewed'; merged: MergedReview; selection: Selection; index: HunkIndex; coverageRatio: number; coverage: string | null; stopped: 'rate_limited' | null; batches: { total: number; reviewed: number } } | { status: 'unusable'; raw: string | null; model: string | null }`
  - `class BatchedReviewService { review(input): Promise<BatchedOutcome>; finish(ref: CheckpointRef): Promise<void> }`; `BATCH_REVIEW_OPTIONS` (optional DI token for overrides)
  - test helpers: `InMemoryCheckpoints`, `fakeClock()`, `buildBatchedReview(aiClient, overrides?, checkpoints?)`

- [x] **Step 1: Write the failing tests**

Create the shared test doubles `prism-api/src/modules/review/batched-review.testing.ts` (Jest never runs it; it is compiled into `dist` like any `src` file, which is accepted):

```ts
import type { BatchResult } from '../../ai/batch-merge';
import { PromptBuilderService } from '../../ai/prompt-builder.service';
import type { PaceClock } from '../../ai/token-pacer';
import { BatchedReviewService, type BatchReviewOptions } from './batched-review.service';
import type { CheckpointRef } from './review-checkpoint.store';

/**
 * Test doubles for the batched review, shared by the service's own spec and the
 * two runners' specs. Not part of the application; Jest never runs this file.
 */
export class InMemoryCheckpoints {
  readonly saved = new Map<string, Map<number, BatchResult>>();
  readonly cleared: string[] = [];

  private key(ref: CheckpointRef): string {
    return `${ref.kind}:${ref.id}`;
  }

  load(ref: CheckpointRef): Promise<Map<number, BatchResult>> {
    return Promise.resolve(new Map(this.saved.get(this.key(ref)) ?? []));
  }

  save(ref: CheckpointRef, _fingerprint: string, result: BatchResult): Promise<boolean> {
    const batches = this.saved.get(this.key(ref)) ?? new Map<number, BatchResult>();

    batches.set(result.index, result);
    this.saved.set(this.key(ref), batches);

    return Promise.resolve(true);
  }

  clear(ref: CheckpointRef): Promise<void> {
    this.cleared.push(this.key(ref));
    this.saved.delete(this.key(ref));

    return Promise.resolve();
  }
}

export function fakeClock(): PaceClock & { time: number; slept: number[] } {
  const clock = {
    time: 0,
    slept: [] as number[],
    now: () => clock.time,
    sleep: (ms: number) => {
      clock.slept.push(ms);
      clock.time += ms;

      return Promise.resolve();
    },
  };

  return clock;
}

/** A real service with a fake clock, no pacing, no own key and in-memory checkpoints. */
export function buildBatchedReview(
  aiClient: unknown,
  overrides: Partial<BatchReviewOptions> = {},
  checkpoints: InMemoryCheckpoints = new InMemoryCheckpoints(),
): { service: BatchedReviewService; checkpoints: InMemoryCheckpoints; clock: ReturnType<typeof fakeClock> } {
  const clock = fakeClock();
  const service = new BatchedReviewService(
    aiClient as never,
    new PromptBuilderService(),
    { resolve: jest.fn().mockResolvedValue(null) } as never,
    checkpoints as never,
    {
      clock,
      groqPace: {
        tokensPerMinute: Number.POSITIVE_INFINITY,
        charsPerToken: 3.5,
        promptOverheadTokens: 800,
        assumedOutputTokens: 1200,
        maxWaitMs: 60_000,
      },
      ...overrides,
    },
  );

  return { service, checkpoints, clock };
}
```

Create `prism-api/src/modules/review/batched-review.service.spec.ts`:

```ts
import { RateLimitedError } from '../../ai/ai-client.service';
import { buildBatchedReview, InMemoryCheckpoints } from './batched-review.testing';
import type { BatchedReviewInput } from './batched-review.service';

/** About 1,250 characters per file: with batchChars 1500, one file per batch. */
const file = (name: string): string =>
  `diff --git a/${name} b/${name}\n--- a/${name}\n+++ b/${name}\n@@ -1,1 +1,71 @@\n ctx\n` +
  Array.from({ length: 70 }, (_, i) => `+const v${i} = ${i};`).join('\n') +
  '\n';

const diffOf = (...names: string[]): string => names.map(file).join('');
const REF = { kind: 'pr', id: 1, ownerId: 5 } as const;
const OPTIONS = { config: { batchChars: 1500, maxBatches: 3 } };

const input = (diffBody: string, extra: Partial<BatchedReviewInput> = {}): BatchedReviewInput => ({
  diffBody,
  languages: ['TypeScript'],
  target: 'pull request',
  lead: 'Review this diff',
  context: 'pr_review',
  ref: REF,
  risk: null,
  ...extra,
});

/** A model that reports its batch's first changed line, found through the anchor in the message. */
function model(extra: Record<string, unknown> = {}) {
  return jest.fn(async (_system: string, user: string) => {
    const anchor = /\[(\d+)\]/.exec(user)?.[1];

    return {
      model: 'groq/test',
      raw: null,
      parsed: {
        overall_score: 90,
        summary: 'ok',
        code_quality_issues: [
          { line: Number(anchor), category: 'other', severity: 'warning', comment: 'check this' },
        ],
        ...extra,
      },
    };
  });
}

describe('BatchedReviewService', () => {
  it('makes one call per batch and says which part each is, but nothing extra for a single batch', async () => {
    const ai = { callWithFallback: model() };
    const { service } = buildBatchedReview(ai, OPTIONS);

    await service.review(input(diffOf('a.ts', 'b.ts')));

    expect(ai.callWithFallback).toHaveBeenCalledTimes(2);
    expect(ai.callWithFallback.mock.calls[1]?.[1]).toContain('Review this diff (part 2 of 2 of one change');

    const single = { callWithFallback: model() };

    await buildBatchedReview(single, OPTIONS).service.review(input(diffOf('a.ts')));

    expect(single.callWithFallback.mock.calls[0]?.[1].startsWith('Review this diff:\n')).toBe(true);
  });

  it('validates each batch against its own anchors, so every finding lands in its own file', async () => {
    const { service } = buildBatchedReview({ callWithFallback: model() }, OPTIONS);
    const outcome = await service.review(input(diffOf('a.ts', 'b.ts', 'c.ts')));

    if (outcome.status !== 'reviewed') throw new Error('expected a review');

    // Every batch's first anchor is [1]; only per-batch maps keep these three apart.
    expect(outcome.merged.layers.code_quality.map((i) => i.file)).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(outcome.merged.dropped).toBe(0);
    expect(outcome.coverageRatio).toBe(1);
    expect(outcome.coverage).toBeNull();
  });

  it('rejects an anchor id that only exists in another batch', async () => {
    const ai = {
      callWithFallback: jest.fn(async (_s: string, user: string) => ({
        model: 'groq/test',
        raw: null,
        // Batch 2 cites an id that exists only in a longer batch 1.
        parsed: {
          overall_score: 80,
          summary: 's',
          code_quality_issues: [{ line: user.includes('part 2') ? 71 : 1, category: 'other', severity: 'warning', comment: 'c' }],
        },
      })),
    };
    const { service } = buildBatchedReview(ai, OPTIONS);
    const outcome = await service.review(input(diffOf('a.ts', 'b.ts')));

    if (outcome.status !== 'reviewed') throw new Error('expected a review');

    // Batch 1's finding resolves; batch 2's [71] is unknown in batch 2's own map and is dropped.
    expect(outcome.merged.layers.code_quality).toHaveLength(1);
    expect(outcome.merged.dropped).toBe(1);
  });

  it('reports the files past the cap through the coverage ratio and sentence', async () => {
    const { service } = buildBatchedReview({ callWithFallback: model() }, OPTIONS);
    const outcome = await service.review(input(diffOf('a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts')));

    if (outcome.status !== 'reviewed') throw new Error('expected a review');

    expect(outcome.batches).toEqual({ total: 3, reviewed: 3 });
    expect(outcome.coverageRatio).toBeCloseTo(0.6);
    expect(outcome.coverage).toBe('Reviewed 3 of 5 changed files.');
  });

  it('resumes from checkpoints instead of repeating paid calls', async () => {
    const ai = { callWithFallback: model() };
    const checkpoints = new InMemoryCheckpoints();
    const first = buildBatchedReview({ callWithFallback: model() }, OPTIONS, checkpoints);

    await first.service.review(input(diffOf('a.ts', 'b.ts', 'c.ts')));
    checkpoints.saved.get('pr:1')?.delete(2);

    const outcome = await buildBatchedReview(ai, OPTIONS, checkpoints).service.review(input(diffOf('a.ts', 'b.ts', 'c.ts')));

    expect(ai.callWithFallback).toHaveBeenCalledTimes(1);
    expect(ai.callWithFallback.mock.calls[0]?.[1]).toContain('part 3 of 3');
    expect(outcome.status === 'reviewed' && outcome.merged.kept).toBe(3);
  });

  it('saves each batch before the next call, so a failure on batch 3 loses nothing', async () => {
    const ai = {
      callWithFallback: jest
        .fn()
        .mockImplementationOnce(model())
        .mockImplementationOnce(model())
        .mockRejectedValueOnce(new Error('socket hang up')),
    };
    const { service, checkpoints } = buildBatchedReview(ai, OPTIONS);

    await expect(service.review(input(diffOf('a.ts', 'b.ts', 'c.ts')))).rejects.toThrow('socket hang up');
    expect([...(checkpoints.saved.get('pr:1')?.keys() ?? [])]).toEqual([0, 1]);
  });

  it('ends partial, with what exists, when a rate limit hits after the first batch', async () => {
    const ai = {
      callWithFallback: jest.fn().mockImplementationOnce(model()).mockRejectedValueOnce(new RateLimitedError('groq/x')),
    };
    const { service } = buildBatchedReview(ai, OPTIONS);
    const outcome = await service.review(input(diffOf('a.ts', 'b.ts', 'c.ts')));

    if (outcome.status !== 'reviewed') throw new Error('expected a review');

    expect(outcome.stopped).toBe('rate_limited');
    expect(outcome.batches).toEqual({ total: 3, reviewed: 1 });
    expect(outcome.coverageRatio).toBeCloseTo(1 / 3);
    expect(outcome.coverage).toBe('Reviewed 1 of 3 changed files.');
  });

  it('throws when the very first batch is rate limited, so BullMQ backs off as before', async () => {
    const ai = { callWithFallback: jest.fn().mockRejectedValue(new RateLimitedError('groq/x')) };

    await expect(buildBatchedReview(ai, OPTIONS).service.review(input(diffOf('a.ts', 'b.ts')))).rejects.toBeInstanceOf(
      RateLimitedError,
    );
  });

  it('reports nothing usable when no batch parsed, with the last raw text', async () => {
    const ai = { callWithFallback: jest.fn().mockResolvedValue({ model: 'groq/x', parsed: null, raw: 'oops' }) };
    const outcome = await buildBatchedReview(ai, OPTIONS).service.review(input(diffOf('a.ts', 'b.ts')));

    expect(outcome).toEqual({ status: 'unusable', raw: 'oops', model: 'groq/x' });
  });

  it('skips a batch that times out and lowers coverage instead of failing the review', async () => {
    const ai = {
      callWithFallback: jest.fn(async (_s: string, user: string, _c: string, signal: AbortSignal) => {
        if (user.includes('part 2')) {
          await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error(String(signal.reason)))));
        }

        return model()(_s, user);
      }),
    };
    const { service } = buildBatchedReview(ai, { ...OPTIONS, batchTimeoutMs: 20 });
    const outcome = await service.review(input(diffOf('a.ts', 'b.ts', 'c.ts')));

    if (outcome.status !== 'reviewed') throw new Error('expected a review');

    expect(outcome.batches).toEqual({ total: 3, reviewed: 2 });
    expect(outcome.selection.skipped).toEqual(['b.ts']);
  });

  it('stops at once when the job deadline passes, before another paid call or save', async () => {
    const controller = new AbortController();
    const ai = {
      callWithFallback: jest.fn(async (...args: [string, string]) => {
        controller.abort(new Error('job budget spent'));

        return model()(...args);
      }),
    };
    const { service, checkpoints } = buildBatchedReview(ai, OPTIONS);

    await expect(
      service.review(input(diffOf('a.ts', 'b.ts', 'c.ts'), { signal: controller.signal })),
    ).rejects.toThrow('job budget spent');
    expect(ai.callWithFallback).toHaveBeenCalledTimes(1);
    expect(checkpoints.saved.size).toBe(0);
  });

  it('paces the second large batch against the per-minute allowance', async () => {
    const ai = { callWithFallback: model() };
    const { service, clock } = buildBatchedReview(ai, {
      config: { batchChars: 16_000, maxBatches: 3 },
      groqPace: {
        tokensPerMinute: 4000,
        charsPerToken: 3.5,
        promptOverheadTokens: 800,
        assumedOutputTokens: 1200,
        maxWaitMs: 60_000,
      },
    });
    // About 8,000 characters each: two do not fit one 16,000-character batch, so each gets its own call.
    const big = (name: string): string => `${file(name)}+${'x'.repeat(7000)}\n`;

    await service.review(input(big('a.ts') + big('b.ts') + big('c.ts')));

    expect(clock.slept.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps the checkpoint out of a re-analyze: finish() clears it', async () => {
    const { service, checkpoints } = buildBatchedReview({ callWithFallback: model() }, OPTIONS);

    await service.finish(REF);

    expect(checkpoints.cleared).toEqual(['pr:1']);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `npm test -- src/modules/review/batched-review`
Expected: FAIL, `Cannot find module './batched-review.service'`.

- [x] **Step 3: Implement**

Create `prism-api/src/modules/review/batched-review.service.ts`:

```ts
import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AiClientService, RateLimitedError, type AiCallContext, type FallbackAiResult } from '../../ai/ai-client.service';
import { mergeBatchResults, type BatchResult, type MergedReview } from '../../ai/batch-merge';
import { droppedCount, validateLayers } from '../../ai/issue-validator';
import { clampScore } from '../../ai/json-extractor';
import { PromptBuilderService, type ReviewTarget } from '../../ai/prompt-builder.service';
import { FixesService } from '../../ai/fixes.service';
import { TokenPacer, systemClock, type PaceClock, type PaceProfile } from '../../ai/token-pacer';
import { UserAiSettingsService } from '../../ai/user-ai-settings.service';
import { packForReview, selectionFor, type BatchConfig } from '../../diff/batch-pack';
import { coverageRatio, type Selection } from '../../diff/file-selection';
import { mergeHunkIndexes, type HunkIndex } from '../../diff/hunk-index';
import { coverageSentence, prepareBatch } from '../../diff/prepare';
import type { RiskAssessment } from '../../diff/risk-radar';
import { riskRankOf } from '../../diff/risk-rank';
import {
  BATCH_CONFIG,
  BATCH_WORST_CASE_MS,
  CHECKPOINT_VERSION,
  GROQ_FREE_PACE,
  MAX_MERGED_FINDINGS,
  OWN_KEY_PACE,
} from './batching.config';
import { ReviewCheckpointStore, type CheckpointRef } from './review-checkpoint.store';

/**
 * Reviews every reviewable file of a change: one model call per batch, each
 * validated against its own anchors, merged into one result.
 *
 * Both runners call this and only this for the review pass, which is what keeps
 * `pr-review.runner.ts` and `commit-review.runner.ts` from drifting apart over
 * the new logic. They still own their persistence, comment text and
 * notifications.
 *
 * The rules, each with the reason it exists:
 *  - Anchors are per batch. A finding is accepted only if it names an anchor
 *    shown in the same call, so validation is as strict as ADR 0006 (an id from
 *    another batch is unknown).
 *  - Nothing paid is repeated. Each validated batch is checkpointed before the
 *    next call, so a retry resumes. Saving is idempotent.
 *  - The job deadline (`signal`) is checked before every call and every save,
 *    and a retry is safe at any of those points.
 *  - A 429 that outlasts the model chain ends the review with what exists. If
 *    nothing exists yet it throws, so BullMQ's backoff retries as it always did.
 *  - A batch that times out or returns nothing usable is skipped, not fatal;
 *    coverage then says so honestly.
 */
export interface BatchedReviewInput {
  diffBody: string;
  languages: string[];
  target: ReviewTarget;
  /** "Review this diff" or "Review this commit diff": the sentence the single-call message always began with. */
  lead: string;
  context: AiCallContext;
  ref: CheckpointRef;
  /** For ordering files by risk when the change is over the call cap. */
  risk: RiskAssessment | null;
  signal?: AbortSignal;
}

export type BatchedOutcome =
  | {
      status: 'reviewed';
      merged: MergedReview;
      /** What the model saw, whole or in part. Feeds the fixes pass and the coverage text. */
      selection: Selection;
      index: HunkIndex;
      coverageRatio: number;
      coverage: string | null;
      /** Set when a rate limit ended the review early. */
      stopped: 'rate_limited' | null;
      batches: { total: number; reviewed: number };
    }
  | {
      /** No batch produced a usable review: the runners write the "not reviewed" summary. */
      status: 'unusable';
      raw: string | null;
      model: string | null;
    };

export interface BatchReviewOptions {
  config: BatchConfig;
  clock: PaceClock;
  groqPace: PaceProfile;
  ownKeyPace: PaceProfile;
  maxFindings: number;
  batchTimeoutMs: number;
}

export const BATCH_REVIEW_OPTIONS = Symbol('BATCH_REVIEW_OPTIONS');

@Injectable()
export class BatchedReviewService {
  private readonly logger = new Logger(BatchedReviewService.name);
  private readonly options: BatchReviewOptions;

  constructor(
    private readonly aiClient: AiClientService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly userAi: UserAiSettingsService,
    private readonly checkpoints: ReviewCheckpointStore,
    @Optional() @Inject(BATCH_REVIEW_OPTIONS) overrides?: Partial<BatchReviewOptions>,
  ) {
    this.options = {
      config: BATCH_CONFIG,
      clock: systemClock,
      groqPace: GROQ_FREE_PACE,
      ownKeyPace: OWN_KEY_PACE,
      maxFindings: MAX_MERGED_FINDINGS,
      batchTimeoutMs: BATCH_WORST_CASE_MS,
      ...overrides,
    };
  }

  async review(input: BatchedReviewInput): Promise<BatchedOutcome> {
    const { signal } = input;
    const packed = packForReview(input.diffBody, this.options.config, riskRankOf(input.risk));
    const total = packed.batches.length;
    const fingerprint = this.fingerprint(input.diffBody);
    const saved = await this.checkpoints.load(input.ref, fingerprint);
    const system = this.promptBuilder.buildSystemPrompt(input.languages, input.target);
    const own = await this.userAi.resolve(input.ref.ownerId);
    const pacer = new TokenPacer(own ? this.options.ownKeyPace : this.options.groqPace, this.options.clock);
    const results: BatchResult[] = [];
    const indexes: HunkIndex[] = [];
    let stopped: 'rate_limited' | null = null;
    let rateLimit: RateLimitedError | null = null;
    let lastRaw: string | null = null;
    let lastModel: string | null = null;

    for (const batch of packed.batches) {
      const prepared = prepareBatch(batch.text);
      const cached = saved.get(batch.index);

      if (cached) {
        results.push(cached);
        indexes.push(prepared.index);
        continue;
      }

      signal?.throwIfAborted();
      await pacer.acquire(pacer.estimate(prepared.body.length), signal);

      const deadline = AbortSignal.timeout(this.options.batchTimeoutMs);
      const batchSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
      let answer: FallbackAiResult;

      try {
        answer = await this.aiClient.callWithFallback(
          system,
          this.userMessage(input.lead, batch.index, total, prepared.body),
          input.context,
          batchSignal,
          { userId: input.ref.ownerId },
        );
      } catch (error) {
        // The whole job is out of budget: stop, the retry resumes from the checkpoints.
        if (signal?.aborted) {
          throw error;
        }

        if (error instanceof RateLimitedError) {
          stopped = 'rate_limited';
          rateLimit = error;
          break;
        }

        if (deadline.aborted) {
          this.logger.warn(`Batch ${batch.index + 1} of ${total} timed out (${input.ref.kind}_id=${input.ref.id})`);
          continue;
        }

        throw error;
      }

      lastModel = answer.model ?? lastModel;

      if (!answer.parsed) {
        lastRaw = answer.raw;
        continue;
      }

      // Checked against THIS batch's anchors only.
      const layers = validateLayers(FixesService.layersFrom(answer.parsed), prepared.anchors);
      const dropped = droppedCount(layers);
      const result: BatchResult = {
        index: batch.index,
        model: answer.model ?? 'multi-fallback',
        security: layers.security,
        performance: layers.performance,
        code_quality: layers.code_quality,
        dropped,
        score: clampScore(answer.parsed.overall_score),
        summary: typeof answer.parsed.summary === 'string' ? answer.parsed.summary : null,
      };

      if (dropped > 0) {
        this.logger.log(
          `issue_validation ${JSON.stringify({
            [`${input.ref.kind}_id`]: input.ref.id,
            batch: batch.index + 1,
            kept: layers.kept,
            dropped,
            reasons: layers.reasons,
          })}`,
        );
      }

      // Safe to repeat: the same batch saved twice writes the same field.
      signal?.throwIfAborted();
      await this.checkpoints.save(input.ref, fingerprint, result);
      results.push(result);
      indexes.push(prepared.index);
    }

    if (results.length === 0) {
      // Nothing reviewed because the provider would not talk to us: fail the
      // attempt so the existing backoff retries it (known issue T13 unchanged).
      if (rateLimit) {
        throw rateLimit;
      }

      return { status: 'unusable', raw: lastRaw, model: lastModel };
    }

    const selection = selectionFor(packed, new Set(results.map((r) => r.index)));

    if (stopped) {
      this.logger.warn(
        `Review ended early by a rate limit with ${results.length} of ${total} batches (${input.ref.kind}_id=${input.ref.id})`,
      );
    }

    return {
      status: 'reviewed',
      merged: mergeBatchResults(results, this.options.maxFindings),
      selection,
      index: mergeHunkIndexes(indexes),
      coverageRatio: coverageRatio(selection),
      coverage: coverageSentence(selection),
      stopped,
      batches: { total, reviewed: results.length },
    };
  }

  /** Called once the review is finished, so re-analyzing the same diff starts fresh. */
  finish(ref: CheckpointRef): Promise<void> {
    return this.checkpoints.clear(ref);
  }

  /** One batch reads exactly as the single-call message always did; several say which part they are. */
  private userMessage(lead: string, index: number, total: number, body: string): string {
    const part = total > 1 ? ` (part ${index + 1} of ${total} of one change; the other parts are reviewed separately)` : '';

    return `${lead}${part}:\n${body}`;
  }

  /** The diff and the batching settings: a new push or a retuned size never resumes from batches cut differently. */
  private fingerprint(diffBody: string): string {
    const { batchChars, maxBatches } = this.options.config;

    return createHash('sha256')
      .update(`${CHECKPOINT_VERSION}|${batchChars}|${maxBatches}|`)
      .update(diffBody)
      .digest('hex')
      .slice(0, 16);
  }
}
```

Register it (and the checkpoint module) in `prism-api/src/modules/review/review.module.ts`:

```diff
diff --git a/prism-api/src/modules/review/review.module.ts b/prism-api/src/modules/review/review.module.ts
--- a/prism-api/src/modules/review/review.module.ts
+++ b/prism-api/src/modules/review/review.module.ts
@@ -10,6 +10,8 @@ import { NotificationsModule } from '../../notifications/notifications.module';
 import { RiskModule } from '../risk/risk.module';
 import { CommitReviewRunner } from './commit-review.runner';
 import { PullRequestReviewRunner } from './pr-review.runner';
+import { BatchedReviewService } from './batched-review.service';
+import { ReviewCheckpointModule } from './review-checkpoint.module';
 import { ReviewProcessor } from './review.processor';
 import { ReviewQueueService } from './review-queue.service';
 import { REVIEW_JOB_OPTIONS, REVIEW_QUEUE } from './review.queue';
@@ -30,9 +32,11 @@ import { SummaryCommentBuilder } from './summary-comment.builder';
     DiffCacheModule,
     AuditModule,
     RiskModule,
+    ReviewCheckpointModule,
   ],
   providers: [
     ReviewProcessor,
+    BatchedReviewService,
     CommitReviewRunner,
     PullRequestReviewRunner,
     SummaryCommentBuilder,
```

- [x] **Step 4: Run to verify it passes**

Run: `npm test -- src/modules/review/batched-review && npm run typecheck`
Expected: PASS, `Tests: 13 passed, 13 total`.

- [x] **Step 5: Commit**

```bash
git add prism-api/src/modules/review/batched-review.service.ts prism-api/src/modules/review/batched-review.service.spec.ts prism-api/src/modules/review/batched-review.testing.ts prism-api/src/modules/review/review.module.ts
git commit -m "Add the service that reviews a change batch by batch" -m "Both runners need the same loop: per-batch anchors and validation, pacing, a checkpoint after each paid call, a clean end on a 429, and a Selection built from the batches that actually completed. Putting it in one service keeps the near-parallel runners from drifting."
```

---

### Task 7: Use the service in the pull-request runner

**Files:**
- Modify: `prism-api/src/modules/review/pr-review.runner.ts`, `prism-api/src/modules/review/pr-review.runner.spec.ts`

**Interfaces:**
- Consumes: `BatchedReviewService` (Task 6), `detectLanguages` (`diff/language-detector.ts`).
- Produces: `PullRequestReviewRunner` constructor is now `(pullRequests, reviews, reviewComments, batched, fixes, github, diffCache, crypt, summaryComment, slack, auditLog, reviewedRisk)` (the old `aiClient` and `promptBuilder` parameters are replaced by `batched`). Behaviour: the same states as before, with coverage from `outcome.coverageRatio`.

- [x] **Step 1: Update the spec** (three constructions swap the fake client and prompt builder for `buildBatchedReview(...)`; the old "withholds the score" test now uses a one-batch cap; a new test proves a multi-batch review keeps its score and shows no label):

```diff
diff --git a/prism-api/src/modules/review/pr-review.runner.spec.ts b/prism-api/src/modules/review/pr-review.runner.spec.ts
--- a/prism-api/src/modules/review/pr-review.runner.spec.ts
+++ b/prism-api/src/modules/review/pr-review.runner.spec.ts
@@ -1,4 +1,4 @@
-import { PromptBuilderService } from '../../ai/prompt-builder.service';
+import { buildBatchedReview } from './batched-review.testing';
 import * as riskRadar from '../../diff/risk-radar';
 import { PullRequestReviewRunner } from './pr-review.runner';
 import { PARTIAL_REVIEW } from '../../ai/verdict';
@@ -69,14 +69,13 @@ describe('PullRequestReviewRunner language detection', () => {
       pullRequests as never,
       reviews as never,
       reviewComments as never,
-      {
+      buildBatchedReview({
         callWithFallback: jest.fn().mockResolvedValue({
           model: 'groq/test',
           parsed: { overall_score: 80, summary: 's' },
           raw: null,
         }),
-      } as never,
-      new PromptBuilderService(),
+      }).service,
       { generate: jest.fn().mockResolvedValue(null) } as never,
       {
         fetchPullRequestDiff: jest.fn().mockResolvedValue(diff),
@@ -150,10 +149,9 @@ describe('PullRequestReviewRunner reviewed-revision risk', () => {
       pullRequests as never,
       reviews as never,
       reviewComments as never,
-      {
+      buildBatchedReview({
         callWithFallback: jest.fn().mockResolvedValue({ model: 'groq/test', parsed, raw: parsed ? null : 'garbled' }),
-      } as never,
-      new PromptBuilderService(),
+      }).service,
       { generate: jest.fn().mockResolvedValue(null) } as never,
       github as never,
       {
@@ -213,7 +211,7 @@ describe('PullRequestReviewRunner coverage', () => {
     Array.from({ length: lines }, (_, i) => `+const ${name}${i} = ${i};`).join('\n') +
     '\n';
 
-  function build(diff: string) {
+  function build(diff: string, config = { batchChars: 16_000, maxBatches: 8 }) {
     const pullRequests = repo();
     const reviews = repo();
 
@@ -230,18 +228,16 @@ describe('PullRequestReviewRunner coverage', () => {
     reviews.findOne.mockResolvedValue(null);
     reviews.save.mockResolvedValue({ id: 99 });
 
+    const callWithFallback = jest.fn().mockResolvedValue({
+      model: 'groq/test',
+      parsed: { overall_score: 95, summary: 'Looks fine.', issues: [] },
+      raw: null,
+    });
     const runner = new PullRequestReviewRunner(
       pullRequests as never,
       reviews as never,
       repo() as never,
-      {
-        callWithFallback: jest.fn().mockResolvedValue({
-          model: 'groq/test',
-          parsed: { overall_score: 95, summary: 'Looks fine.', issues: [] },
-          raw: null,
-        }),
-      } as never,
-      new PromptBuilderService(),
+      buildBatchedReview({ callWithFallback }, { config }).service,
       { generate: jest.fn().mockResolvedValue(null) } as never,
       {
         fetchPullRequestDiff: jest.fn().mockResolvedValue(diff),
@@ -258,12 +254,13 @@ describe('PullRequestReviewRunner coverage', () => {
       { save: jest.fn().mockResolvedValue(undefined), forget: jest.fn().mockResolvedValue(undefined) } as never,
     );
 
-    return { runner, reviews };
+    return { runner, reviews, callWithFallback };
   }
 
-  it('withholds the score and marks the summary when most of the change was not read', async () => {
+  it('withholds the score and marks the summary when the batch cap left most of the change unread', async () => {
     const diff = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((n) => addedFile(n, 150)).join('');
-    const { runner, reviews } = build(diff);
+    // Each file is about 4,000 characters, so 8,000-character batches hold two and one batch reads a quarter.
+    const { runner, reviews } = build(diff, { batchChars: 8000, maxBatches: 1 });
 
     await runner.run(1, 1);
 
@@ -283,4 +280,17 @@ describe('PullRequestReviewRunner coverage', () => {
     expect(saved.overallScore).toBe(95);
     expect(saved.summary?.startsWith(PARTIAL_REVIEW)).toBe(false);
   });
+  it('reviews all of it, with a normal score and no label, when the change needs several batches', async () => {
+    const diff = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((n) => addedFile(n, 150)).join('');
+    const { runner, reviews, callWithFallback } = build(diff, { batchChars: 8000, maxBatches: 8 });
+
+    await runner.run(1, 1);
+
+    const saved = reviews.save.mock.calls[0]?.[0] as { overallScore: number | null; summary: string | null };
+
+    expect(callWithFallback).toHaveBeenCalledTimes(4);
+    expect(saved.overallScore).toBe(95);
+    expect(saved.summary?.startsWith(PARTIAL_REVIEW)).toBe(false);
+    expect(saved.summary).not.toContain('Reviewed');
+  });
 });
```

- [x] **Step 2: Run it to verify it fails**

Run: `npm test -- src/modules/review/pr-review.runner`
Expected: FAIL (TypeScript: the runner still takes 13 constructor arguments).

- [x] **Step 3: Implement**

```diff
diff --git a/prism-api/src/modules/review/pr-review.runner.ts b/prism-api/src/modules/review/pr-review.runner.ts
--- a/prism-api/src/modules/review/pr-review.runner.ts
+++ b/prism-api/src/modules/review/pr-review.runner.ts
@@ -1,22 +1,19 @@
 import { Injectable, Logger } from '@nestjs/common';
 import { InjectRepository } from '@nestjs/typeorm';
 import { Repository as OrmRepository } from 'typeorm';
-import { AiClientService } from '../../ai/ai-client.service';
 import { FixesService, toLine } from '../../ai/fixes.service';
 import type { IssueLayers } from '../../ai/prompt-builder.service';
-import { clampScore } from '../../ai/json-extractor';
-import { PromptBuilderService } from '../../ai/prompt-builder.service';
 import { AuditLogService } from '../../audit/audit-log.service';
 import { DiffCacheService } from '../../cache/diff-cache.service';
 import { CryptService } from '../../common/utils/crypt.service';
 import { PullRequest, Review, ReviewComment } from '../../database/entities';
 import type { ReviewLayer, ReviewSeverity } from '../../database/entities/review-comment.entity';
-import { prepareDiff } from '../../diff/prepare';
+import { detectLanguages } from '../../diff/language-detector';
 import { tryAssessRisk, type RiskAssessment } from '../../diff/risk-radar';
-import { droppedCount, validateLayers } from '../../ai/issue-validator';
 import { validateFixes } from '../../ai/fix-validator';
 import { incompleteReviewSummary, isUnderCovered, scoreFor, verdictFor } from '../../ai/verdict';
 import { composeSummary } from './review-summary';
+import { BatchedReviewService } from './batched-review.service';
 import { GithubClientService } from '../../github/github-client.service';
 import { SlackService } from '../../notifications/slack.service';
 import { ReviewRiskStore } from '../risk/review-risk.store';
@@ -30,7 +27,6 @@ import { SummaryCommentBuilder } from './summary-comment.builder';
  * place), issues are fanned out into `review_comments`, and the posted GitHub
  * comment carries no "View full review" link.
  */
-const DIFF_LIMIT = 8000;
 const VALID_SEVERITIES: ReviewSeverity[] = ['critical', 'warning', 'suggestion'];
 
 @Injectable()
@@ -44,8 +40,7 @@ export class PullRequestReviewRunner {
     private readonly reviews: OrmRepository<Review>,
     @InjectRepository(ReviewComment)
     private readonly reviewComments: OrmRepository<ReviewComment>,
-    private readonly aiClient: AiClientService,
-    private readonly promptBuilder: PromptBuilderService,
+    private readonly batched: BatchedReviewService,
     private readonly fixes: FixesService,
     private readonly github: GithubClientService,
     private readonly diffCache: DiffCacheService,
@@ -88,39 +83,41 @@ export class PullRequestReviewRunner {
       () => this.github.fetchPullRequestDiff(token, repository.fullName, pr.prNumber, signal),
     );
 
-    // Select whole files rather than cutting at a byte, render every changed
-    // line with an anchor, and detect languages from the WHOLE diff. Shared
-    // with the commit runner so a parser fix lands in one place.
-    const prepared = prepareDiff(diffBody, DIFF_LIMIT);
-    const languages = prepared.languages;
+    // Every reviewable file is reviewed, in as many batches as it takes (capped;
+    // see batching.config.ts). Languages come from the WHOLE diff, so what fits
+    // one call cannot decide which language rules the prompt carries.
+    const languages = detectLanguages(diffBody);
 
-    // Risk Radar reads the whole diff, not the budgeted selection the model
-    // saw: blast radius is a property of the change, not of what fit. It is
-    // recorded together with every review row below, never later, so the page
-    // cannot pair this review with the previous push's risk.
+    // Risk Radar reads the whole diff, not the batches the model saw: blast
+    // radius is a property of the change, not of what fit. It is recorded
+    // together with every review row below, never later, so the page cannot pair
+    // this review with the previous push's risk. It also orders the files when
+    // the change is over the batch cap.
     const risk = tryAssessRisk(diffBody);
 
     if (languages.length > 0) {
       await this.pullRequests.update(pr.id, { detectedLanguages: languages });
     }
 
-    // 2. First AI pass.
-    const attemptResult = await this.aiClient.callWithFallback(
-      this.promptBuilder.buildSystemPrompt(languages, 'pull request'),
-      `Review this diff:\n${prepared.body}`,
-      'pr_review',
+    // 2. First AI pass, one call per batch, each checked against its own anchors
+    // and checkpointed, so a retry resumes instead of paying again.
+    const checkpoint = { kind: 'pr', id: pr.id, ownerId: repository.userId } as const;
+    const outcome = await this.batched.review({
+      diffBody,
+      languages,
+      target: 'pull request',
+      lead: 'Review this diff',
+      context: 'pr_review',
+      ref: checkpoint,
+      risk,
       signal,
-      { userId: repository.userId },
-    );
-
-    const model = attemptResult.model;
-    const parsed = attemptResult.parsed;
+    });
 
-    if (!parsed) {
+    if (outcome.status === 'unusable') {
       await this.upsertReview(pr.id, {
         overallScore: null,
-        summary: incompleteReviewSummary(attemptResult.raw),
-        aiModelUsed: model ?? 'multi-fallback',
+        summary: incompleteReviewSummary(outcome.raw),
+        aiModelUsed: outcome.model ?? 'multi-fallback',
         securityIssues: [],
         performanceIssues: [],
         codeQualityIssues: [],
@@ -128,6 +125,7 @@ export class PullRequestReviewRunner {
       await this.recordReviewedRisk(pr.id, repository.userId, risk);
 
       await this.pullRequests.update(pr.id, { status: 'completed' });
+      await this.batched.finish(checkpoint);
 
       this.logger.warn(
         `PR review: no AI model returned a usable review (pr_id=${pr.id})`,
@@ -136,38 +134,27 @@ export class PullRequestReviewRunner {
       return;
     }
 
-    // Every location the model reported is checked against the lines we
-    // actually rendered. A finding that does not resolve is dropped rather than
-    // shown against a guessed line — a comment pointing at the wrong line costs
-    // more trust than a missing comment costs bugs.
-    const layers = validateLayers(FixesService.layersFrom(parsed), prepared.anchors);
-    const dropped = droppedCount(layers);
-
-    if (dropped > 0) {
-      this.logger.log(
-        `issue_validation ${JSON.stringify({
-          pr_id: pr.id,
-          kept: layers.kept,
-          dropped,
-          reasons: layers.reasons,
-        })}`,
-      );
-    }
+    // Every location the model reported was checked, batch by batch, against the
+    // lines that batch rendered; what did not resolve is already dropped.
+    const { merged } = outcome;
+    const layers = merged.layers;
+    const model = merged.models.join(', ');
 
     // The model scored the list it reported, not the list that survived. Pull
     // the number into agreement with the verdict so the page cannot contradict
-    // itself; the score stays because deployed MCP clients read it.
+    // itself; the score stays because deployed MCP clients read it. With several
+    // batches the score starts from the lowest one.
     const verdict = verdictFor([
       ...layers.security,
       ...layers.performance,
       ...layers.code_quality,
     ]);
-    const overallScore = scoreFor(clampScore(parsed.overall_score), verdict, prepared.coverageRatio);
+    const overallScore = scoreFor(merged.score, verdict, outcome.coverageRatio);
     const summary = composeSummary(
-      typeof parsed.summary === 'string' ? parsed.summary : null,
-      prepared.coverage,
-      dropped,
-      isUnderCovered(prepared.coverageRatio),
+      merged.summary,
+      outcome.coverage,
+      merged.dropped,
+      isUnderCovered(outcome.coverageRatio),
     );
 
     // Out of budget. Stop before the upsert: the retry redoes all of this, and
@@ -201,9 +188,9 @@ export class PullRequestReviewRunner {
     // buildFixesPrompt, and its line numbers remain unvalidated — that is
     // tracked separately, not silently fixed here.
     const suggestedFixes = await this.fixes.generate(
-      model ?? '',
+      merged.lastModel,
       layers,
-      prepared.selection.text,
+      outcome.selection.text,
       'pull request',
       'pr_review',
       signal,
@@ -215,7 +202,7 @@ export class PullRequestReviewRunner {
       // so they get checked too: the code they quote has to actually be at the
       // line they claim. Otherwise the weakest surface sets the trust level for
       // every verified finding beside it.
-      const checked = validateFixes(suggestedFixes.fixes, prepared.index);
+      const checked = validateFixes(suggestedFixes.fixes, outcome.index);
 
       if (checked.dropped > 0) {
         this.logger.log(
@@ -251,6 +238,7 @@ export class PullRequestReviewRunner {
     );
 
     await this.pullRequests.update(pr.id, { status: 'completed' });
+    await this.batched.finish(checkpoint);
 
     this.logger.log(
       `PR review job completed ${JSON.stringify({ pr_id: pr.id, score: overallScore })}`,
```

- [x] **Step 4: Run to verify it passes**

Run: `npm test -- src/modules/review/pr-review.runner && npm run typecheck`
Expected: PASS, `Tests: 7 passed, 7 total`.

- [x] **Step 5: Commit**

```bash
git add prism-api/src/modules/review/pr-review.runner.ts prism-api/src/modules/review/pr-review.runner.spec.ts
git commit -m "Review pull requests in batches" -m "The runner now hands the diff to the batched review service and keeps only what is genuinely its own: persistence, the comment and notifications. The fixes pass still runs once, on the merged result, with its unchanged 4,000-character diff limit."
```

---

### Task 8: Use the service in the commit runner

**Files:**
- Modify: `prism-api/src/modules/review/commit-review.runner.ts`
- Create: `prism-api/src/modules/review/commit-review.runner.spec.ts` (there was no commit-runner spec)

**Interfaces:**
- Consumes: as Task 7.
- Produces: `CommitReviewRunner` constructor is now `(commitReviews, batched, fixes, github, diffCache, crypt, summaryComment, slack, auditLog)`.

- [x] **Step 1: Write the failing test** `prism-api/src/modules/review/commit-review.runner.spec.ts`:

```ts
import { PARTIAL_REVIEW, UNPARSEABLE_REVIEW } from '../../ai/verdict';
import { buildBatchedReview } from './batched-review.testing';
import { CommitReviewRunner } from './commit-review.runner';

const addedFile = (name: string, lines: number): string =>
  `diff --git a/src/${name}.ts b/src/${name}.ts\n--- a/src/${name}.ts\n+++ b/src/${name}.ts\n@@ -1,1 +1,${lines} @@\n` +
  Array.from({ length: lines }, (_, i) => `+const ${name}${i} = ${i};`).join('\n') +
  '\n';

function build(diff: string, ai: unknown, config = { batchChars: 16_000, maxBatches: 8 }) {
  const commitReviews = {
    findOne: jest.fn().mockResolvedValue({
      id: 4,
      commitSha: 'abcdef1234567',
      branch: 'main',
      author: 'a',
      shortSha: () => 'abcdef1',
      repository: { id: 2, fullName: 'o/r', userId: 1, user: { id: 1, githubToken: null } },
    }),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const { service, checkpoints } = buildBatchedReview(ai, { config });
  const github = {
    fetchCommitDiff: jest.fn().mockResolvedValue(diff),
    postCommitComment: jest.fn().mockResolvedValue(undefined),
  };
  const runner = new CommitReviewRunner(
    commitReviews as never,
    service,
    { generate: jest.fn().mockResolvedValue(null) } as never,
    github as never,
    {
      commitKey: jest.fn().mockReturnValue('k'),
      remember: jest.fn(async (_key: string, loader: () => Promise<string>) => loader()),
    } as never,
    { decrypt: jest.fn().mockReturnValue('token') } as never,
    { buildForCommit: jest.fn().mockReturnValue('body') } as never,
    { sendCommitReview: jest.fn() } as never,
    { record: jest.fn().mockResolvedValue(undefined) } as never,
  );

  return { runner, commitReviews, github, checkpoints };
}

const finalUpdate = (commitReviews: { update: jest.Mock }): Record<string, unknown> =>
  commitReviews.update.mock.calls.find((call) => (call[1] as Record<string, unknown>).summary !== undefined)?.[1] as Record<
    string,
    unknown
  >;

describe('CommitReviewRunner batched review', () => {
  const answer = { callWithFallback: jest.fn() };

  beforeEach(() => {
    answer.callWithFallback.mockReset().mockResolvedValue({
      model: 'groq/test',
      parsed: { overall_score: 95, summary: 'Looks fine.' },
      raw: null,
    });
  });

  it('reviews every file in several calls and keeps the normal score', async () => {
    const diff = ['a', 'b', 'c', 'd'].map((n) => addedFile(n, 150)).join('');
    const { runner, commitReviews, github, checkpoints } = build(diff, answer, { batchChars: 8000, maxBatches: 8 });

    await runner.run(4, 1);

    const saved = finalUpdate(commitReviews);

    expect(answer.callWithFallback).toHaveBeenCalledTimes(2);
    expect(saved.overallScore).toBe(95);
    expect(String(saved.summary).startsWith(PARTIAL_REVIEW)).toBe(false);
    expect(github.postCommitComment).toHaveBeenCalledTimes(1);
    expect(checkpoints.cleared).toEqual(['commit:4']);
  });

  it('marks the review partial and withholds the score when the cap leaves most of it unread', async () => {
    const diff = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((n) => addedFile(n, 150)).join('');
    const { runner, commitReviews } = build(diff, answer, { batchChars: 8000, maxBatches: 1 });

    await runner.run(4, 1);

    const saved = finalUpdate(commitReviews);

    expect(saved.overallScore).toBeNull();
    expect(String(saved.summary).startsWith(PARTIAL_REVIEW)).toBe(true);
  });

  it('completes as not reviewed, without posting, when no batch gives a usable answer', async () => {
    answer.callWithFallback.mockResolvedValue({ model: 'groq/test', parsed: null, raw: 'garbled' });

    const { runner, commitReviews, github } = build(addedFile('a', 5), answer);

    await runner.run(4, 1);

    const saved = finalUpdate(commitReviews);

    expect(String(saved.summary).startsWith(UNPARSEABLE_REVIEW)).toBe(true);
    expect(saved.overallScore).toBeNull();
    expect(github.postCommitComment).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `npm test -- src/modules/review/commit-review.runner`
Expected: FAIL (TypeScript: constructor arity).

- [x] **Step 3: Implement**

```diff
diff --git a/prism-api/src/modules/review/commit-review.runner.ts b/prism-api/src/modules/review/commit-review.runner.ts
--- a/prism-api/src/modules/review/commit-review.runner.ts
+++ b/prism-api/src/modules/review/commit-review.runner.ts
@@ -1,20 +1,17 @@
 import { Injectable, Logger } from '@nestjs/common';
 import { InjectRepository } from '@nestjs/typeorm';
 import { Repository as OrmRepository } from 'typeorm';
-import { AiClientService } from '../../ai/ai-client.service';
-import { clampScore } from '../../ai/json-extractor';
 import { FixesService } from '../../ai/fixes.service';
-import { PromptBuilderService } from '../../ai/prompt-builder.service';
 import { AuditLogService } from '../../audit/audit-log.service';
 import { DiffCacheService } from '../../cache/diff-cache.service';
 import { CryptService } from '../../common/utils/crypt.service';
 import { CommitReview } from '../../database/entities';
-import { prepareDiff } from '../../diff/prepare';
+import { detectLanguages } from '../../diff/language-detector';
 import { tryAssessRisk } from '../../diff/risk-radar';
-import { droppedCount, validateLayers } from '../../ai/issue-validator';
 import { validateFixes } from '../../ai/fix-validator';
 import { incompleteReviewSummary, isUnderCovered, scoreFor, verdictFor } from '../../ai/verdict';
 import { composeSummary } from './review-summary';
+import { BatchedReviewService } from './batched-review.service';
 import { GithubClientService } from '../../github/github-client.service';
 import { SlackService } from '../../notifications/slack.service';
 import { SummaryCommentBuilder } from './summary-comment.builder';
@@ -26,7 +23,6 @@ import { SummaryCommentBuilder } from './summary-comment.builder';
  * the terminal-failure cleanup lives in the processor's failed handler, exactly
  * as the original splits handle() and failed().
  */
-const DIFF_LIMIT = 8000;
 
 @Injectable()
 export class CommitReviewRunner {
@@ -35,8 +31,7 @@ export class CommitReviewRunner {
   constructor(
     @InjectRepository(CommitReview)
     private readonly commitReviews: OrmRepository<CommitReview>,
-    private readonly aiClient: AiClientService,
-    private readonly promptBuilder: PromptBuilderService,
+    private readonly batched: BatchedReviewService,
     private readonly fixes: FixesService,
     private readonly github: GithubClientService,
     private readonly diffCache: DiffCacheService,
@@ -79,36 +74,43 @@ export class CommitReviewRunner {
       () => this.github.fetchCommitDiff(token, repository.fullName, review.commitSha, signal),
     );
 
-    // Same preparation as the pull-request runner, by design: these two stay in
-    // step, and a parser fix has to land once rather than twice.
-    const prepared = prepareDiff(diffBody, DIFF_LIMIT);
-    const languages = prepared.languages;
+    // Reviewed the same way as a pull request, by design: these two stay in
+    // step, and the batching lives in one service rather than in two files.
+    const languages = detectLanguages(diffBody);
+
+    // Computed from the whole diff, not the batches the model saw: blast radius
+    // is a property of the change, not of what fit. Also orders the files when
+    // the change is over the batch cap.
+    const risk = tryAssessRisk(diffBody);
 
     if (languages.length > 0) {
       await this.commitReviews.update(review.id, { detectedLanguages: languages });
     }
 
-    // 2. First AI pass.
-    const attemptResult = await this.aiClient.callWithFallback(
-      this.promptBuilder.buildSystemPrompt(languages, 'commit'),
-      `Review this commit diff:\n${prepared.body}`,
-      'commit_review',
+    // 2. First AI pass, one call per batch, each checked against its own anchors
+    // and checkpointed, so a retry resumes instead of paying again.
+    const checkpoint = { kind: 'commit', id: review.id, ownerId: repository.userId } as const;
+    const outcome = await this.batched.review({
+      diffBody,
+      languages,
+      target: 'commit',
+      lead: 'Review this commit diff',
+      context: 'commit_review',
+      ref: checkpoint,
+      risk,
       signal,
-      { userId: repository.userId },
-    );
-
-    const model = attemptResult.model;
-    const parsed = attemptResult.parsed;
+    });
 
-    // Graceful degradation: every model returned unparseable output. The user
-    // sees the raw text and a retry hint rather than a failed review.
-    if (!parsed) {
+    // Graceful degradation: no batch produced a usable answer. The user sees the
+    // raw text and a retry hint rather than a failed review.
+    if (outcome.status === 'unusable') {
       await this.commitReviews.update(review.id, {
         status: 'completed',
         overallScore: null,
-        summary: incompleteReviewSummary(attemptResult.raw),
-        aiModelUsed: model ?? 'multi-fallback',
+        summary: incompleteReviewSummary(outcome.raw),
+        aiModelUsed: outcome.model ?? 'multi-fallback',
       });
+      await this.batched.finish(checkpoint);
 
       this.logger.warn(
         `Commit review: no AI model returned a usable review (review_id=${review.id})`,
@@ -117,35 +119,25 @@ export class CommitReviewRunner {
       return;
     }
 
-    // Every reported location is checked against the lines actually rendered;
-    // anything that does not resolve is dropped rather than shown at a guess.
-    const layers = validateLayers(FixesService.layersFrom(parsed), prepared.anchors);
-    const dropped = droppedCount(layers);
-
-    if (dropped > 0) {
-      this.logger.log(
-        `issue_validation ${JSON.stringify({
-          review_id: review.id,
-          kept: layers.kept,
-          dropped,
-          reasons: layers.reasons,
-        })}`,
-      );
-    }
+    // Every reported location was checked, batch by batch, against the lines
+    // that batch rendered; anything that did not resolve is already dropped.
+    const { merged } = outcome;
+    const layers = merged.layers;
+    const model = merged.models.join(', ');
 
     // Same reconciliation as the pull-request runner: the score describes the
-    // list that survived validation, not the one the model first reported.
+    // list that survived validation, starting from the lowest batch score.
     const verdict = verdictFor([
       ...layers.security,
       ...layers.performance,
       ...layers.code_quality,
     ]);
-    const overallScore = scoreFor(clampScore(parsed.overall_score), verdict, prepared.coverageRatio);
+    const overallScore = scoreFor(merged.score, verdict, outcome.coverageRatio);
     const summary = composeSummary(
-      typeof parsed.summary === 'string' ? parsed.summary : null,
-      prepared.coverage,
-      dropped,
-      isUnderCovered(prepared.coverageRatio),
+      merged.summary,
+      outcome.coverage,
+      merged.dropped,
+      isUnderCovered(outcome.coverageRatio),
     );
 
     // Out of budget. Stop before persisting: the retry redoes all of this, and
@@ -167,9 +159,9 @@ export class CommitReviewRunner {
     // The selected text, matching the pull-request runner. The fixes pass keeps
     // its own 4000-character limit and its line numbers stay unvalidated.
     const suggestedFixes = await this.fixes.generate(
-      model ?? '',
+      merged.lastModel,
       layers,
-      prepared.selection.text,
+      outcome.selection.text,
       'commit',
       'commit_review',
       signal,
@@ -180,7 +172,7 @@ export class CommitReviewRunner {
       // Fixes carry their own file and line and the UI shows them in a badge,
       // so they are checked against the quoted code the same way the
       // pull-request runner checks them.
-      const checked = validateFixes(suggestedFixes.fixes, prepared.index);
+      const checked = validateFixes(suggestedFixes.fixes, outcome.index);
 
       if (checked.dropped > 0) {
         this.logger.log(
@@ -208,14 +200,13 @@ export class CommitReviewRunner {
         performanceIssues: layers.performance,
         codeQualityIssues: layers.code_quality,
         aiModelUsed: model,
-        // Computed from the whole diff, not the budgeted selection the model
-        // saw: blast radius is a property of the change, not of what fit.
-        risk: tryAssessRisk(diffBody),
+        risk,
       }),
       signal,
     );
 
     await this.commitReviews.update(review.id, { status: 'completed' });
+    await this.batched.finish(checkpoint);
 
     this.logger.log(
       `Commit review job completed ${JSON.stringify({ review_id: review.id, score: overallScore })}`,
```

- [x] **Step 4: Run to verify it passes**

Run: `npm test -- src/modules/review/ && npm run typecheck` (keep the trailing slash)
Expected: PASS for the whole `src/modules/review/` directory (the commit spec: 3 tests).

- [x] **Step 5: Commit**

```bash
git add prism-api/src/modules/review/commit-review.runner.ts prism-api/src/modules/review/commit-review.runner.spec.ts
git commit -m "Review commits in batches, the same way as pull requests" -m "The two runners stay near-parallel by calling the same service. The commit runner had no spec at all; this adds the first one, covering a many-batch review, the capped partial label and the not-reviewed fallback."
```

---

### Task 9: Derive the job budget from the batch cap; keep the erasure marker long enough

**Files:**
- Modify: `prism-api/src/modules/review/review.queue.ts`, `review.queue.spec.ts`, `prism-api/src/modules/account/erasure-marker.ts`

**Interfaces:**
- Consumes: `BATCH_CONFIG`, `jobBudgetMs` (Task 3).
- Produces: `REVIEW_JOB_TIMEOUT_MS = jobBudgetMs(BATCH_CONFIG.maxBatches)` (2,070,000 ms at the defaults); `ERASURE_MARKER_TTL_SECONDS = 7200`.

- [ ] **Step 1: Update the spec** (the budget is now pinned as a derived relationship, and the old ten-minute ceiling becomes forty minutes, a number changed on purpose here):

```diff
diff --git a/prism-api/src/modules/review/review.queue.spec.ts b/prism-api/src/modules/review/review.queue.spec.ts
--- a/prism-api/src/modules/review/review.queue.spec.ts
+++ b/prism-api/src/modules/review/review.queue.spec.ts
@@ -1,5 +1,6 @@
 import { GROQ_MODELS, GROQ_TIMEOUT_MS } from '../../ai/ai-client.service';
 import { REQUEST_TIMEOUT_MS as GITHUB_TIMEOUT_MS } from '../../github/github-client.service';
+import { BATCH_CONFIG, jobBudgetMs } from './batching.config';
 import {
   REVIEW_JOB_ATTEMPTS,
   REVIEW_JOB_TIMEOUT_MS,
@@ -33,10 +34,20 @@ describe('review job retry policy', () => {
     expect(REVIEW_JOB_TIMEOUT_MS).toBeGreaterThan(aiWorstCase + githubWorstCase);
   });
 
+  it('is derived from the batch cap, with one fixes pass and two GitHub round trips on top', () => {
+    const perBatch = GROQ_TIMEOUT_MS * (GROQ_MODELS.length + 1) + 60_000;
+
+    expect(REVIEW_JOB_TIMEOUT_MS).toBe(jobBudgetMs(BATCH_CONFIG.maxBatches));
+    expect(REVIEW_JOB_TIMEOUT_MS).toBe(
+      BATCH_CONFIG.maxBatches * perBatch + GROQ_TIMEOUT_MS + 2 * GITHUB_TIMEOUT_MS + 30_000,
+    );
+  });
+
   it('stays inside a range a free-tier worker slot can afford to block for', () => {
     // Unbounded growth here starves the single worker: concurrency is 1, so a
-    // stuck job is the whole queue. Ten minutes is the outer limit.
-    expect(REVIEW_JOB_TIMEOUT_MS).toBeLessThanOrEqual(600_000);
+    // stuck job is the whole queue. Forty minutes is the outer limit; raising
+    // the batch cap past what fits means deciding that on purpose, here.
+    expect(REVIEW_JOB_TIMEOUT_MS).toBeLessThanOrEqual(40 * 60_000);
   });
 
   it('reproduces the [60, 180, 600] second backoff', () => {
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/modules/review/review.queue src/modules/account/erasure-marker`
Expected: FAIL: `expected 330000 to be 2070000`.

- [ ] **Step 3: Implement**

```diff
diff --git a/prism-api/src/modules/review/review.queue.ts b/prism-api/src/modules/review/review.queue.ts
--- a/prism-api/src/modules/review/review.queue.ts
+++ b/prism-api/src/modules/review/review.queue.ts
@@ -1,6 +1,5 @@
 import type { JobsOptions, WorkerOptions } from 'bullmq';
-import { GROQ_MODELS, GROQ_TIMEOUT_MS } from '../../ai/ai-client.service';
-import { REQUEST_TIMEOUT_MS as GITHUB_TIMEOUT_MS } from '../../github/github-client.service';
+import { BATCH_CONFIG, jobBudgetMs } from './batching.config';
 
 /**
  * Queue identity and retry policy.
@@ -33,23 +32,19 @@ export const REVIEW_JOB_BACKOFF_SECONDS = [60, 180, 600];
  * Per-attempt budget, derived rather than written down.
  *
  * The PHP said `public int $timeout = 120`, and the port copied the number
- * without re-checking it against what one attempt actually does. It does not
- * fit: a single attempt can spend GROQ_TIMEOUT_MS on each model of the first
- * pass, the same again on the fixes pass, and a GitHub round trip either side.
- * At 120s the job died mid-pipeline, which made the "every model returned
- * unparseable JSON, save the raw text" path unreachable whenever the models
- * failed by hanging rather than by answering badly.
+ * without re-checking it against what one attempt actually does. It did not
+ * fit then, and it fits less now: a review is up to MAX_BATCHES model calls,
+ * each of which can spend the user's own model and the whole Groq chain, plus
+ * a wait for the per-minute token allowance, then one fixes pass and a GitHub
+ * round trip either side. `jobBudgetMs` (batching.config.ts) owns the
+ * formula: change the batch cap, a provider timeout or the model list and this
+ * budget follows, instead of silently going back under water.
  *
- * +2 = the fixes pass and one attempt on the user's own model before the Groq chain.
- *
- * Importing the two constants is the point: change a provider timeout or add a
- * model and this budget follows, instead of silently going back under water.
+ * It is a ceiling that holds only if every call hangs. It is also how long the
+ * single worker (concurrency 1) can be blocked, which is why the cap on
+ * batches exists and why each batch has its own deadline inside it.
  */
-const AI_WORST_CASE_MS = GROQ_TIMEOUT_MS * (GROQ_MODELS.length + 2);
-const GITHUB_WORST_CASE_MS = GITHUB_TIMEOUT_MS * 2;
-
-/** Plus a margin for the DB writes and JSON work between the calls. */
-export const REVIEW_JOB_TIMEOUT_MS = AI_WORST_CASE_MS + GITHUB_WORST_CASE_MS + 30_000;
+export const REVIEW_JOB_TIMEOUT_MS = jobBudgetMs(BATCH_CONFIG.maxBatches);
 
 /**
  * BullMQ's built-in `exponential`/`fixed` strategies cannot express
```

The erasure marker has to outlast two attempts (`erasure-marker.spec.ts` asserts `ERASURE_MARKER_TTL_SECONDS * 1000 > REVIEW_JOB_TIMEOUT_MS * 2`; 2 x 34.5 min is 69 min, over the old 60):

```diff
diff --git a/prism-api/src/modules/account/erasure-marker.ts b/prism-api/src/modules/account/erasure-marker.ts
--- a/prism-api/src/modules/account/erasure-marker.ts
+++ b/prism-api/src/modules/account/erasure-marker.ts
@@ -20,8 +20,9 @@ export function erasureMarkerKey(userId: number): string {
 
 /**
  * Must outlast anything in flight when erasure starts: a review attempt
- * (REVIEW_JOB_TIMEOUT_MS) and a design generation (DESIGN_BUDGET_MS). A test
+ * (REVIEW_JOB_TIMEOUT_MS, now up to 34.5 minutes because a review is several
+ * batched model calls) and a design generation (DESIGN_BUDGET_MS). A test
  * pins that. A review retried after the user row is gone finds no pull request
  * and stops, so the marker does not need to outlast the retry schedule.
  */
-export const ERASURE_MARKER_TTL_SECONDS = 60 * 60;
+export const ERASURE_MARKER_TTL_SECONDS = 2 * 60 * 60;
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- src/modules/review/ src/modules/account && npm run typecheck`
Expected: PASS. `review.processor.spec.ts` still passes because it advances fake timers by `REVIEW_JOB_TIMEOUT_MS`, whatever it is.

- [ ] **Step 5: Commit**

```bash
git add prism-api/src/modules/review/review.queue.ts prism-api/src/modules/review/review.queue.spec.ts prism-api/src/modules/account/erasure-marker.ts
git commit -m "Derive the job budget from the batch cap" -m "A review is now up to eight model calls plus the time spent waiting for the token allowance, so the old 330 s budget would kill every long review mid-way. The budget follows the cap (34.5 minutes at the defaults, a ceiling reached only if every call hangs), and the erasure marker is lengthened so it still outlasts two attempts."
```

---

### Task 10: Docs, the ADR and the code map

**Files:**
- Create: `docs/adr/0013-review-every-file-in-batches.md`
- Modify: `docs/adr/README.md`, `docs/review-pipeline.md`, `docs/architecture.md`, `docs/configuration.md`, `docs/known-issues.md`, `docs/code-map.md`, `README.md`, `CLAUDE.md`

**Interfaces:** none (documentation). Do the edits below with the Edit tool, then run `git diff --stat` and re-read nothing you just wrote.

- [ ] **Step 1: Create the ADR** `docs/adr/0013-review-every-file-in-batches.md` with exactly this content:

```markdown
# 0013. Review every file, in batches of a fixed size with a cap

Status: Accepted
Date: 2026-11-08

## Context

One model call saw about 8,000 characters of a change. The spike
([batching spike](../superpowers/spikes/2026-11-08-batching-spike.md)) measured 70 real diffs: 24% were under
50% coverage, so the Phase 0a partial label fired on roughly a quarter of real changes. The owner requires
every PR and commit to be reviewed in full. Splitting the reviewable files into 16,000-character batches
needs a median of 1 call, 5 at the 90th percentile and at most 10 (8 or fewer for 97% of the sample). The
binding limit is not the job budget but Groq's documented free tier: about 8,000 tokens a minute and 200,000
a day per model.

## Decision

- **Batches of 16,000 characters, at most 8 per review** (`modules/review/batching.config.ts`). Files stay in
  diff order; a file larger than a batch is cut into header plus whole hunks, a hunk larger than a batch is
  cut at line boundaries and every cut piece carries its own `@@` header with the true line numbers. Past the
  cap, files are kept in Risk Radar weight order and the rest are reported through the Phase 0a coverage
  sentence and partial label (`selectionFor`, `coverageRatio`, `MIN_COVERAGE` 0.5 unchanged).
- **Anchors are per batch.** Ids restart at 1 in each call and each call's findings are validated against that
  call's own map only (ADR 0006 stays exactly as strict). The system prompt and golden fixtures are untouched;
  only the user message says "part N of M".
- **One service for both runners** (`BatchedReviewService`). Findings are de-duplicated on
  file, side, line and category, ordered by `orderFindings`, and cut at 40. The score starts from the lowest
  batch score and is reconciled by the existing `scoreFor`. The summary is the model's own words by part;
  no new fixed string, so no recogniser changed.
- **A checkpoint in Redis after every validated batch** (2 h TTL, key by owner, fingerprint of the diff and the
  batching settings), so a BullMQ retry resumes instead of repeating paid calls. It is erasable with the
  account (erasure-marker script, `AccountDataService` purge).
- **Pacing** against the provider's per-minute token allowance (`TokenPacer`; Groq free tier profile; a user's
  own key is unpaced). A 429 that outlasts the model chain ends the review with what exists, or is rethrown
  for BullMQ's backoff if nothing exists yet.
- **The job budget is derived:** `MAX_BATCHES x (GROQ_TIMEOUT_MS x (models + 1) + max pacing wait) +
  GROQ_TIMEOUT_MS (fixes) + 2 x GITHUB_TIMEOUT_MS + 30 s` = 34.5 minutes at the defaults. Each batch also has
  its own deadline.

## Consequences

- **The single worker can be blocked for up to 34.5 minutes** (a ceiling that holds only if every call hangs;
  a one-batch review, the median, takes seconds). Concurrency stays 1 (512 MB). On the free tier a review of
  eight batches spends about eight minutes pacing. Raising worker concurrency is a separate decision.
- **Call volume grows** (the sample: 129 calls for 70 diffs at 16,000, against 70 today). The free tier's
  200,000 tokens a day is about 30 average reviews a day per model, and a daily-limit 429 ends a long review
  partial. Known issue T13 is unchanged for a first-batch daily limit.
- **Review quality of batched calls is unmeasured**, as is cross-file blindness (a change and its caller in
  different batches). Import grouping was measured to change 3 of 70 assignments and is not built.
- **The fixes pass is unchanged** and sees only the first 4,000 characters of the selected text, so fixes for
  findings in later files are more often dropped by `validateFixes`.
- A step of the retry resumes only batches that finished; a batch that timed out is retried by the next
  attempt. A `Part N:` summary line is shown per part, so a many-part review has a long summary.
- A single diff line longer than a batch is cut and marked `[line cut]`, the only content batching drops.
- `prepareDiff` is no longer called by the runners (it remains tested); remove it in a follow-up.

## Rejected

- **8,000-character batches:** 11% of sampled diffs would exceed 8 calls (maximum 19), and twice the calls.
- **24,000-character batches:** one call alone nearly fills the per-minute allowance and very large prompts
  may degrade quality (unmeasured).
- **Global anchor numbering:** an id cited from another call could resolve to a file the model was not shown
  in that call; per-batch maps keep validation strict.
- **Waiting in-job on a daily limit:** the worker runs at concurrency 1 and would block every other review.
- **A table for the checkpoint:** hand-applied DDL for data worth keeping for hours.
```

- [ ] **Step 2: ADR index.** In `docs/adr/README.md` add after the 0012 row:

```markdown
| [0013](0013-review-every-file-in-batches.md) | Review every file, in batches of a fixed size with a cap | Accepted |
```

- [ ] **Step 3: `docs/review-pipeline.md`.**
  - Section 2 table: replace the "Per-attempt budget" row with:
    `| Per-attempt budget | \`jobBudgetMs(MAX_BATCHES)\` = \`MAX_BATCHES x (GROQ_TIMEOUT_MS x (models + 1) + pacing wait) + GROQ_TIMEOUT_MS + 2 x GITHUB_TIMEOUT_MS + 30 s\` = 8 x (180 + 60) + 60 + 60 + 30 = **2,070 s (34.5 min)** at the defaults. A ceiling reached only if every call hangs; the worker (concurrency 1) is blocked for as long as a review runs. Each batch also has its own deadline (\`BATCH_WORST_CASE_MS\`). |`
    and change the sentence after the table to: "The budget is computed from the batch cap and the provider constants (`modules/review/batching.config.ts`). Adding a model, raising a timeout or the cap raises it automatically."
  - Section 4: replace the paragraph starting "`prepareDiff` is shared by both runners" through the coverage sentence paragraph with a description of: **Pack** (`diff/batch-pack.ts`: noise out, diff order, greedy fit at `batchChars` 16,000, oversized file → hunks → line-cut pieces with true `@@` headers, cap `maxBatches` 8, Risk Radar order past the cap); **Anchor per batch** (`prepareBatch`: ids restart at 1, validated against that batch's map only); **Detect languages** from the whole diff. Keep the "Coverage" subsection but change its first sentence to: "`coverageRatio()` is the share of reviewable files the model was shown **in batches that completed**: a file with some pieces reviewed counts as half, and noise is not in the denominator." and add: "A capped review, a batch that timed out and a review cut short by a rate limit all lower the ratio; the coverage sentence ("Reviewed 3 of 5 changed files.") appears whenever it is below 1, and under `MIN_COVERAGE` the label applies."
  - Section 5 (first AI pass): add a short subsection **"Batches, checkpoints and pacing"**: one call per batch (`BatchedReviewService`), user message `Review this diff (part N of M of one change; ...)` only when M > 1; the pacer waits for the per-minute allowance; each validated batch is saved to Redis (`review-batches:{ownerId}:{pr|commit}:{id}`, 2 h) before the next call and a retry loads them; a batch that times out is skipped; a rate limit after at least one batch ends the review with what exists, before any batch it is rethrown for BullMQ's backoff; merge (`ai/batch-merge.ts`): de-duplicate, `orderFindings`, 40 findings, lowest batch score, `Part N:` summary lines.
  - Section 8: after the first paragraph add: "With batching the fixes pass still runs **once, for the merged result**, and still sees only the first 4,000 characters of the selected text; `validateFixes` checks against the merged hunk index. Findings in later batches therefore have fixes dropped more often (known issue)."
  - "How to change the pipeline safely" list: add "Batching constants live in `batching.config.ts`; the budget follows them. Retune after a live run, never by editing `review.queue.ts`."

- [ ] **Step 4: `docs/architecture.md`** limits table (line near 162): replace the two rows with
  `| Diff shown to the model | 16,000 characters per call, up to 8 calls per review | Groq's free-tier token limits (8,000 tokens a minute) and parse rate; see [ADR 0013](adr/0013-review-every-file-in-batches.md) |` and
  `| Review attempt budget | 34.5 min, derived from the batch cap and the timeouts it wraps | See [ADR 0003](adr/0003-derive-the-job-budget-and-cancel-on-deadline.md) and [ADR 0013](adr/0013-review-every-file-in-batches.md) |`
  (the old row said 270 s, already stale against the 330 s the code had). Also, if the architecture flow diagram or text mentions "one model call", change it to "one call per batch"; run `grep -n "one model call\|AI pass" docs/architecture.md` first.

- [ ] **Step 5: `docs/configuration.md`** (line near 86): replace the `DIFF_LIMIT = 8000` row with
  `| \`BATCH_CONFIG\` (\`batchChars\` 16000, \`maxBatches\` 8), \`MAX_MERGED_FINDINGS\`, \`GROQ_FREE_PACE\`, \`OWN_KEY_PACE\`, \`CHECKPOINT_*\` | \`modules/review/batching.config.ts\` | Batch size and cap, findings kept, pacing and checkpoint settings; unmeasured starting values. The job budget derives from them |`.

- [ ] **Step 6: `README.md`** (line near 131): replace the bullet "**The model sees roughly 8,000 characters of a diff** ..." with
  "- **Every reviewable file is reviewed**, in batches of 16,000 characters and at most 8 calls per review (anything past the cap, or lost to a rate limit, is stated in the review). Files are cut at hunk and line boundaries only when one is larger than a batch."

- [ ] **Step 7: `docs/known-issues.md`.**
  - **T13**: replace its text with: "*Confirmed.* If every model answers 429 on the **first** batch the attempt throws and BullMQ retries at +60 s and +180 s; a **daily** limit then marks the review `failed` permanently. A 429 after at least one batch has finished now ends the review with what exists (coverage falls; the partial label applies under half). Batching raises call volume (the sample: 129 calls for 70 diffs against 70), so the free tier's 200,000 tokens a day is about 30 average reviews a day per model. **Fix (needs no DDL):** read `retry-after` (not exposed by the provider layer today); keep throwing for a per-minute limit; for a long one finish as `not_reviewed` with a third fixed summary prefix that `isIncompleteReview()` recognises. Waiting in-job was rejected because the worker runs at concurrency 1."
  - Under "Review quality (needs keys)" add: "- **Batched review is unmeasured.** Nothing has run a batched review against a live key: real latency per call, real tokens (and whether Groq counts the reserved `max_completion_tokens` against the per-minute limit), whether batch replies stay valid JSON, whether the two Groq models share the daily quota, the quality of a batch that cannot see the other files (a change and its caller in different batches), and the real size distribution of PRism's own changes. `scripts/measure-batching-live.ts` runs the first four with `GROQ_API_KEY_DEV`; the constants in `modules/review/batching.config.ts` are starting values until then."
  - Under "Correctness and safety" add: "### T17. With batching, the fixes pass sees only the first 4,000 characters of the selected text" with: "*Confirmed.* `FixesService` is unchanged: it runs once for the merged result and `buildFixesPrompt` slices the diff to 4,000 characters. Findings in later batches therefore have their fixes dropped by `validateFixes` more often. **Fix:** pick the files the findings are in, or run fixes per batch; both change the number of calls." (use the next free `T` number; check `grep -n '^### T' docs/known-issues.md`).
  - Add a line (same section): "### T18. The worker is blocked for the length of a review" with: "*Confirmed.* Concurrency is 1 (512 MB) and a review of up to 8 batches can take about 8 minutes on the Groq free tier (pacing) and up to 34.5 minutes if every call hangs. Other reviews wait behind it. **Fix:** a second worker or concurrency 2 after measuring memory; not done."
  - Add: "`diff/prepare.ts` `prepareDiff` is no longer called by the runners; remove it and its spec cases in a follow-up."
  - In the "Review quality" bullet that says "set `DIFF_LIMIT` (8,000 today ..." change `DIFF_LIMIT` to `BATCH_CONFIG.batchChars` (16,000 today; the earlier 8,000 dry run is history).

- [ ] **Step 8: `docs/code-map.md`.** In the "I want to change" table add rows:
  `| Batching: size, cap, pacing, the job budget numbers | \`modules/review/batching.config.ts\` | [ADR 0013](adr/0013-review-every-file-in-batches.md); retune after a live run |` and
  `| How a change is split into batches, or merged back | \`diff/batch-pack.ts\`, \`diff/risk-rank.ts\`, \`ai/batch-merge.ts\`, \`modules/review/batched-review.service.ts\` | [review-pipeline](review-pipeline.md#4-preparing-the-diff) |` and
  `| The saved progress of a review (retry resume), its erasure | \`modules/review/review-checkpoint.store.ts\`, \`modules/account/account-data.service.ts\` | Redis; write through the erasure-marker script |`.
  Change the "Which part of a diff is shown, anchors" row's Files to `diff/prepare.ts` (\`prepareBatch\`), \`batch-pack.ts\`, \`file-selection.ts\`, \`hunk-index.ts\`, \`render.ts\`. In the `prism-api/src` table: `ai/` row add `token-pacer`, `batch-merge`; `diff/` row add `batch-pack`, `risk-rank`; `modules/review` row add "batching config, batched review service, checkpoint store". In the tests table add: `| Batching (packer, pacer, merge) | \`npm test -- src/diff src/ai\`; the service: \`npm test -- src/modules/review/\` |`.

- [ ] **Step 9: `CLAUDE.md`** under **Review pipeline**, add one rule after the "Findings are validated" line:
  `- Every reviewable file is reviewed in batches (\`modules/review/batching.config.ts\`: 16,000 characters, at most 8 calls; ADR 0013). Anchors are per batch and validated against that batch's own map only. Each batch is checkpointed in Redis before the next call (erasable: erasure-marker script + \`AccountDataService\`). The job budget derives from the cap; never hard-code it. Both runners call \`BatchedReviewService\`; do not loop over batches in a runner.`
  Do not change any other line.

- [ ] **Step 10: Check and commit**

Run: `git diff --stat` and read that only the listed docs changed. No tests run (docs only).

```bash
git add docs/adr/0013-review-every-file-in-batches.md docs/adr/README.md docs/review-pipeline.md docs/architecture.md docs/configuration.md docs/known-issues.md docs/code-map.md README.md CLAUDE.md
git commit -m "Document batched review and record the decision" -m "ADR 0013 states what batching costs (a blocked worker, more calls against a small free tier, unmeasured quality) so the next person does not undo it blindly. The code map, pipeline doc, limits tables and known issues change in the same commit as the behaviour, per the repo rules."
```

---

### Task 11: The full gate, the stack boot, and an end-to-end check

**Files:** none changed unless a gate fails.

- [ ] **Step 1: Typecheck, lint, full test suite (once)**

Run from `prism-api/`: `npm run typecheck && npm run lint && npm test`
Expected: typecheck clean; lint clean (about 50 to 70 s); all suites pass (the author saw 61 suites and 642 tests with every change from Tasks 1 to 9 applied; the exact count is not a gate, zero failures is). `prism-web` is untouched: no web gate.

- [ ] **Step 2: Boot the stack once (DI wiring and Redis changed)**

Follow `docs/development.md` sections 2 and 3: Postgres and Redis containers (`--maxmemory-policy noeviction`), `prism-api/.env` pointing at `127.0.0.1` (never the repo-root `.env`), then from `prism-api/`: `npm run start:dev` (it listens on :3999; start it once, reuse it, stop it after). Expected: the log ends with `PRism API listening on :3999 (development)` and has no "Nest can't resolve dependencies of the BatchedReviewService / AccountDataService / ReviewCheckpointStore" error, and `curl -s http://127.0.0.1:3999/health` answers 200 with `database` and `redis` both `connected` (`docs/api-reference.md`). If the stack cannot be started in your environment, say "stack not booted" in the report; do not claim it.

- [ ] **Step 3: The in-process end-to-end review**

The two many-batch runner tests are the end-to-end check: `pr-review.runner.spec.ts` ("reviews all of it ... when the change needs several batches") and `commit-review.runner.spec.ts` ("reviews every file in several calls") drive the real runner, the real `BatchedReviewService`, packer, validator, merge and pacer with a fake `AiClientService`; Groq's URL is fixed in code, so a fake HTTP server would need a production seam this plan does not add. Re-running them is not needed after Step 1. If `GROQ_API_KEY_DEV` exists, Task 12 supplies the live equivalent.

- [ ] **Step 4: Stop the dev server and containers you started.** Do not leave `dist/` or `.env` changes in `git status`.

- [ ] **Step 5: Fix and commit only if a gate failed.** One commit per fix, naming the files.

---

### Task 12: Live measurement and retune (conditional on `GROQ_API_KEY_DEV`)

**Files:**
- Create (only if the key exists): `prism-api/scripts/measure-batching-live.ts`, `docs/superpowers/spikes/2026-11-08-batching-live.md`
- Modify (only if the numbers justify it): `prism-api/src/modules/review/batching.config.ts` and its spec; `docs/known-issues.md`; `docs/superpowers/PROGRESS.md`

- [ ] **Step 1: Check for the key without printing it.**

Run: `node -e "console.log(process.env.GROQ_API_KEY_DEV ? 'key present' : 'key missing')"`
If it prints `key missing`: **stop this task.** Append to `docs/superpowers/PROGRESS.md` under notes: "Phase 0b live measurement: not measured, no `GROQ_API_KEY_DEV`; `batching.config.ts` values are the spike's unmeasured defaults." Make no code change, do not look for any other key, and **never read the repo-root `.env`**. Commit that one doc line. Do not fake numbers.

- [ ] **Step 2: If the key is present, create the script** `prism-api/scripts/measure-batching-live.ts` (the author compiled it with `ts-node` and ran its no-key path, which prints `not measured` and makes no call; it was not run with a key):

```ts
/**
 * Part C of the Phase 0b spike: a handful of REAL Groq calls with the real
 * batching code, to replace the estimates in docs/superpowers/spikes/2026-11-08-batching-spike.md
 * with measurements. Not part of the application; nothing imports it.
 *
 * It reads ONE variable, GROQ_API_KEY_DEV, from the shell. If it is not set the
 * script says so and exits without making a call: do not look for another key,
 * and never read the repository-root .env.
 *
 * Usage (from prism-api/, Node >= 20.11):
 *
 *   npx ts-node scripts/measure-batching-live.ts --cache <dir> --out <results.json>
 *
 * `--cache` is the spike's cache directory (sample.json plus the raw .diff
 * files, see scripts/measure-batching.ts). `--max-calls` defaults to 15 and is
 * capped at 15. The first calls are sent back to back, on purpose, so the point
 * where Groq starts answering 429 shows how it counts tokens; later calls use
 * the pacer. It stops at the second 429 in a row.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GROQ_MODELS } from '../src/ai/ai-client.service';
import { extractJson } from '../src/ai/json-extractor';
import { PromptBuilderService } from '../src/ai/prompt-builder.service';
import { GroqProvider } from '../src/ai/providers/groq.provider';
import { AI_TIMEOUT_MS } from '../src/ai/providers/http';
import { TokenPacer, systemClock } from '../src/ai/token-pacer';
import { packForReview } from '../src/diff/batch-pack';
import { detectLanguages } from '../src/diff/language-detector';
import { prepareBatch } from '../src/diff/prepare';
import { BATCH_CONFIG, GROQ_FREE_PACE } from '../src/modules/review/batching.config';

const HARD_MAX_CALLS = 15;
const UNPACED_CALLS = 4;

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);

  return i !== -1 && process.argv[i + 1] ? (process.argv[i + 1] as string) : fallback;
}

interface SampleItem {
  kind: 'pr' | 'commit';
  repo: string;
  ref: string;
}

interface CallRecord {
  diff: string;
  batch: number;
  paced: boolean;
  estimatedTokens: number;
  tokensSentInPreviousMinute: number;
  waitedMs: number;
  latencyMs: number;
  status: number;
  responseChars: number;
  parsed: boolean;
}

async function main(): Promise<void> {
  const apiKey = process.env['GROQ_API_KEY_DEV'];

  if (!apiKey) {
    console.log('not measured: no development key (GROQ_API_KEY_DEV is not set). No call was made.');

    return;
  }

  const cache = arg('cache', join(__dirname, '.batching-cache'));
  const out = arg('out', join(cache, 'live-results.json'));
  const maxCalls = Math.min(Number(arg('max-calls', String(HARD_MAX_CALLS))) || HARD_MAX_CALLS, HARD_MAX_CALLS);
  const sample = JSON.parse(readFileSync(join(cache, 'sample.json'), 'utf8')) as SampleItem[];
  const system =
    'Respond with ONLY raw JSON. NO prose. NO markdown code fences. NO explanations before or after.\n\n';
  const provider = new GroqProvider();
  const pacer = new TokenPacer(GROQ_FREE_PACE, systemClock);
  const records: CallRecord[] = [];
  const sent: { at: number; tokens: number }[] = [];
  let consecutive429 = 0;
  let diffsUsed = 0;

  for (const item of sample) {
    if (records.length >= maxCalls || diffsUsed >= 5 || consecutive429 >= 2) break;

    const file = join(cache, `${item.repo}_${item.kind}_${item.ref}`.replace(/[^\w.-]/g, '_') + '.diff');

    if (!existsSync(file)) continue;

    const diff = readFileSync(file, 'utf8');
    const packed = packForReview(diff, BATCH_CONFIG);

    // Only diffs that need several calls teach anything about pacing.
    if (packed.batches.length < 2 || packed.batches.length > 4) continue;

    diffsUsed += 1;
    const prompt = new PromptBuilderService().buildSystemPrompt(detectLanguages(diff), 'pull request');

    for (const batch of packed.batches) {
      if (records.length >= maxCalls || consecutive429 >= 2) break;

      const prepared = prepareBatch(batch.text);
      const estimated = pacer.estimate(prepared.body.length);
      const paced = records.length >= UNPACED_CALLS;
      const waitedMs = paced ? await pacer.acquire(estimated) : 0;
      const now = Date.now();
      const previousMinute = sent.filter((s) => now - s.at < 60_000).reduce((n, s) => n + s.tokens, 0);
      const started = Date.now();
      const result = await provider.complete({
        model: GROQ_MODELS[0] as string,
        system: system + prompt,
        user: `Review this diff (part ${batch.index + 1} of ${packed.batches.length} of one change):\n${prepared.body}`,
        context: 'pr_review',
        apiKey,
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });

      sent.push({ at: started, tokens: estimated });
      consecutive429 = result.status === 429 ? consecutive429 + 1 : 0;
      records.push({
        diff: `${item.repo}#${item.ref.slice(0, 8)}`,
        batch: batch.index + 1,
        paced,
        estimatedTokens: estimated,
        tokensSentInPreviousMinute: previousMinute,
        waitedMs,
        latencyMs: Date.now() - started,
        status: result.status,
        responseChars: result.content?.length ?? 0,
        parsed: result.ok && extractJson(result.content ?? '') !== null,
      });
    }
  }

  writeFileSync(out, JSON.stringify({ model: GROQ_MODELS[0], records }, null, 2));
  console.table(records);
  console.log(`calls ${records.length}, 429s ${records.filter((r) => r.status === 429).length}; results written to ${out}`);
}

void main();
```

- [ ] **Step 3: Run it** (`npx ts-node scripts/measure-batching-live.ts --cache <dir> --out <results.json>`; at most 15 calls). Write `docs/superpowers/spikes/2026-11-08-batching-live.md`: latency p50 and max per call, parse rate, 429 count and the estimated-tokens-in-window at the first 429 (this is what answers whether reserved `max_completion_tokens` counts against the per-minute limit), and what it changes.

- [ ] **Step 4: Retune only what the numbers justify**, in `batching.config.ts` and its spec: `assumedOutputTokens` from observed output; `GROQ_FREE_PACE.charsPerToken`; `batchChars` if calls are far slower or less parseable than assumed. `jobBudgetMs` follows by derivation; run `npm test -- src/modules/review/ src/modules/account` (the budget and marker specs are the guards) and `npm run typecheck`. Update `docs/known-issues.md` (the "Batched review is unmeasured" bullet shrinks to what is still unmeasured) and ADR 0013 if a number it states changed.

- [ ] **Step 5: Commit** the script, the report, the retune and the doc edits by name, with a message that states the measured numbers and what was **not** measured (review quality is still not measured by this script).

---

## Self-review

### Spec coverage (the spike's "Inputs" and the owner's 11 items)

| Requirement | Task |
|---|---|
| Spike input 1: 16,000 chars, cap 8, configurable; overflow via the 0a label in Risk Radar order | 1, 3, 6, 7 |
| Spike input 2: split over-budget hunks at line boundaries | 1 |
| Spike input 3: derived budget formula, re-check against `reviewBackoffStrategy` and concurrency-1 blocking | 3, 9, 10 (ADR) |
| Spike input 4: pace against 8,000 TPM, clean daily-429 end state, measure with a dev key first | 2, 6, 12 |
| Spike input 5: idempotent per-batch persistence with resume; `throwIfAborted` before each side effect | 5, 6 |
| Spike input 6: import grouping optional; test a summary separately | Not built; stated in Decisions and ADR |
| Spike input 7: run part C before fixing numbers 1 and 3 | 12 (conditional; constants stay defaults until then, as the owner chose) |
| Item 1 packer, constants module | 1, 3 |
| Item 2 anchors across batches | 4, 6 |
| Item 3 both runners, shared module, `throwIfAborted` | 6, 7, 8 |
| Item 4 merge, dedupe, `orderFindings`, finding budget, summary, score | 4, 7 |
| Item 5 checkpoint, store, erasure, changed head SHA | 5, 6 |
| Item 6 derived budget, per-batch deadline, concurrency-1 | 3, 6, 9 |
| Item 7 pacer, profile, 429 mid-review, T13, personal keys | 2, 3, 6, 10 |
| Item 8 fixes pass once, unchanged limit stated | Decisions 8, 7, 10 |
| Item 9 outcome states, `composeSummary` / `summary-comment.builder.ts` re-checked | Decisions 9, 7, 8 |
| Item 10 docs, ADR, code map, `CLAUDE.md` | 10 |
| Item 11 verification, final gate, live measurement, local end-to-end | 11, 12 |

### Placeholder scan

Searched this plan for "TBD", "TODO", "implement later", "similar to Task", "add appropriate", "fill in": none. Every code step carries the complete file or diff. Docs steps (Task 10) give the exact text or the exact replacement. Task 12 Step 4 (retune) is conditional on measured numbers by nature and says which constants may move and which tests guard them.

### Type and name consistency

`BatchConfig`, `RiskRank`, `ReviewBatch`, `PackedReview`, `packForReview`, `selectionFor` (Task 1) are used by Tasks 3 and 6 with the same signatures. `PaceProfile`/`PaceClock`/`TokenPacer` (Task 2) are used by Tasks 3 and 6. `BatchResult`/`MergedReview`/`mergeBatchResults` (Task 4) are used by Tasks 5, 6 and 7. `CheckpointRef` (Task 5) is the `ref` of Task 6's input and the `checkpoint` constants in Tasks 7 and 8 (`{ kind: 'pr' | 'commit', id, ownerId }`). `BatchedOutcome.status` is `'reviewed' | 'unusable'` in the service, both runners and all tests. Constructor argument orders of both runners are stated in Tasks 7 and 8 and match the specs. `jobBudgetMs(maxBatches, pace?)` (Task 3) is what `review.queue.ts` calls (Task 9).

### Verified against this branch (grep/read at plan time)

Paths and symbols cited exist on `spike-phase0b-batching`: `prism-api/src/diff/{prepare,file-selection,hunk-index,render,git-paths,risk-radar,language-detector}.ts`, `prism-api/src/modules/review/{pr-review.runner,commit-review.runner,review.queue,review.processor,review.module,review-summary,summary-comment.builder}.ts`, `prism-api/src/ai/{ai-client.service,issue-validator,fixes.service,verdict,json-extractor,prompt-builder.service,user-ai-settings.service}.ts`, `prism-api/src/modules/account/{account-data.service,account-data.module,erasure-marker}.ts`, `prism-api/src/modules/risk/review-risk.store.ts` (the pattern copied), `prism-api/src/redis/redis.constants.ts` (`REDIS_CLIENT`, Redis module is `@Global`), `prism-api/scripts/measure-batching.ts`, `docs/adr/0003`, `0006`, `0011`, `0012`, `docs/known-issues.md` (T13 at the heading `### T13.`), `docs/code-map.md`. There was no `commit-review.runner.spec.ts` and no `DIFF_LIMIT` mention in `CLAUDE.md`.

### Owner decisions and open questions

1. **Worker blocking (ADR 0013):** a long review blocks the concurrency-1 worker, up to 34.5 min worst case (about 8 min typical for 8 batches on the free tier). Accept, or raise concurrency/add a worker (memory is 512 MB, unmeasured)?
2. **`MIN_COVERAGE` stays 0.5:** a capped review that read 7 of 8 files keeps its score and shows the coverage sentence but not the "Partial review" label. If "partial is only the failure fallback" should mean any shortfall is labelled, raise it to 1.0 (one constant, but ADR 0011 and its tests assume 0.5).
3. **Pacing time:** 8 free-tier batches wait about 8 minutes in total. The owner accepted the spike's defaults; the live run may change this.
4. **`ai_model_used`** may now read `groq/a, groq/b` when two models answered in one review (a varchar; the model label for the fixes pass is the last batch's).
5. **A personal provider key is unpaced**; its Groq fallback is unpaced too, so a long review on a flaky own key can end partial on a Groq 429.
6. **Fixes pass** sees only the first 4,000 characters (T17); not fixed here.
