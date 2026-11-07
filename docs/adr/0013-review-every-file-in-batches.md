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
- **Single-batch reviews also pass through the merge** (dedupe on file, side, line and category; cap 40), so two
  different findings of the same category on one line now collapse into one.
- **`ai_model_used` may hold several model names** joined by ", " when batches fell back to different models;
  still well under `varchar(255)`.
- `prepareDiff` is no longer called by the runners (it remains tested); remove it in a follow-up.

## Rejected

- **8,000-character batches:** 11% of sampled diffs would exceed 8 calls (maximum 19), and twice the calls.
- **24,000-character batches:** one call alone nearly fills the per-minute allowance and very large prompts
  may degrade quality (unmeasured).
- **Global anchor numbering:** an id cited from another call could resolve to a file the model was not shown
  in that call; per-batch maps keep validation strict.
- **Waiting in-job on a daily limit:** the worker runs at concurrency 1 and would block every other review.
- **A table for the checkpoint:** hand-applied DDL for data worth keeping for hours.
