import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import type { BatchResult } from '../../ai/batch-merge';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { erasureMarkerKey } from '../account/erasure-marker';
import { CHECKPOINT_TTL_SECONDS } from './batching.config';

/**
 * The finished batches of a review in progress, so a BullMQ retry resumes
 * instead of paying for them again.
 *
 * A review of several batches can fail after most of its paid, rate-limited
 * calls have succeeded (the next call times out, the process restarts, the
 * deadline fires). The retry would otherwise start at batch one. Each validated
 * batch is saved here the moment it completes; a retry loads them and runs only
 * what is missing.
 *
 * Redis rather than a table: a new table is hand-applied DDL, and this data is
 * worth keeping for hours, not for good. The same reason Design Studio and the
 * saved risk assessment live in Redis.
 *
 * One hash per review, `fp` plus `b0`, `b1`... The fingerprint covers the diff
 * and the batching settings, so a new push (a different diff) or a retuned
 * batch size never resumes from batches cut differently: `load` ignores a hash
 * with another fingerprint and the next `save` replaces it.
 *
 * It holds findings about a user's code, so it is erasable (CLAUDE.md): keys
 * start with the owner's id so `purgeOwner` finds them, and writes go through
 * the erasure-marker script (account/erasure-marker.ts) so a review running
 * during account deletion cannot re-create what was just purged.
 */
export type CheckpointKind = 'pr' | 'commit';

export interface CheckpointRef {
  kind: CheckpointKind;
  /** pull_requests.id or commit_reviews.id. */
  id: number;
  /** The repository owner's user id; what erasure is keyed on. */
  ownerId: number;
}

/**
 * Check-and-write in one atomic step: refuse while the owner's account is
 * being erased; replace a hash left by a different fingerprint.
 *
 * KEYS: review hash, erasure marker    ARGV: fingerprint, field, batch JSON, ttl seconds
 * Returns 1 when saved, 0 when refused.
 */
export const SAVE_BATCH_SCRIPT = `
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
local fp = redis.call('HGET', KEYS[1], 'fp')
if fp and fp ~= ARGV[1] then redis.call('DEL', KEYS[1]) end
redis.call('HSET', KEYS[1], 'fp', ARGV[1], ARGV[2], ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
return 1
`;

const FIELD = /^b(\d+)$/;

const isBatchResult = (value: unknown): value is BatchResult => {
  const v = value as Partial<BatchResult> | null;

  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.index === 'number' &&
    typeof v.model === 'string' &&
    Array.isArray(v.security) &&
    Array.isArray(v.performance) &&
    Array.isArray(v.code_quality)
  );
};

@Injectable()
export class ReviewCheckpointStore {
  private readonly logger = new Logger(ReviewCheckpointStore.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Never throws: a lost checkpoint costs calls on a retry, not the review. Empty when absent, stale or unreadable. */
  async load(ref: CheckpointRef, fingerprint: string): Promise<Map<number, BatchResult>> {
    const found = new Map<number, BatchResult>();

    try {
      const hash = await this.redis.hgetall(this.key(ref));

      if (hash['fp'] !== fingerprint) {
        return found;
      }

      for (const [field, value] of Object.entries(hash)) {
        const match = FIELD.exec(field);

        if (!match) {
          continue;
        }

        // One corrupt entry costs that batch's call on a retry, not its siblings.
        try {
          const parsed: unknown = JSON.parse(value);

          if (isBatchResult(parsed)) {
            found.set(Number(match[1]), parsed);
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      this.logger.warn(`Review checkpoint read failed (${this.describe(ref)}): ${this.messageOf(error)}`);

      return new Map();
    }

    return found;
  }

  /** Never throws. Returns whether it was written; false while the owner's account is being erased, or on a Redis failure. */
  async save(ref: CheckpointRef, fingerprint: string, result: BatchResult): Promise<boolean> {
    try {
      const saved = await this.redis.eval(
        SAVE_BATCH_SCRIPT,
        2,
        this.key(ref),
        erasureMarkerKey(ref.ownerId),
        fingerprint,
        `b${result.index}`,
        JSON.stringify(result),
        CHECKPOINT_TTL_SECONDS,
      );

      return Number(saved) === 1;
    } catch (error) {
      this.logger.warn(`Review checkpoint save failed (${this.describe(ref)}): ${this.messageOf(error)}`);

      return false;
    }
  }

  /** Called when a review has finished, so a later re-analyze of the same diff starts fresh. Never throws. */
  async clear(ref: CheckpointRef): Promise<void> {
    try {
      await this.redis.del(this.key(ref));
    } catch (error) {
      this.logger.warn(`Review checkpoint delete failed (${this.describe(ref)}): ${this.messageOf(error)}`);
    }
  }

  /**
   * For account erasure. Unlike `clear`, this throws: the caller is about to
   * tell someone their data is gone and must not if it is not.
   */
  async purgeOwner(ownerId: number): Promise<void> {
    let cursor = '0';

    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', `review-batches:${ownerId}:*`, 'COUNT', 100);

      if (keys.length > 0) {
        await this.redis.del(...keys);
      }

      cursor = next;
    } while (cursor !== '0');
  }

  private key(ref: CheckpointRef): string {
    return `review-batches:${ref.ownerId}:${ref.kind}:${ref.id}`;
  }

  private describe(ref: CheckpointRef): string {
    return `${ref.kind}_id=${ref.id}`;
  }

  private messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
