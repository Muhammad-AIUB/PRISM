import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PullRequest } from '../../database/entities';
import { DesignModule } from '../design/design.module';
import { RiskModule } from '../risk/risk.module';
import { AccountDataService } from './account-data.service';

@Module({
  imports: [TypeOrmModule.forFeature([PullRequest]), DesignModule, RiskModule],
  providers: [AccountDataService],
  exports: [AccountDataService],
})
export class AccountDataModule {}
