import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../../audit/audit.module';
import { DiffCacheModule } from '../../cache/diff-cache.module';
import { Repository } from '../../database/entities';
import { GithubModule } from '../../github/github.module';
import { AuthWebModule } from '../auth/auth-web.module';
import { RepositoriesController } from './repositories.controller';
import { RepositoriesService } from './repositories.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Repository]),
    // AuthWebModule supplies WebAuthGuard, its JwtModule and the User repository.
    AuthWebModule,
    GithubModule,
    DiffCacheModule,
    AuditModule,
  ],
  controllers: [RepositoriesController],
  providers: [RepositoriesService],
  exports: [RepositoriesService],
})
export class RepositoriesModule {}
