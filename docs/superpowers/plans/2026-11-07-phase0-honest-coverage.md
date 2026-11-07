# Phase 0a: Honest Coverage Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Scope note:** This is part **0a** of Phase 0. The owner requires every PR and commit to be reviewed in full, which is **0b** (batched review, see the roadmap). 0a is the safety net that keeps a failed or capped review from ever reading as clean; it ships first because it is small.

**Goal:** A review that looked at under half of the reviewable code never shows a score or a green "Nothing found"; it says "Partial review" on every surface.

**Architecture:** `file-selection.ts` already knows which files were included, partial or skipped. Add a pure `coverageRatio()` there, expose it on `PreparedDiff`, and let `ai/verdict.ts` own the threshold. Verdict is derived on read from the findings plus the stored summary (ADR 0010), so "partial" travels the same way the two `not_reviewed` strings do: a fixed leading sentence in `reviews.summary`. No schema change, no new API field.

**Tech Stack:** NestJS 11 + Jest (prism-api), Next.js 15 + Vitest (prism-web), TypeScript.

## Global Constraints

- No schema change: `synchronize: false`, DDL is hand-applied. Verdict is never stored.
- `/api/v1` is additive-only. `overall_score` stays in every response (nullable already). A new `verdict` value `partial` is additive.
- `pr-review.runner.ts` and `commit-review.runner.ts` are near-parallel: change both.
- The fixed summary strings in `ai/verdict.ts` are a contract: change writers and recogniser together.
- Golden fixtures in `prism-api/test/fixtures/` are frozen. This plan must not change any prompt.
- Log with Nest `Logger`, never `console.*`. Timestamps via `common/utils/iso8601.ts`.
- UI: text >= 12px, colours from tokens (no hex), works at 390px.
- Commits: one logical change, imperative subject, body says why, stage files by name, end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Gate before each commit, in every package touched: `npm run typecheck && npm run lint && npm test` (narrow tests while editing; full suite once before the last commit).

## Decisions made here (flag in the ADR)

1. Threshold `MIN_COVERAGE = 0.5`. A partially included file counts as half a file. Lockfiles and generated files are out of scope, not "missed".
2. `partial` overrides `worth_a_look` and `nothing_found`, but never `blocking`: a verifiable blocker found in 30% of the code is still a blocker.
3. Under the threshold the stored `overall_score` is `null`. Today `null` means "no model answered"; the summary marker is what tells the two apart.

## File Structure

| File | Change |
|---|---|
| `prism-api/src/diff/file-selection.ts` | `Selection.noise`, `coverageRatio()` |
| `prism-api/src/diff/prepare.ts` | `PreparedDiff.coverageRatio` |
| `prism-api/src/ai/verdict.ts` | `MIN_COVERAGE`, `isUnderCovered`, `PARTIAL_REVIEW`, `isPartialReview`, `'partial'` verdict, `scoreFor` |
| `prism-api/src/modules/review/review-summary.ts` | `composeSummary(..., partial)` |
| `prism-api/src/modules/review/pr-review.runner.ts`, `commit-review.runner.ts` | use `scoreFor` and pass `partial` |
| `prism-api/src/modules/review/summary-comment.builder.ts` | label table + `verdictForReview` |
| `prism-web/src/lib/types.ts`, `components/review/parts.tsx` | `partial` verdict and its panel |
| `docs/review-pipeline.md`, `docs/adr/0011-...md`, `docs/adr/README.md`, `docs/known-issues.md`, `CLAUDE.md` | docs in the same commit as the code |

---

### Task 1: Coverage ratio in file selection

**Files:**
- Modify: `prism-api/src/diff/file-selection.ts`
- Test: `prism-api/src/diff/file-selection.spec.ts` (reuse its `file()` and `hunk()` helpers)

**Interfaces:**
- Produces: `Selection.noise: string[]`; `export function coverageRatio(selection: Selection): number` (0..1, `1` when nothing reviewable).

- [x] **Step 1: Write the failing tests** (append to `file-selection.spec.ts`, and add `coverageRatio` to the import)

