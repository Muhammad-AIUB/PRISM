import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { CommitReviewRunner } from './commit-review.runner';
import { PullRequestReviewRunner } from './pr-review.runner';
import {
  COMMIT_REVIEW_JOB,
  PR_REVIEW_JOB,
  REVIEW_JOB_ATTEMPTS,
  REVIEW_JOB_TIMEOUT_MS,
  REVIEW_QUEUE,
  REVIEW_WORKER_OPTIONS,
  type CommitReviewJobData,
  type PullRequestReviewJobData,
} from './review.queue';

/**
 * The BullMQ worker. Thin on purpose: it routes by job name, enforces the
 * per-attempt timeout, and mirrors the original's failed() hook. All pipeline logic
 * lives in the two runners.
 *
 * BullMQ v5 removed job timeouts entirely, so the per-attempt timeout has to be
 * re-created here. Without it a hung provider call would hold the single worker
 * slot indefinitely and no review would ever run again.
 *
 * The timeout cancels rather than merely gives up. The first version raced the
 * work against a timer, but `Promise.race` does not stop the loser: the runner
 * carried on writing rows and posting GitHub comments while the retry ran the
 * same pipeline, so a slow review could land two comments on one PR and finish
 * by overwriting the status its own failure handler had just set. The signal
 * below is threaded all the way to every fetch, so a timed-out attempt stops.
 */
@Processor(REVIEW_QUEUE, REVIEW_WORKER_OPTIONS)
export class ReviewProcessor extends WorkerHost {
  private readonly logger = new Logger(ReviewProcessor.name);

  constructor(
    private readonly commitRunner: CommitReviewRunner,
    private readonly prRunner: PullRequestReviewRunner,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    // attemptsMade is 0 while the first attempt runs; attempts() was 1-based,
    // and the number ends up in logs, so keep the 1-based convention.
    const attempt = job.attemptsMade + 1;

    if (job.name === COMMIT_REVIEW_JOB) {
      await this.withDeadline(
        (signal) =>
          this.commitRunner.run(
            (job.data as CommitReviewJobData).commitReviewId,
            attempt,
            signal,
          ),
        job,
      );

      return;
    }

    if (job.name === PR_REVIEW_JOB) {
      await this.withDeadline(
        (signal) =>
          this.prRunner.run((job.data as PullRequestReviewJobData).pullRequestId, attempt, signal),
        job,
      );

      return;
    }

    throw new Error(`Unknown review job name: ${job.name}`);
  }

  /**
   * Port of failed(). BullMQ emits `failed` after every attempt, so the status
   * is only written once retries are exhausted — the original calls failed() once.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job | undefined, error: Error): Promise<void> {
    if (!job) {
      return;
    }

    const attempts = job.opts.attempts ?? REVIEW_JOB_ATTEMPTS;

    if (job.attemptsMade < attempts) {
      this.logger.warn(
        `Review job attempt ${job.attemptsMade} of ${attempts} failed, will retry: ${error.message}`,
      );

      return;
    }

    if (job.name === COMMIT_REVIEW_JOB) {
      const { commitReviewId } = job.data as CommitReviewJobData;

      this.logger.error(
        `Commit review job failed permanently ${JSON.stringify({
          review_id: commitReviewId,
          attempts: job.attemptsMade,
          error: error.message,
        })}`,
      );

      await this.commitRunner.markFailed(commitReviewId);

      return;
    }

    const { pullRequestId } = job.data as PullRequestReviewJobData;

    this.logger.error(
      `PR review job failed permanently ${JSON.stringify({
        pr_id: pullRequestId,
        attempts: job.attemptsMade,
        error: error.message,
      })}`,
    );

    await this.prRunner.markFailed(pullRequestId);
  }

  /**
   * Runs the pipeline under a cancellation signal and awaits it directly, so
   * the attempt is genuinely over when this returns. The runner surfaces the
   * abort by throwing, which fails the job and lets BullMQ retry.
   */
  private async withDeadline(
    work: (signal: AbortSignal) => Promise<void>,
    job: Job,
  ): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(
        new Error(`Review job ${job.name}#${job.id ?? '?'} exceeded ${REVIEW_JOB_TIMEOUT_MS}ms.`),
      );
    }, REVIEW_JOB_TIMEOUT_MS);

    try {
      await work(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }
}
