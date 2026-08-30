import { Module } from '@nestjs/common';
import { DiffCacheService } from './diff-cache.service';

/** RedisModule is @Global, so REDIS_CLIENT resolves without importing it. */
@Module({
  providers: [DiffCacheService],
  exports: [DiffCacheService],
})
export class DiffCacheModule {}