```ts
import { coverageRatio, selectForReview } from './file-selection';

describe('coverageRatio', () => {
  it('is 1 when every reviewable file is included whole', () => {
    const diff = file('a.ts', [hunk(1, ['+const a = 1'])]) + file('b.ts', [hunk(1, ['+const b = 2'])]);

    expect(coverageRatio(selectForReview(diff, 10_000))).toBe(1);
  });

  it('does not count lockfiles as missed code', () => {
    const diff =
      file('a.ts', [hunk(1, ['+const a = 1'])]) + file('package-lock.json', [hunk(1, ['+x'])]);
    const selection = selectForReview(diff, 10_000);

    expect(selection.noise).toEqual(['package-lock.json']);
    expect(coverageRatio(selection)).toBe(1);
  });

  it('is 1/8 when only the first of eight files fits', () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const diff = names.map((n) => file(`${n}.ts`, [hunk(1, [`+const ${n} = 1`])])).join('');
    const budget = file('a.ts', [hunk(1, ['+const a = 1'])]).length;

    expect(coverageRatio(selectForReview(diff, budget))).toBeCloseTo(0.125);
  });

  it('counts a file included only in part as half', () => {
    const diff = file('a.ts', [hunk(1, ['+one']), hunk(10, ['+two'])]);
    const budget = file('a.ts', [hunk(1, ['+one'])]).length;
    const selection = selectForReview(diff, budget);

    expect(selection.partial).toEqual(['a.ts']);
    expect(coverageRatio(selection)).toBe(0.5);
  });

  it('is 1 when the change is nothing but noise', () => {
    const selection = selectForReview(file('yarn.lock', [hunk(1, ['+x'])]), 10_000);

    expect(coverageRatio(selection)).toBe(1);
  });
});
```

- [x] **Step 2: Run to verify failure**

Run (in `prism-api/`): `npm test -- src/diff/file-selection`
Expected: FAIL, `coverageRatio is not a function` / TS error on `noise`.

- [x] **Step 3: Implement** in `file-selection.ts`

Add to `interface Selection` after `partial`:

```ts
  /** The subset of `skipped` that is generated, vendored, locked or binary. Not code anyone has to review. */
  noise: string[];
```

In `selectForReview`, add `noise: [],` to the initial `selection` object, and in the NOISE branch:

```ts
    if (NOISE.test(path)) {
      selection.skipped.push(path);
      selection.noise.push(path);
      continue;
    }
```

Append:

```ts
/**
 * The share of the code a person would have to read that the model was actually
 * shown. A file included only in part counts as half. Noise is out of scope:
 * a lockfile the model never saw is not a hole in the review.
 */
export function coverageRatio(selection: Selection): number {
  const reviewable = selection.totalFiles - selection.noise.length;

  if (reviewable <= 0) {
    return 1;
  }

  return (selection.files.length - selection.partial.length * 0.5) / reviewable;
}
```

- [x] **Step 4: Run to verify pass**

Run: `npm test -- src/diff/file-selection`
Expected: PASS. If an older test does `toEqual` on a whole `Selection`, add `noise: []` to its expectation.

- [x] **Step 5: Commit**

```bash
git add prism-api/src/diff/file-selection.ts prism-api/src/diff/file-selection.spec.ts
git commit -m "Compute how much of a change the model was shown"
```

---

### Task 2: Expose the ratio on PreparedDiff

**Files:**
- Modify: `prism-api/src/diff/prepare.ts`
- Test: `prism-api/src/diff/prepare.spec.ts`

**Interfaces:**
- Consumes: `coverageRatio(selection: Selection): number`
- Produces: `PreparedDiff.coverageRatio: number`

- [x] **Step 1: Failing test** (append to `prepare.spec.ts`; reuse its diff helpers if it has them, else inline as below)

```ts
describe('prepareDiff coverageRatio', () => {
  const one = (n: string): string =>
    `diff --git a/${n}.ts b/${n}.ts\nindex 1111111..2222222 100644\n--- a/${n}.ts\n+++ b/${n}.ts\n@@ -1,1 +1,1 @@\n+const ${n} = 1\n`;

  it('is 1 when everything fit', () => {
    expect(prepareDiff(one('a') + one('b'), 10_000).coverageRatio).toBe(1);
  });

  it('is below 1 when files were left out', () => {
    const diff = ['a', 'b', 'c', 'd'].map(one).join('');

    expect(prepareDiff(diff, one('a').length).coverageRatio).toBeCloseTo(0.25);
  });
});
```

- [x] **Step 2:** Run `npm test -- src/diff/prepare`. Expected: FAIL (`coverageRatio` undefined).

- [x] **Step 3: Implement.** Import `coverageRatio` next to `selectForReview`; add to the interface `/** 0..1 share of reviewable code the model saw. */ coverageRatio: number;` and to the returned object `coverageRatio: coverageRatio(selection),`.

