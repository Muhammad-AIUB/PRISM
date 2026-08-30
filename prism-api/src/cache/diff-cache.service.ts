import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';

/**
 * Laravel's `Cache::remember($key, 3600, …)` around the GitHub diff fetch.
 *
 * This does NOT share entries with Laravel's cache, and that is deliberate.
 * Laravel's Redis cache key is REDIS_PREFIX + CACHE_PREFIX + key — the second
 * prefix defaults to Str::slug(APP_NAME).'-cache-' — and its values are
 * PHP-serialised (`s:<bytes>:"…";`). Reproducing both just to share a
 * one-hour diff cache would couple this service to PHP's serialisation format
 * for no real gain. The cost of not sharing is one extra GitHub call per
 * repository at cutover.
 */
const TTL_SECONDS = 3600;
const NAMESPACE = 'nest-cache-';

@Injectable()
export class DiffCacheService {
  private readonly logger = new Logger(DiffCacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Immutable per commit, so the SHA alone is a safe key. */
  commitKey(repositoryId: number, sha: string): string {
    return `${NAMESPACE}commit_diff_${repositoryId}_${sha}`;
  }

  /**
   * Keyed on head branch + updated_at so a new push invalidates it, matching
   * Laravel's sha1($pr->head_branch.'|'.$pr->updated_at).
   */
  pullRequestKey(pullRequestId: number, headBranch: string, updatedAt: Date | null): string {
    const stamp = updatedAt ? updatedAt.toISOString().slice(0, 19).replace('T', ' ') : '';
    const digest = createHash('sha1').update(`${headBranch}|${stamp}`).digest('hex');

    return `${NAMESPACE}pr_diff_${pullRequestId}_${digest}`;
  }

  /**
   * A Redis failure must not fail the review — fall through to the loader and
   * let the job proceed uncached, which is what Laravel's cache does when the
   * store is unreachable.
   */
  async remember(key: string, loader: () => Promise<string>): Promise<string> {
    try {
      const hit = await this.redis.get(key);

      if (hit !== null) {
        return hit;
      }
    } catch (error) {
      this.logger.warn(`Diff cache read failed for ${key}: ${this.messageOf(error)}`);
    }

    const value = await loader();

    try {
      await this.redis.set(key, value, 'EX', TTL_SECONDS);
    } catch (error) {
      this.logger.warn(`Diff cache write failed for ${key}: ${this.messageOf(error)}`);
    }

    return value;
  }

  async forget(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.warn(`Diff cache delete failed for ${key}: ${this.messageOf(error)}`);
    }
  }

  private messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
