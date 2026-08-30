import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../../ai/ai.module';
import { AuditModule } from '../../audit/audit.module';
import { DiffCacheModule } from '../../cache/diff-cache.module';
import { CommitReview, PullRequest, Review, ReviewComment } from '../../database/entities';
import { GithubModule } from '../../github/github.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { CommitReviewRunner } from './commit-review.runner';
import { PullRequestReviewRunner } from './pr-review.runner';
import { ReviewProcessor } from './review.processor';
import { ReviewQueueService } from './review-queue.service';
import { REVIEW_JOB_OPTIONS, REVIEW_QUEUE } from './review.queue';
import { SummaryCommentBuilder } from './summary-comment.builder';

/**
 * Queue + worker live in the same Nest process. Render's free tier has no
 * background-worker service type, so this mirrors what the Laravel container
 * already does with supervisord: one box, HTTP and worker side by side.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CommitReview, PullRequest, Review, ReviewComment]),
    BullModule.registerQueue({ name: REVIEW_QUEUE, defaultJobOptions: REVIEW_JOB_OPTIONS }),
    AiModule,
    GithubModule,
    NotificationsModule,
    DiffCacheModule,
    AuditModule,
  ],
  providers: [
    ReviewProcessor,
    CommitReviewRunner,
    PullRequestReviewRunner,
    SummaryCommentBuilder,
    ReviewQueueService,
  ],
  exports: [ReviewQueueService, TypeOrmModule],
})
export class ReviewModule {}