- [x] **Step 4:** Run `npm test -- src/diff`. Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add prism-api/src/diff/prepare.ts prism-api/src/diff/prepare.spec.ts
git commit -m "Carry the coverage ratio on the prepared diff"
```

---

### Task 3: The partial verdict, the score rule and the summary marker

**Files:**
- Modify: `prism-api/src/ai/verdict.ts`, `prism-api/src/modules/review/review-summary.ts`
- Test: `prism-api/src/ai/verdict.spec.ts`, `prism-api/src/modules/review/review-summary.spec.ts`

**Interfaces:**
- Produces from `verdict.ts`: `MIN_COVERAGE = 0.5`; `isUnderCovered(ratio: number): boolean`; `PARTIAL_REVIEW: string`; `isPartialReview(summary): boolean`; `Verdict` gains `'partial'`; `scoreFor(score: number | null, verdict: Verdict, ratio: number): number | null`; `verdictForReview` returns `'partial'`.
- Produces from `review-summary.ts`: `composeSummary(modelSummary, coverage, dropped, partial = false)`.

- [x] **Step 1: Failing tests**

`verdict.spec.ts` (add imports `EMPTY_REVIEW, PARTIAL_REVIEW, isUnderCovered, scoreFor, verdictForReview` from `./verdict`, and `type ReviewIssue` from `../database/entities/review.entity`):

```ts
describe('partial reviews', () => {
  const blocking = { category: 'auth_weakened', severity: 'critical' } as ReviewIssue;
  const minor = { category: 'style', severity: 'suggestion' } as ReviewIssue;
  const partialSummary = `${PARTIAL_REVIEW}\n\nReviewed 2 of 8 changed files.`;

  it('is under-covered strictly below one half', () => {
    expect(isUnderCovered(0.49)).toBe(true);
    expect(isUnderCovered(0.5)).toBe(false);
  });

  it('turns a clean result on thin coverage into partial, not nothing_found', () => {
    expect(verdictForReview([], partialSummary)).toBe('partial');
    expect(verdictForReview([minor], partialSummary)).toBe('partial');
  });

  it('keeps blocking when a checkable blocker was found', () => {
    expect(verdictForReview([blocking], partialSummary)).toBe('blocking');
  });

  it('still reports not_reviewed before partial', () => {
    expect(verdictForReview([], EMPTY_REVIEW)).toBe('not_reviewed');
  });

  it('drops the score under the threshold and reconciles it above', () => {
    expect(scoreFor(95, 'nothing_found', 0.25)).toBeNull();
    expect(scoreFor(95, 'nothing_found', 0.5)).toBe(95);
    expect(scoreFor(88, 'blocking', 1)).toBe(60);
    expect(scoreFor(null, 'nothing_found', 1)).toBeNull();
  });
});
```

`review-summary.spec.ts` (import `PARTIAL_REVIEW` from `'../../ai/verdict'`):

```ts
it('leads with the partial-review marker, before the coverage sentence', () => {
  const out = composeSummary('Looks fine.', 'Reviewed 2 of 8 changed files.', 0, true);

  expect(out?.startsWith(PARTIAL_REVIEW)).toBe(true);
  expect(out).toContain('Reviewed 2 of 8 changed files.');
});

it('does not add the marker by default', () => {
  expect(composeSummary('Looks fine.', null, 0)).toBe('Looks fine.');
});
```

- [x] **Step 2:** Run `npm test -- src/ai/verdict src/modules/review/review-summary`. Expected: FAIL (missing exports).

- [x] **Step 3: Implement** `verdict.ts`

Change the type and add:

```ts
export type Verdict = 'blocking' | 'worth_a_look' | 'nothing_found' | 'not_reviewed' | 'partial';

/** Below this share of reviewable code seen, a score and an all-clear are both claims we cannot back. */
export const MIN_COVERAGE = 0.5;

export const isUnderCovered = (ratio: number): boolean => ratio < MIN_COVERAGE;

/**
 * Leads `reviews.summary` when too little of the change was covered. Recognised
 * by `isPartialReview`; `composeSummary` writes it. Reword both or neither.
 */
export const PARTIAL_REVIEW =
  'Partial review: too little of this change was covered to give it a score.';

