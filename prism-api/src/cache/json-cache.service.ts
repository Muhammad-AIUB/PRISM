import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';

/**
 * The general-purpose read-through cache the web controllers lean on —
 * GitHub repository lists, connected-repo ids, branch lists.
 *
 * Like DiffCacheService this keeps its own key namespace and stores plain JSON.
 * Older entries written by the previous runtime are double-prefixed and
 * PHP-serialised, and are deliberately not read: decoding them would mean
 * carrying a second serialisation format for values that cost one API call to
 * refetch.
 *
 * A Redis failure falls through to the loader. A cache that is down must slow
 * the page, not break it.
 */
const NAMESPACE = 'nest-cache-';

@Injectable()
export class JsonCacheService {
  private readonly logger = new Logger(JsonCacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  key(name: string): string {
    return `${NAMESPACE}${name}`;
  }

  async remember<T>(name: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const key = this.key(name);

    try {
      const hit = await this.redis.get(key);

      if (hit !== null) {
        return JSON.parse(hit) as T;
      }
    } catch (error) {
      this.logger.warn(`Cache read failed for ${key}: ${this.messageOf(error)}`);
    }

    const value = await loader();

    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(`Cache write failed for ${key}: ${this.messageOf(error)}`);
    }

    return value;
  }

  async forget(...names: string[]): Promise<void> {
    try {
      await this.redis.del(...names.map((name) => this.key(name)));
    } catch (error) {
      this.logger.warn(`Cache delete failed: ${this.messageOf(error)}`);
    }
  }

  private messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
