import { erasureMarkerKey } from '../account/erasure-marker';
import { ReviewRiskStore, SAVE_RISK_SCRIPT } from './review-risk.store';

const risk = { level: 'low', score: 0, stats: {}, signals: [], checklist: [] } as never;

/** Strings plus SAVE_RISK_SCRIPT's semantics, step for step. */
function fakeRedis() {
  const data = new Map<string, string>();

  return {
    data,
    set: jest.fn(async (k: string, v: string) => data.set(k, v)),
    get: jest.fn(async (k: string) => data.get(k) ?? null),
    del: jest.fn(async (...ks: string[]) => ks.forEach((k) => data.delete(k))),
    eval: jest.fn(async (script: string, _n: number, key: string, marker: string, json: string) => {
      if (script !== SAVE_RISK_SCRIPT) throw new Error('unexpected script');
      if (data.has(marker)) return 0;
      data.set(key, json);
      return 1;
    }),
  };
}

describe('ReviewRiskStore', () => {
  it('round-trips an assessment under the pull request id', async () => {
    const store = new ReviewRiskStore(fakeRedis() as never);

    await expect(store.save(7, 1, risk)).resolves.toBe(true);
    await expect(store.find(7)).resolves.toEqual(risk);
    await expect(store.find(8)).resolves.toBeNull();
  });

  it('refuses to save for an owner whose account is being erased', async () => {
    const redis = fakeRedis();
    const store = new ReviewRiskStore(redis as never);

    redis.data.set(erasureMarkerKey(1), '1');

    await expect(store.save(7, 1, risk)).resolves.toBe(false);
    await expect(store.find(7)).resolves.toBeNull();
    // Another owner is unaffected.
    await expect(store.save(9, 2, risk)).resolves.toBe(true);
  });

  it('never throws: a Redis failure costs the panel its saved risk, not the review', async () => {
    const down = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const store = new ReviewRiskStore({ set: down, get: down, del: down, eval: down } as never);

    await expect(store.save(7, 1, risk)).resolves.toBe(false);
    await expect(store.find(7)).resolves.toBeNull();
    await expect(store.forget(7)).resolves.toBeUndefined();
  });

  it('treats an unreadable entry as missing rather than serving garbage', async () => {
    const store = new ReviewRiskStore({ get: jest.fn().mockResolvedValue('{not json') } as never);

    await expect(store.find(7)).resolves.toBeNull();
  });
});
