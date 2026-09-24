import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { AuditLog, Repository, Review, User } from '../../database/entities';
import { GithubModule } from '../../github/github.module';
import { AccountDataModule } from '../account/account-data.module';
import { AuthWebModule } from '../auth/auth-web.module';
import { OptionalWebAuthGuard } from '../auth/optional-web-auth.guard';
import { SecurityController } from './security.controller';
import { SecurityService } from './security.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Repository, Review, AuditLog]),
    AuthWebModule,
    GithubModule,
    AuditModule,
    AccountDataModule,
  ],
  controllers: [SecurityController],
  providers: [SecurityService, OptionalWebAuthGuard],
})
export class SecurityModule {}
