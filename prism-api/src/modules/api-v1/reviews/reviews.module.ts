import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../../audit/audit.module';
import { DiffCacheModule } from '../../../cache/diff-cache.module';
import { AuthModule } from '../../../auth/auth.module';
import { CommitReview, PullRequest, Repository, Review } from '../../../database/entities';
import { ReviewModule } from '../../review/review.module';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([Repository, CommitReview, PullRequest, Review]),
    // ReviewModule supplies ReviewQueueService for the two re-analyze routes.
    ReviewModule,
    DiffCacheModule,
    AuditModule,
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
