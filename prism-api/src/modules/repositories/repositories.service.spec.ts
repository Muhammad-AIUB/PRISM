import { ForbiddenException, NotFoundException } from '@nestjs/common';
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

/**
 * The dashboard shows the last ten reviews across every repository. This is
 * the whole list for one, so it has to stay inside that repository and inside
 * its owner's account.
 */
describe('RepositoriesService.reviews', () => {
  const user = { id: 7 } as never;
  const owned = {
    id: 3,
    userId: 7,
    name: 'BSLCTR',
    fullName: 'Muhammad-AIUB/BSLCTR',
    reviewMode: 'both',
  };

  const build = (options: { repository?: unknown; prs?: number; commits?: number } = {}) => {
    const repositories = {
      findOne: jest.fn().mockResolvedValue('repository' in options ? options.repository : owned),
    };
    const pullRequests = {
      count: jest.fn().mockResolvedValue(options.prs ?? 0),
      find: jest.fn().mockResolvedValue([]),
    };
    const commitReviews = {
      count: jest.fn().mockResolvedValue(options.commits ?? 0),
      find: jest.fn().mockResolvedValue([]),
    };
    const service = new RepositoriesService(
      repositories as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      pullRequests as never,
      commitReviews as never,
    );

    return { service, pullRequests, commitReviews };
  };

  it('refuses a repository that belongs to someone else', async () => {
    const { service, pullRequests } = build({ repository: { ...owned, userId: 99 } });

    await expect(service.reviews(user, 3, {})).rejects.toBeInstanceOf(ForbiddenException);
    expect(pullRequests.find).not.toHaveBeenCalled();
  });

  it('answers 404 for a repository that does not exist', async () => {
    const { service } = build({ repository: null });

    await expect(service.reviews(user, 3, {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists only this repository, newest first, 25 to a page', async () => {
    const { service, pullRequests } = build({ prs: 60 });

    const result = await service.reviews(user, 3, { kind: 'prs', page: 3 });

    expect(pullRequests.find).toHaveBeenCalledWith({
      where: { repositoryId: 3 },
      relations: { repository: true, review: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: 50,
      take: 25,
    });
    expect(result).toMatchObject({ kind: 'prs', page: 3, per_page: 25, total_prs: 60 });
  });

  it('reports both totals whichever kind is asked for', async () => {
    const { service } = build({ prs: 4, commits: 9 });

    const result = await service.reviews(user, 3, { kind: 'commits' });

    expect(result).toMatchObject({ kind: 'commits', total_prs: 4, total_commits: 9, page: 1 });
  });

  it('opens a commit-only repository on its commits', async () => {
    const { service, pullRequests, commitReviews } = build({ prs: 0, commits: 4 });

    const result = await service.reviews(user, 3, {});

    expect(result.kind).toBe('commits');
    expect(commitReviews.find).toHaveBeenCalledWith({
      where: { repositoryId: 3 },
      relations: { repository: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: 0,
      take: 25,
    });
    expect(pullRequests.find).not.toHaveBeenCalled();
  });

  it('opens on pull requests otherwise, and honours an explicit kind', async () => {
    expect((await build().service.reviews(user, 3, {})).kind).toBe('prs');
    expect((await build({ prs: 2, commits: 4 }).service.reviews(user, 3, {})).kind).toBe('prs');
    expect((await build({ commits: 4 }).service.reviews(user, 3, { kind: 'prs' })).kind).toBe(
      'prs',
    );
  });

  it('describes the repository for the page header', async () => {
    const result = await build().service.reviews(user, 3, {});

    expect(result.repository).toEqual({
      id: 3,
      name: 'BSLCTR',
      full_name: 'Muhammad-AIUB/BSLCTR',
      review_mode: 'both',
    });
  });
});
