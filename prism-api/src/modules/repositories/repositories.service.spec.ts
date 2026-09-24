import { RepositoriesService } from './repositories.service';

/**
 * A GitHub failure must reach the page as a failure, and must not be cached:
 * caching it kept the list empty for five minutes after the cause was fixed.
 */
describe('RepositoriesService.index', () => {
  const user = { id: 7, githubToken: 'cipher' } as never;

  const build = (listUserRepos: jest.Mock) => {
    const store = new Map<string, unknown>();
    const cache = {
      remember: jest.fn(async (key: string, _ttl: number, loader: () => Promise<unknown>) => {
        if (store.has(key)) {
          return store.get(key);
        }
        const value = await loader();
        store.set(key, value);
        return value;
      }),
      forget: jest.fn(),
    };
    const service = new RepositoriesService(
      { find: jest.fn().mockResolvedValue([]) } as never,
      { listUserRepos } as never,
      cache as never,
      { decrypt: () => 'token' } as never,
      {} as never,
      {} as never,
    );

    return { service, store };
  };

  it('returns GitHub\'s status instead of an empty list, and caches nothing', async () => {
    const listUserRepos = jest.fn().mockResolvedValue({ ok: false, status: 401 });
    const { service, store } = build(listUserRepos);

    const result = await service.index(user);

    expect(result.repos).toEqual([]);
    expect(result.githubError).toEqual({ status: 401 });
    expect(store.has('user_repos_7')).toBe(false);
  });

  it('caches and returns the repositories on success', async () => {
    const listUserRepos = jest.fn().mockResolvedValue({ ok: true, repos: [{ id: 1 }] });
    const { service, store } = build(listUserRepos);

    const result = await service.index(user);

    expect(result.repos).toEqual([{ id: 1 }]);
    expect(result.githubError).toBeNull();
    expect(store.get('user_repos_7')).toEqual([{ id: 1 }]);
  });
});
