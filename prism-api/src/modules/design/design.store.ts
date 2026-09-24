import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import type { Blueprint } from '../../design/blueprint';
import { REDIS_CLIENT } from '../../redis/redis.constants';

/**
 * Where blueprints live: Redis, for thirty days.
 *
 * Not Postgres, and that is a decision rather than a shortcut. A new table is
 * hand-applied DDL against a production schema this codebase does not own the
 * history of (see TODOS.md item 1 for the same question, still open). A
 * blueprint is a working document that gets exported to the repository it
 * describes; the page says it is kept for thirty days, and the Markdown
 * export is the durable copy. If blueprints ever need to outlive that, the
 * shape here is already the row.
 *
 * The owner is stored beside the blueprint rather than in it, so the payload
 * served to clients never carries a user id.
 */
export const DESIGN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const DESIGN_HISTORY = 20;

/**
 * MULTI/EXEC resolves even when a command inside it failed: each failure comes
 * back as the error half of its [error, result] pair, and an aborted
 * transaction resolves to null. Treating "resolved" as "succeeded" would hand
 * the caller a design id whose SET never happened.
 */
type ExecResult = [Error | null, unknown][] | null;

function assertExec(result: ExecResult): [Error | null, unknown][] {
  if (result === null) {
    throw new Error('Redis transaction was aborted');
  }

  const failed = result.find(([error]) => error !== null);

  if (failed) {
    throw failed[0] as Error;
  }

  return result;
}

interface StoredDesign {
  owner_id: number;
  blueprint: Blueprint;
}

@Injectable()
export class DesignStore {
  private readonly logger = new Logger(DesignStore.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async save(ownerId: number, blueprint: Blueprint): Promise<void> {
    const record: StoredDesign = { owner_id: ownerId, blueprint };

    try {
      assertExec(
        await this.redis
          .multi()
          .set(this.designKey(blueprint.id), JSON.stringify(record), 'EX', DESIGN_TTL_SECONDS)
          .lpush(this.historyKey(ownerId), blueprint.id)
          .ltrim(this.historyKey(ownerId), 0, DESIGN_HISTORY - 1)
          .expire(this.historyKey(ownerId), DESIGN_TTL_SECONDS)
          // Every id the owner has, untrimmed. The history list above is
          // capped for display, so it cannot be what erasure relies on.
          .sadd(this.ownedKey(ownerId), blueprint.id)
          .expire(this.ownedKey(ownerId), DESIGN_TTL_SECONDS)
          .exec(),
      );
    } catch (error) {
      this.logger.error(`Design save failed: ${this.messageOf(error)}`);

      // Unlike the read-through caches, there is no loader to fall back to:
      // an unsaved design is a link that 404s. Say so.
      throw new ServiceUnavailableException('Could not save the design. Please try again.');
    }
  }

  /** Null for a missing, expired or foreign design — callers must not tell those apart. */
  async find(ownerId: number, id: string): Promise<Blueprint | null> {
    const raw = await this.redis.get(this.designKey(id));

    if (raw === null) {
      return null;
    }

    const record = JSON.parse(raw) as StoredDesign;

    return record.owner_id === ownerId ? record.blueprint : null;
  }

  async list(ownerId: number): Promise<Blueprint[]> {
    const ids = await this.redis.lrange(this.historyKey(ownerId), 0, DESIGN_HISTORY - 1);

    if (ids.length === 0) {
      return [];
    }

    const raws = await this.redis.mget(...ids.map((id) => this.designKey(id)));

    return raws
      .filter((raw): raw is string => raw !== null)
      .map((raw) => JSON.parse(raw) as StoredDesign)
      .filter((record) => record.owner_id === ownerId)
      .map((record) => record.blueprint);
  }

  async delete(ownerId: number, id: string): Promise<boolean> {
    if ((await this.find(ownerId, id)) === null) {
      return false;
    }

    assertExec(
      await this.redis
        .multi()
        .del(this.designKey(id))
        .lrem(this.historyKey(ownerId), 0, id)
        .srem(this.ownedKey(ownerId), id)
        .exec(),
    );

    return true;
  }

  /** How many designs the owner has stored, including ones past the history cap. */
  async count(ownerId: number): Promise<number> {
    return this.redis.scard(this.ownedKey(ownerId));
  }

  /**
   * Erases everything this store holds for an owner: every design (not only
   * the 20 the history shows), the history, the index, and the current rate
   * counter. Throws on any failure, because the caller is about to tell a
   * person their data is gone and must not do so if it is not.
   */
  async purgeOwner(ownerId: number): Promise<void> {
    const [owned, listed] = await Promise.all([
      this.redis.smembers(this.ownedKey(ownerId)),
      this.redis.lrange(this.historyKey(ownerId), 0, -1),
    ]);
    const ids = [...new Set([...owned, ...listed])];
    const bucket = Math.floor(Date.now() / 1000 / 3600);

    assertExec(
      await this.redis
        .multi()
        .del(
          ...ids.map((id) => this.designKey(id)),
          this.historyKey(ownerId),
          this.ownedKey(ownerId),
          `design:rate:${ownerId}:${bucket}`,
        )
        .exec(),
    );
  }

  /**
   * INCR-and-expire counter for the per-user generation limit. Returns the
   * count including this attempt.
   *
   * Fails closed. This limit is the only thing bounding Groq spend on this
   * route, so an unreadable counter must not mean "unlimited". Failing open
   * never bought availability anyway: with Redis down, save() fails too, so
   * letting the request through only spent two model calls on a design that
   * could not be stored.
   */
  async hit(ownerId: number, windowSeconds: number): Promise<number> {
    const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
    const key = `design:rate:${ownerId}:${bucket}`;

    try {
      const [incr] = assertExec(
        await this.redis.multi().incr(key).expire(key, windowSeconds).exec(),
      );

      return Number(incr?.[1]);
    } catch (error) {
      this.logger.error(`Design rate counter failed, refusing: ${this.messageOf(error)}`);

      throw new ServiceUnavailableException(
        'Design Studio is temporarily unavailable. Please try again shortly.',
      );
    }
  }

  private designKey(id: string): string {
    return `design:${id}`;
  }

  private historyKey(ownerId: number): string {
    return `design:user:${ownerId}`;
  }

  private ownedKey(ownerId: number): string {
    return `design:owned:${ownerId}`;
  }

  private messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
