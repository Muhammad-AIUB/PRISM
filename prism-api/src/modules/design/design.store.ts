import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import type { Blueprint } from '../../design/blueprint';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { ERASURE_MARKER_TTL_SECONDS, erasureMarkerKey } from '../account/erasure-marker';

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
 * The save, as one atomic script, so it can check the erasure marker and
 * write in a single step. A MULTI cannot read before it writes, and WATCH is
 * per connection, which this shared client cannot offer.
 *
 * KEYS: design, history, owned index, erasure marker
 * ARGV: record JSON, design id, ttl seconds, history cap
 * Returns 1 when saved, 0 when the owner's account is being erased
 * (see account/erasure-marker.ts).
 */
export const SAVE_SCRIPT = `
if redis.call('EXISTS', KEYS[4]) == 1 then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
redis.call('LPUSH', KEYS[2], ARGV[2])
redis.call('LTRIM', KEYS[2], 0, tonumber(ARGV[4]) - 1)
redis.call('EXPIRE', KEYS[2], ARGV[3])
redis.call('SADD', KEYS[3], ARGV[2])
redis.call('EXPIRE', KEYS[3], ARGV[3])
return 1
`;

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

  /**
   * Returns false, having written nothing, when the owner's account is being
   * erased. A generation can take most of a minute, and one that finishes
   * after "delete my data" must not quietly leave the brief behind.
   *
   * The owned index is every id the owner has, untrimmed: the history list is
   * capped for display, so it cannot be what erasure relies on.
   */
  async save(ownerId: number, blueprint: Blueprint): Promise<boolean> {
    const record: StoredDesign = { owner_id: ownerId, blueprint };

    try {
      const saved = await this.redis.eval(
        SAVE_SCRIPT,
        4,
        this.designKey(blueprint.id),
        this.historyKey(ownerId),
        this.ownedKey(ownerId),
        this.erasedKey(ownerId),
        JSON.stringify(record),
        blueprint.id,
        DESIGN_TTL_SECONDS,
        DESIGN_HISTORY,
      );

      return Number(saved) === 1;
    } catch (error) {
      this.logger.error(`Design save failed: ${this.messageOf(error)}`);

      // Unlike the read-through caches, there is no loader to fall back to:
      // an unsaved design is a link that 404s. Say so.
      throw new ServiceUnavailableException('Could not save the design. Please try again.');
    }
  }

  /** Null for a missing, expired, corrupt or foreign design — callers must not tell those apart. */
  async find(ownerId: number, id: string): Promise<Blueprint | null> {
    const record = this.parse(await this.redis.get(this.designKey(id)));

    return record?.owner_id === ownerId ? record.blueprint : null;
  }

  async list(ownerId: number): Promise<Blueprint[]> {
    const ids = await this.redis.lrange(this.historyKey(ownerId), 0, DESIGN_HISTORY - 1);

    if (ids.length === 0) {
      return [];
    }

    const raws = await this.redis.mget(...ids.map((id) => this.designKey(id)));

    // One unreadable entry costs that entry, not the whole list.
    return raws
      .map((raw) => this.parse(raw))
      .filter((record): record is StoredDesign => record?.owner_id === ownerId)
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

  /**
   * True while the owner's account is being deleted. Checked before the model
   * is called, so a request that can only be refused at save time does not
   * spend two Groq calls first. The save script still makes the final call.
   */
  async isBeingErased(ownerId: number): Promise<boolean> {
    return (await this.redis.exists(this.erasedKey(ownerId))) === 1;
  }

  /**
   * How many designs the owner has stored, including ones past the history
   * cap. Designs expire one by one while the index's own expiry is refreshed
   * on every save, so the index collects ids of designs that no longer exist.
   * Only live ones are counted, and the dead ones are pruned on the way.
   */
  async count(ownerId: number): Promise<number> {
    const ids = await this.redis.smembers(this.ownedKey(ownerId));

    if (ids.length === 0) {
      return 0;
    }

    const exists = assertExec(
      await ids.reduce((multi, id) => multi.exists(this.designKey(id)), this.redis.multi()).exec(),
    );
    const stale = ids.filter((_, index) => Number(exists[index]?.[1]) === 0);

    if (stale.length > 0) {
      await this.redis.srem(this.ownedKey(ownerId), ...stale);
    }

    return ids.length - stale.length;
  }

  /**
   * Erases everything this store holds for an owner: every design (not only
   * the 20 the history shows), the history, the index, and the current rate
   * counter. Throws on any failure, because the caller is about to tell a
   * person their data is gone and must not do so if it is not.
   */
  async purgeOwner(ownerId: number): Promise<void> {
    // The marker goes first. From here on SAVE_SCRIPT refuses this owner, so a
    // generation that finishes mid-erasure is either already in the index read
    // below, or never written at all. There is no gap between the two.
    await this.redis.set(this.erasedKey(ownerId), '1', 'EX', ERASURE_MARKER_TTL_SECONDS);

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

  private erasedKey(ownerId: number): string {
    return erasureMarkerKey(ownerId);
  }

  private parse(raw: string | null): StoredDesign | null {
    if (raw === null) {
      return null;
    }

    try {
      return JSON.parse(raw) as StoredDesign;
    } catch {
      this.logger.warn('Skipping an unreadable stored design');

      return null;
    }
  }

  private messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