export function isPartialReview(summary: string | null | undefined): boolean {
  return Boolean(summary && summary.startsWith(PARTIAL_REVIEW));
}
```

Replace `verdictForReview`:

```ts
export function verdictForReview(
  findings: readonly ReviewIssue[],
  summary: string | null | undefined,
): Verdict {
  if (isIncompleteReview(summary)) {
    return 'not_reviewed';
  }

  const verdict = verdictFor(findings);

  // A checkable blocker survives thin coverage; nothing else may read as clean.
  return verdict !== 'blocking' && isPartialReview(summary) ? 'partial' : verdict;
}
```

Add after `reconcileScore`:

```ts
/** The stored score: none when coverage is too thin to stand behind one, otherwise reconciled with the verdict. */
export function scoreFor(score: number | null, verdict: Verdict, ratio: number): number | null {
  return isUnderCovered(ratio) ? null : reconcileScore(score, verdict);
}
```

`review-summary.ts`: `import { PARTIAL_REVIEW } from '../../ai/verdict';`, add param `partial = false`, and first in the function body after `const notes`:

```ts
  if (partial) {
    notes.push(PARTIAL_REVIEW);
  }
```

- [x] **Step 4:** Run the same command. Expected: PASS.

- [x] **Step 5: Do not commit yet.** Adding `'partial'` makes `Record<Verdict, string>` in `summary-comment.builder.ts` fail typecheck until Task 4 lands, and the gate is typecheck-clean commits. Tasks 3 and 4 are one commit (message in Task 4).

---

### Task 4: Wire both runners and the GitHub comment

**Files:**
- Modify: `prism-api/src/modules/review/pr-review.runner.ts` (~L159-169), `commit-review.runner.ts` (~L136-148), `summary-comment.builder.ts`
- Test: `prism-api/src/modules/review/pr-review.runner.spec.ts`, `summary-comment.builder.spec.ts`

**Interfaces:**
- Consumes: `prepared.coverageRatio`, `scoreFor`, `isUnderCovered`, `composeSummary(..., partial)`

- [x] **Step 1: Failing tests**

First read the setup of `describe('PullRequestReviewRunner reviewed-revision risk')` in `pr-review.runner.spec.ts` (it mocks the diff fetch, the AI client and `reviews.save`) and copy it for a new `describe('PullRequestReviewRunner coverage')`. Case 1: the fetched diff is eight files of 150 added lines each (about 3 KB per file, so only two fit in the 8,000-character budget, ratio 0.25) and the mocked model returns `overall_score: 95`, no issues. The runner persists with `reviews.save`; assert on its first argument:

```ts
const [saved] = reviews.save.mock.calls[0];

expect(saved.overallScore).toBeNull();
expect(saved.summary?.startsWith(PARTIAL_REVIEW)).toBe(true);
```

Case 2: a one-file diff with the same model reply: `saved.overallScore` is `95` and `saved.summary` does not start with `PARTIAL_REVIEW`. Add a matching pair for `commit-review.runner.ts` if it has a spec; if it has none, note that in the commit body rather than inventing a harness.

`summary-comment.builder.spec.ts`, append:

```ts
it('labels a thin review as partial and prints no score', () => {
  const body = builder.buildForPullRequest({
    ...baseReview,
    overallScore: null,
    summary: `${PARTIAL_REVIEW}\n\nReviewed 2 of 8 changed files.`,
  });

  expect(body).toContain('**PARTIAL REVIEW**');
  expect(body).not.toContain('Score');
});
```

(`builder` and `baseReview` are whatever the existing spec calls its builder and base fixture; reuse them.)

- [x] **Step 2:** Run `npm test -- src/modules/review/`. Expected: new tests FAIL.

- [x] **Step 3: Implement**

In both runners, import `isUnderCovered, scoreFor` from `'../../ai/verdict'` (replace the `reconcileScore` import if now unused) and replace the score and summary lines:

```ts
    const overallScore = scoreFor(clampScore(parsed.overall_score), verdict, prepared.coverageRatio);
    const summary = composeSummary(
      typeof parsed.summary === 'string' ? parsed.summary : null,
      prepared.coverage,
      dropped,
      isUnderCovered(prepared.coverageRatio),
    );
```

In `summary-comment.builder.ts`: import `verdictForReview` instead of `verdictFor`; add `partial: '**PARTIAL REVIEW**',` to `VERDICT_LABELS`; in `body()` use `verdictForReview(findings, review.summary)` and build the header line as:

```ts
    const verdictKey = verdictForReview(findings, review.summary);
    const verdict = VERDICT_LABELS[verdictKey];
    const count = findings.length === 1 ? '1 finding' : `${findings.length} findings`;
    const scorePart = verdictKey === 'partial' ? '' : ` · Score ${score}/100`;

    let out = `${verdict} — ${count}${scorePart}\n\n`;
