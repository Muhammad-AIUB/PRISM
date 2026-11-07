# 0011. Partial review on thin coverage

Status: Accepted
Date: 2026-11-07

## Context

When a change is bigger than the diff budget, the model reads only some of its files. The review used to
complete anyway, with a score, and with no findings it rendered as a green "Nothing found". The coverage
sentence ("Reviewed 2 of 8 changed files.") existed but sat inside the summary text, below the verdict.
A review that read a quarter of the code must not read as clean.

## Decision

- **Threshold `MIN_COVERAGE = 0.5`** (`ai/verdict.ts`). `coverageRatio()` in `diff/file-selection.ts` is the
  share of reviewable files shown to the model. A partly included file counts as half. Lockfiles and
  generated files are noise and are out of the denominator, not "missed".
- **`partial` overrides `worth_a_look` and `nothing_found`, never `blocking`.** A checkable blocker found in
  30% of the code is still a blocker.
- **Under the threshold the stored `overall_score` is `null`.** Today `null` also means "no model answered";
  the summary marker is what tells the two apart.
- **No schema change, no new API field.** Like `not_reviewed`, the verdict is derived on read; the signal is
  a fixed leading sentence in `reviews.summary` (`PARTIAL_REVIEW`). `verdict: "partial"` is an additive value.

## Consequences

- A fourth fixed summary string: reword `PARTIAL_REVIEW` and `isPartialReview()` together, and keep
  `composeSummary` writing it first.
- `totalFiles` also counts diff chunks whose header `parseGitHeader` cannot parse; they are in neither
  `files` nor `skipped`, so they lower the ratio slightly. Accepted.
- Old reviews carry no marker and keep their old verdict. No backfill.
- The verdict stays a summary-text convention until a later phase has a reason to add a column.
- Complete coverage of large changes is a separate piece of work (batched review); this is the safety net.

## Alternatives considered

- **Keep the score and only add a caption.** Rejected: a number beside a caveat still reads as a result.
- **Store the verdict or the ratio.** Rejected: needs hand-applied DDL for no present benefit.
- **Let `partial` also override `blocking`.** Rejected: hides a real, verifiable finding.
