import { ReviewRiskStore } from './review-risk.store';

const risk = { level: 'low', score: 0, stats: {}, signals: [], checklist: [] } as never;

describe('ReviewRiskStore', () => {
  it('round-trips an assessment under the pull request id', async () => {
    const data = new Map<string, string>();
    const store = new ReviewRiskStore({
      set: jest.fn(async (k: string, v: string) => data.set(k, v)),
      get: jest.fn(async (k: string) => data.get(k) ?? null),
    } as never);

    await store.save(7, risk);

    await expect(store.find(7)).resolves.toEqual(risk);
    await expect(store.find(8)).resolves.toBeNull();
  });

  it('never throws: a Redis failure costs the panel its saved risk, not the review', async () => {
    const down = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const store = new ReviewRiskStore({ set: down, get: down, del: down } as never);

    await expect(store.save(7, risk)).resolves.toBeUndefined();
    await expect(store.find(7)).resolves.toBeNull();
    await expect(store.forget(7)).resolves.toBeUndefined();
  });

  it('treats an unreadable entry as missing rather than serving garbage', async () => {
    const store = new ReviewRiskStore({ get: jest.fn().mockResolvedValue('{not json') } as never);

    await expect(store.find(7)).resolves.toBeNull();
  });
});
