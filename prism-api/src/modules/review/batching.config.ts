import { GROQ_MODELS, GROQ_TIMEOUT_MS } from '../../ai/ai-client.service';
import type { PaceProfile } from '../../ai/token-pacer';
import type { BatchConfig } from '../../diff/batch-pack';
import { REQUEST_TIMEOUT_MS as GITHUB_TIMEOUT_MS } from '../../github/github-client.service';

/**
 * Every number batched review depends on, in one place.
 *
 * Each is a starting value chosen from the spike's offline results and Groq's
 * published free-tier limits. A live run of 11 calls (docs/superpowers/spikes/
 * 2026-11-08-batching-live.md) found no reason to move any of them, but is too
 * small to call them tuned. Retune them here; nothing else hard-codes them, and
 * the job budget (`jobBudgetMs`) follows.
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