```

- [x] **Step 4:** Run `npm test -- src/modules/review/` then `npm run typecheck && npm run lint`. Expected: all PASS. Golden fixtures untouched (no prompt change); if `npm test -- src/ai` goes red, stop and find out why.

- [x] **Step 5: Commit Tasks 3 and 4 together**

```bash
git add prism-api/src/ai/verdict.ts prism-api/src/ai/verdict.spec.ts prism-api/src/modules/review/review-summary.ts prism-api/src/modules/review/review-summary.spec.ts prism-api/src/modules/review/pr-review.runner.ts prism-api/src/modules/review/commit-review.runner.ts prism-api/src/modules/review/summary-comment.builder.ts prism-api/src/modules/review/pr-review.runner.spec.ts prism-api/src/modules/review/summary-comment.builder.spec.ts
git commit -m "Withhold the score and the all-clear on thin coverage"
```

---

### Task 5: Web panel, docs and ADR

**Files:**
- Modify: `prism-web/src/lib/types.ts:180`, `prism-web/src/components/review/parts.tsx` (VERDICTS table)
- Test: `prism-web/src/components/review/VerdictPanel.test.tsx`
- Docs: `docs/review-pipeline.md`, `docs/adr/0011-partial-review-on-thin-coverage.md` (new), `docs/adr/README.md`, `docs/known-issues.md`, `CLAUDE.md`

- [x] **Step 1: Failing test** (append to `VerdictPanel.test.tsx`, matching how existing cases render the panel)

```tsx
it('says partial and never shows a green all-clear', () => {
  render(<VerdictPanel verdict="partial" findings={[]} />);

  expect(screen.getByText('Partial review')).toBeInTheDocument();
  expect(screen.queryByText('Nothing found')).not.toBeInTheDocument();
});
```

- [x] **Step 2:** Run (in `prism-web/`) `npm test -- VerdictPanel`. Expected: FAIL (TS error: `'partial'` not assignable).

- [x] **Step 3: Implement**

`types.ts`: `export type Verdict = 'blocking' | 'worth_a_look' | 'nothing_found' | 'not_reviewed' | 'partial';` and extend the comment: `` `partial`: under half of the reviewable code was covered; no score. ``

`parts.tsx`, inside `VERDICTS`:

```tsx
  partial: {
    label: 'Partial review',
    color: 'var(--warning)',
    note: 'Too little of this change was covered to score it or call it clean. Read the coverage line in the summary, then review the rest by hand.',
  },
```

Docs: in `docs/review-pipeline.md` add a short "Coverage" subsection (threshold, half-credit for partial files, noise excluded, `null` score, marker string). Write ADR 0011 with the three decisions at the top of this plan and the consequence "fourth fixed summary string: reword `PARTIAL_REVIEW` and `isPartialReview` together". Add it to the ADR index. In `CLAUDE.md` change "behind two fixed summary strings in `ai/verdict.ts` that `isIncompleteReview()` recognises. Change both or neither." to also mention the partial marker recognised by `isPartialReview()`. Remove nothing from known-issues unless a "Reviewed 1 of N" entry exists; if it does, delete it.

- [x] **Step 4: Full gate, once**

Run in `prism-api/`: `npm run typecheck && npm run lint && npm test`
Run in `prism-web/`: `npm run typecheck && npm run lint && npm test`
Expected: all green.

- [x] **Step 5 (NOT DONE, stack not started): One browser check** (only now, not per edit). Start the stack once per `docs/development.md`, open a review whose summary starts with the partial marker, confirm the panel reads "Partial review" at 390px with no horizontal scroll. Stop the server.

- [x] **Step 6: Commit**

```bash
git add prism-web/src/lib/types.ts prism-web/src/components/review/parts.tsx prism-web/src/components/review/VerdictPanel.test.tsx docs/review-pipeline.md docs/adr/0011-partial-review-on-thin-coverage.md docs/adr/README.md docs/known-issues.md CLAUDE.md
git commit -m "Show partial reviews as partial in the web app and document why"
```

## Known limits (accepted, put in the ADR)

- `totalFiles` also counts diff chunks whose header `parseGitHeader` cannot parse; those are in neither `files` nor `skipped`, so they lower the ratio slightly. Rare; do not fix here.
- Old reviews have no marker, so they keep their old verdict. No backfill.
- The verdict stays a summary-text convention until a later phase has a reason to add a column.

## Out of scope for Phase 0 (do not creep)

Risk-based file choice, finding budget, evidence tiers, "answer first" page rework, `ReviewFeedTable` clickable rows. Those are Phase 1 in the roadmap.
