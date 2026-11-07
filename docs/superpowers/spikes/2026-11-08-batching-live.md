# Phase 0b spike, part C: live Groq measurement (2026-11-08)

Script: `prism-api/scripts/measure-batching-live.ts` (real `packForReview`, `prepareBatch`, `GroqProvider`, `TokenPacer`; nothing else calls Groq). Model: `openai/gpt-oss-120b` (first in `GROQ_MODELS`), a free-tier development key. Diffs came from the spike's cached sample; only diffs that pack into 2 to 4 batches were used. **11 live calls in total** (cap 15), in two runs:

1. **Unpaced burst** (default: first 4 calls back to back): 3 calls, stopped by the script at the second 429 in a row.
2. **Fully paced** (`--unpaced 0 --max-calls 8`, started more than a minute later): 8 calls through `TokenPacer` with `GROQ_FREE_PACE`.

## Results

| | Run 1 (unpaced) | Run 2 (paced) |
|---|---|---|
| Calls | 3 | 8 |
| 200 | 1 | 8 |
| 429 | 2 | 0 |
| Pacer waits (ms) | none | 56,858 to 58,974 per call after the first |

Across the 9 successful calls:

- **Latency per call:** p50 1.8 s, max 3.1 s (1.0 s to 3.1 s). The two 429s came back in 62 ms and 91 ms.
- **Parse rate:** 9 of 9 replies were valid JSON (`extractJson` non-null). Replies were 134 to 1,224 characters.
- **Output tokens (`completion_tokens`):** 178 to 1,246; median 544, mean about 590. `assumedOutputTokens` is 1,200, so it sits at the observed maximum.
- **Estimated against actual:** the pacer's estimate (`chars/3.5 + 800 + 1200`) summed to 50,728 tokens for the 9 successful calls; Groq's reported prompt plus completion tokens summed to 45,644. Per call the estimate ran 4% to 65% high (11% on aggregate); it never under-estimated.
- **Tokens per minute:** the largest actual one-minute total sent was 6,541 (run 2, one call per minute). Run 2 sent one call per minute throughout, because every adjacent pair of estimates exceeds 8,000 (so does every pair of 6,000-token batches).

## The 429 (what it says about counting)

Run 1: call 1 (actual 6,148 prompt + 220 completion = 6,368 tokens) succeeded. Call 2, sent immediately after, needed about 1,326 prompt tokens (its actual cost in run 2 was 1,326 + 260). It was refused with 429.

- If only real tokens counted, the window would hold 6,368 + 1,326 = 7,694 plus whatever the reply used, which is under 8,000. A 429 anyway means the allowance is stricter than "actual tokens against 8,000".
- `max_completion_tokens` is 8,192 on every request. Call 1 alone (6,148 + 8,192) already exceeds 8,000 and was accepted, so the **full reservation is not charged**. Whether a partial reservation is charged, or the true limit for this model is below 8,000, **cannot be told from this data**: the script did not record the 429's response headers or body (retry-after, remaining-tokens). That is the open question.
- Practical reading: a pacer that assumes about 1,200 output tokens and keeps the estimate above actual is the right side to err on. The 429 at 7,694 actual tokens is the evidence that trimming margin would be unsafe.

## What it changes

**No constant was changed.**

- `assumedOutputTokens` (1,200): observed maximum 1,246 and median 544 over 9 calls. Lowering it would save pacing time but removes the margin that the 429 above shows is needed. Not justified by 9 samples.
- `charsPerToken` (3.5): the estimate is already 11% high on aggregate and never low. Raising it would shrink the margin for the same reason.
- `batchChars` (16,000) and `maxBatches` (8): calls were fast (max 3.1 s) and 9 of 9 parsed. Nothing here argues for a change.
- `jobBudgetMs` follows by derivation, so it is unchanged (34.5 minutes).
- Pacing time confirmed: about 58 s between calls, so 8 free-tier batches take about 8 minutes, as the spike and ADR 0013 state.

## Not measured

- Review quality (finding accuracy, fabrication, cross-file blindness): this script does not score replies, only whether they parse.
- The 429's headers and body, so the exact counting rule.
- Whether the two Groq models share the daily quota (no call reached the second model).
- Only 4 diffs and 11 calls in total; reviews of more than 4 batches; the fixes pass; runs with a user's own key.
