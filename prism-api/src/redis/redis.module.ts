import { Global, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * The general-purpose Redis client, on the same instance Laravel uses and
 * under the same REDIS_PREFIX.
 *
 * It does NOT read Laravel's cache entries. Laravel's cache key is
 * REDIS_PREFIX + CACHE_PREFIX + key — the second prefix defaults to
 * Str::slug(APP_NAME).'-cache-' — and its values are PHP-serialised. Sharing
 * the instance is not the same as sharing entries; see DiffCacheService.
 *
 * BullMQ does not use this client: workers need maxRetriesPerRequest null and
 * BullMQ manages its own key namespace. See BullModule in app.module.ts.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Redis => {
        const url = configService.get<string>('redis.url') ?? '';
        const keyPrefix = configService.get<string>('redis.prefix') ?? 'prism:';

        return new Redis(url, {
          keyPrefix,
          maxRetriesPerRequest: 2,
          lazyConnect: false,
        });
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisModule.name);

  async onApplicationShutdown(): Promise<void> {
    this.logger.log('Redis connection closing.');
  }
}
