import { ServiceUnavailableException } from '@nestjs/common';
import type { Blueprint } from '../../design/blueprint';
import { DesignStore } from './design.store';

/** Just enough of ioredis for the store: strings, lists, and MULTI. */
function fakeRedis() {
  const strings = new Map<string, string>();
  const lists = new Map<string, string[]>();
  const ops = {
    set: (k: string, v: string) => strings.set(k, v),
    lpush: (k: string, v: string) => lists.set(k, [v, ...(lists.get(k) ?? [])]),
    ltrim: (k: string, start: number, stop: number) =>
      lists.set(k, (lists.get(k) ?? []).slice(start, stop + 1)),
    expire: () => 1,
    del: (k: string) => strings.delete(k),
    lrem: (k: string, _n: number, v: string) =>
      lists.set(k, (lists.get(k) ?? []).filter((x) => x !== v)),
    incr: () => 1,
  };

  return {
    strings,
    get: jest.fn(async (k: string) => strings.get(k) ?? null),
    lrange: jest.fn(async (k: string) => lists.get(k) ?? []),
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

  it('turns a failed save into a 503 rather than handing out a link that will 404', async () => {
    const redis = fakeRedis();

    redis.multi = () => {
      throw new Error('ECONNREFUSED');
    };

    await expect(new DesignStore(redis as never).save(1, design('a'))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
