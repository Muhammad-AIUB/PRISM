import { Module } from '@nestjs/common';
import { DiffCacheModule } from '../../cache/diff-cache.module';
import { GithubModule } from '../../github/github.module';
import { ChangeRiskService } from './change-risk.service';
import { ReviewRiskStore } from './review-risk.store';

@Module({
  imports: [DiffCacheModule, GithubModule],
  providers: [ChangeRiskService, ReviewRiskStore],
  exports: [ChangeRiskService, ReviewRiskStore],
})
export class RiskModule {}
