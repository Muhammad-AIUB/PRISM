import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommitReview, PullRequest, Repository, Review } from '../../database/entities';
import { AuthWebModule } from '../auth/auth-web.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Repository, PullRequest, CommitReview, Review]),
    AuthWebModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
