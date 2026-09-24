import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { DiffCacheModule } from '../../cache/diff-cache.module';
import { CommitReview, PullRequest, Review, ReviewComment } from '../../database/entities';
import { GithubModule } from '../../github/github.module';
import { AuthWebModule } from '../auth/auth-web.module';
import { ReviewModule } from '../review/review.module';
import { RiskModule } from '../risk/risk.module';
import { CommitReviewsController } from './commit-reviews.controller';
import { PdfReportService } from './pdf-report.service';
import { ReviewsWebController } from './reviews-web.controller';
import { ReviewsWebService } from './reviews-web.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PullRequest, Review, ReviewComment, CommitReview]),
    AuthWebModule,
    // ReviewModule supplies ReviewQueueService — these two routes are the last
    // AI dispatch paths that still lived on the original's queue.
    ReviewModule,
    GithubModule,
    DiffCacheModule,
    AuditModule,
    RiskModule,
  ],
  controllers: [ReviewsWebController, CommitReviewsController],
  providers: [ReviewsWebService, PdfReportService],
})
export class ReviewsWebModule {}
