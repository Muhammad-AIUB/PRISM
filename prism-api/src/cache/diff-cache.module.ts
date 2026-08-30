import { Module } from '@nestjs/common';
import { DiffCacheService } from './diff-cache.service';
import { JsonCacheService } from './json-cache.service';

/** RedisModule is @Global, so REDIS_CLIENT resolves without importing it. */
@Module({
  providers: [DiffCacheService, JsonCacheService],
  exports: [DiffCacheService, JsonCacheService],
})
export class DiffCacheModule {}
