import { ServiceUnavailableException } from '@nestjs/common';
import type { Blueprint } from '../../design/blueprint';
import { DesignStore } from './design.store';

/** Just enough of ioredis for the store: strings, lists, and MULTI. */
function fakeRedis() {
  const strings = new Map<string, string>();
  const lists = new Map<string, string[]>();
  const sets = new Map<string, Set<string>>();
  const ops = {
    set: (k: string, v: string) => strings.set(k, v),
    lpush: (k: string, v: string) => lists.set(k, [v, ...(lists.get(k) ?? [])]),
    ltrim: (k: string, start: number, stop: number) =>
      lists.set(k, (lists.get(k) ?? []).slice(start, stop + 1)),
    expire: () => 1,
    del: (...ks: string[]) => ks.forEach((k) => (strings.delete(k), lists.delete(k), sets.delete(k))),
    sadd: (k: string, v: string) => sets.set(k, new Set([...(sets.get(k) ?? []), v])),
    srem: (k: string, v: string) => sets.get(k)?.delete(v),
    lrem: (k: string, _n: number, v: string) =>
      lists.set(k, (lists.get(k) ?? []).filter((x) => x !== v)),
    incr: () => 1,
  };

  return {
    strings,
    get: jest.fn(async (k: string) => strings.get(k) ?? null),
    lists,
    sets,
    lrange: jest.fn(async (k: string) => lists.get(k) ?? []),
    smembers: jest.fn(async (k: string) => [...(sets.get(k) ?? [])]),
    scard: jest.fn(async (k: string) => sets.get(k)?.size ?? 0),
    mget: jest.fn(async (...ks: string[]) => ks.map((k) => strings.get(k) ?? null)),
    multi() {
      const queued: (() => unknown)[] = [];
      const chain: Record<string, unknown> = {
        exec: async () => queued.map((op) => [null, op()]),
      };

      for (const [name, fn] of Object.entries(ops)) {
        chain[name] = (...args: unknown[]) => {
          queued.push(() => (fn as (...a: unknown[]) => unknown)(...args));

          return chain;
        };
      }

      return chain;
    },
  };
}

const design = (id: string, title = id) => ({ id, title, brief: { scale: 'startup' } }) as unknown as Blueprint;

describe('DesignStore', () => {
  it('returns a design only to its owner', async () => {
    const store = new DesignStore(fakeRedis() as never);

    await store.save(1, design('a'));

    await expect(store.find(1, 'a')).resolves.toMatchObject({ id: 'a' });
    await expect(store.find(2, 'a')).resolves.toBeNull();
    await expect(store.find(1, 'missing')).resolves.toBeNull();
  });

  it('lists newest first and skips entries that have expired', async () => {
    const redis = fakeRedis();
    const store = new DesignStore(redis as never);

    await store.save(1, design('a'));
    await store.save(1, design('b'));
    redis.strings.delete('design:a');

    await expect(store.list(1)).resolves.toEqual([design('b')]);
    await expect(store.list(2)).resolves.toEqual([]);
  });

  it('will not delete someone else\'s design', async () => {
    const store = new DesignStore(fakeRedis() as never);

    await store.save(1, design('a'));

    await expect(store.delete(2, 'a')).resolves.toBe(false);
    await expect(store.delete(1, 'a')).resolves.toBe(true);
    await expect(store.find(1, 'a')).resolves.toBeNull();
  });

  it('treats a command error inside MULTI as a failed save, not a successful one', async () => {
    const redis = fakeRedis();
    const multi = redis.multi.bind(redis);

    redis.multi = () => {
      const chain = multi() as Record<string, unknown>;

      chain.exec = async () => [[null, 'OK'], [new Error('WRONGTYPE'), null], [null, 1], [null, 1]];

      return chain;
    };

    await expect(new DesignStore(redis as never).save(1, design('a'))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('treats an aborted transaction (null) as a failure too', async () => {
    const redis = fakeRedis();
    const multi = redis.multi.bind(redis);

    redis.multi = () => {
      const chain = multi() as Record<string, unknown>;

      chain.exec = async () => null;

      return chain;
    };

    await expect(new DesignStore(redis as never).save(1, design('a'))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('counts attempts per user and window', async () => {
    const store = new DesignStore(fakeRedis() as never);

    await expect(store.hit(1, 3600)).resolves.toBe(1);
  });

  it('fails closed when the rate counter cannot be read, rather than allowing unlimited spend', async () => {
    const redis = fakeRedis();

    redis.multi = () => {
      throw new Error('ECONNREFUSED');
    };

    await expect(new DesignStore(redis as never).hit(1, 3600)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('turns a failed save into a 503 rather than handing out a link that will 404', async () => {
    const redis = fakeRedis();

    redis.multi = () => {
      throw new Error('ECONNREFUSED');
    };

    await expect(new DesignStore(redis as never).save(1, design('a'))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  describe('purgeOwner (account erasure)', () => {
    it('erases every design, including ones past the 20-item history cap', async () => {
      const redis = fakeRedis();
      const store = new DesignStore(redis as never);

      for (let i = 0; i < 25; i += 1) {
        await store.save(1, design(`d${i}`));
      }

      await store.save(2, design('bobs'));

      // The history only remembers 20; the oldest five exist only in the index.
      expect(redis.lists.get('design:user:1')).toHaveLength(20);
      await expect(store.count(1)).resolves.toBe(25);

      await store.purgeOwner(1);

      expect([...redis.strings.keys()].filter((k) => k.startsWith('design:d'))).toEqual([]);
      expect(redis.lists.has('design:user:1')).toBe(false);
      expect(redis.sets.has('design:owned:1')).toBe(false);
      // Nobody else's data is touched.
      await expect(store.find(2, 'bobs')).resolves.toMatchObject({ id: 'bobs' });
    });

    it('drops a deleted design from the index too', async () => {
      const store = new DesignStore(fakeRedis() as never);

      await store.save(1, design('a'));
      await store.delete(1, 'a');

      await expect(store.count(1)).resolves.toBe(0);
    });

    it('throws when Redis fails, so the caller cannot report a deletion that did not happen', async () => {
      const redis = fakeRedis();

      redis.smembers = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(new DesignStore(redis as never).purgeOwner(1)).rejects.toThrow('ECONNREFUSED');
    });
  });
});
