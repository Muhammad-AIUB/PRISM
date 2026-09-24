import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * The general-purpose Redis client, on the same instance the original uses and
 * under the same REDIS_PREFIX.
 *
 * It does NOT read the original's cache entries. The original's cache key is
 * REDIS_PREFIX + CACHE_PREFIX + key — the second prefix defaults to
 * a slug of APP_NAME plus '-cache-' — and its values are PHP-serialised. Sharing
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

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * It used to log "closing" and not close anything. QUIT lets commands
   * already sent finish before the socket goes, so a deploy does not cut off
   * a write mid-flight; disconnect() is the fallback if Redis is unreachable.
   */
  async onApplicationShutdown(): Promise<void> {
    this.logger.log('Redis connection closing.');

    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}
