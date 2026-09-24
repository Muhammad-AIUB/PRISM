import { Module } from '@nestjs/common';
import { DiffCacheModule } from '../../cache/diff-cache.module';
import { GithubModule } from '../../github/github.module';
import { ChangeRiskService } from './change-risk.service';

@Module({
  imports: [DiffCacheModule, GithubModule],
  providers: [ChangeRiskService],
  exports: [ChangeRiskService],
})
export class RiskModule {}
