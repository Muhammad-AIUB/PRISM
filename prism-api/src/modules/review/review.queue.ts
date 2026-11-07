import type { JobsOptions, WorkerOptions } from 'bullmq';
import { BATCH_CONFIG, jobBudgetMs } from './batching.config';

/**
 * Queue identity and retry policy.
 *
 * The queue name is a live Redis key. Renaming it orphans anything already
 * enqueued rather than migrating it, so a deploy that changes this silently
 * drops the reviews in flight at the moment it ships.
 */
export const REVIEW_QUEUE = 'prism-reviews';

export const COMMIT_REVIEW_JOB = 'commit-review';
export const PR_REVIEW_JOB = 'pr-review';

/** Only the row id travels — never a serialised entity, as the original did. */
export interface CommitReviewJobData {
  commitReviewId: number;
}

export interface PullRequestReviewJobData {
  pullRequestId: number;
}

/** The original: public int $tries = 3. */
export const REVIEW_JOB_ATTEMPTS = 3;

/** The original: public array $backoff = [60, 180, 600] (seconds). */
export const REVIEW_JOB_BACKOFF_SECONDS = [60, 180, 600];

/**
 * Per-attempt budget, derived rather than written down.
 *
 * The PHP said `public int $timeout = 120`, and the port copied the number
 * without re-checking it against what one attempt actually does. It did not
 * fit then, and it fits less now: a review is up to MAX_BATCHES model calls,
 * each of which can spend the user's own model and the whole Groq chain, plus
 * a wait for the per-minute token allowance, then one fixes pass and a GitHub
 * round trip either side. `jobBudgetMs` (batching.config.ts) owns the
 * formula: change the batch cap, a provider timeout or the model list and this
 * budget follows, instead of silently going back under water.
 *
 * It is a ceiling that holds only if every call hangs. It is also how long the
 * single worker (concurrency 1) can be blocked, which is why the cap on
 * batches exists and why each batch has its own deadline inside it.
 */
export const REVIEW_JOB_TIMEOUT_MS = jobBudgetMs(BATCH_CONFIG.maxBatches);

/**
 * BullMQ's built-in `exponential`/`fixed` strategies cannot express
 * [60, 180, 600], so the schedule is supplied explicitly. `attemptsMade` is 1
 * after the first failure, hence the -1.
 */
export function reviewBackoffStrategy(attemptsMade: number): number {
  const index = Math.min(Math.max(attemptsMade - 1, 0), REVIEW_JOB_BACKOFF_SECONDS.length - 1);

  return (REVIEW_JOB_BACKOFF_SECONDS[index] ?? 600) * 1000;
}

export const REVIEW_JOB_OPTIONS: JobsOptions = {
  attempts: REVIEW_JOB_ATTEMPTS,
  backoff: { type: 'laravel' },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};

/**
 * concurrency 1 matches the single `queue:work` process the original runs, which is
 * what keeps peak memory predictable on a 512MB box — commit 5eca1c6 exists
 * because that ceiling was breached once already.
 */
export const REVIEW_WORKER_OPTIONS: Pick<WorkerOptions, 'concurrency' | 'settings'> = {
  concurrency: 1,
  settings: { backoffStrategy: reviewBackoffStrategy },
};
