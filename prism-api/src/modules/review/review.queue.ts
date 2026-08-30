import type { JobsOptions, WorkerOptions } from 'bullmq';

/**
 * Queue identity and retry policy, mirroring the Laravel job classes.
 *
 * Laravel's worker consumes the `database` queue; this one consumes Redis via
 * BullMQ. They share no rows and cannot contend, which is what makes running
 * both during the migration safe. Laravel's worker must stay up until the web
 * re-analyze routes move in slice B.
 */
export const REVIEW_QUEUE = 'prism-reviews';

export const COMMIT_REVIEW_JOB = 'commit-review';
export const PR_REVIEW_JOB = 'pr-review';

/** Only the row id travels — never a serialised entity, as Laravel did. */
export interface CommitReviewJobData {
  commitReviewId: number;
}

export interface PullRequestReviewJobData {
  pullRequestId: number;
}

/** Laravel: public int $tries = 3. */
export const REVIEW_JOB_ATTEMPTS = 3;

/** Laravel: public array $backoff = [60, 180, 600] (seconds). */
export const REVIEW_JOB_BACKOFF_SECONDS = [60, 180, 600];

/** Laravel: public int $timeout = 120 (seconds, per attempt). */
export const REVIEW_JOB_TIMEOUT_MS = 120_000;

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
 * concurrency 1 matches the single `queue:work` process Laravel runs, which is
 * what keeps peak memory predictable on a 512MB box — commit 5eca1c6 exists
 * because that ceiling was breached once already.
 */
export const REVIEW_WORKER_OPTIONS: Pick<WorkerOptions, 'concurrency' | 'settings'> = {
  concurrency: 1,
  settings: { backoffStrategy: reviewBackoffStrategy },
};
