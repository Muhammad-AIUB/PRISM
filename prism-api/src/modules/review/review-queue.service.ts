import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  COMMIT_REVIEW_JOB,
  PR_REVIEW_JOB,
  REVIEW_JOB_OPTIONS,
  REVIEW_QUEUE,
  type CommitReviewJobData,
  type PullRequestReviewJobData,
} from './review.queue';

/**
 * The Node-side equivalent of ProcessCommitReview::dispatch(). Used by webhook
 * ingestion and by the two /api/v1 re-analyze endpoints.
 *
 * These jobs land in Redis, not the `jobs` table, so Laravel's worker will
 * never see them and the two workers cannot contend.
 */
@Injectable()
export class ReviewQueueService {
  constructor(@InjectQueue(REVIEW_QUEUE) private readonly queue: Queue) {}

  async enqueueCommitReview(commitReviewId: number): Promise<void> {
    const data: CommitReviewJobData = { commitReviewId };

    await this.queue.add(COMMIT_REVIEW_JOB, data, REVIEW_JOB_OPTIONS);
  }

  async enqueuePullRequestReview(pullRequestId: number): Promise<void> {
    const data: PullRequestReviewJobData = { pullRequestId };

    await this.queue.add(PR_REVIEW_JOB, data, REVIEW_JOB_OPTIONS);
  }
}
