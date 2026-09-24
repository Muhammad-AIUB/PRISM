import { BadGatewayException } from '@nestjs/common';
import { DiffCacheService } from '../../cache/diff-cache.service';
import type { CommitReview, PullRequest, User } from '../../database/entities';
import { ChangeRiskService } from './change-risk.service';

const owner = { id: 1, githubToken: 'encrypted' } as User;

const pr = {
  id: 42,
  prNumber: 7,
  headBranch: 'feature/login',
  updatedAt: new Date('2026-09-01T10:00:00Z'),
  repository: { fullName: 'acme/app' },
} as unknown as PullRequest;

const commit = {
  repositoryId: 3,
  commitSha: 'b'.repeat(40),
  repository: { fullName: 'acme/app' },
} as unknown as CommitReview;

const DIFF = [
  'diff --git a/src/auth/login.ts b/src/auth/login.ts',
  '--- a/src/auth/login.ts',
  '+++ b/src/auth/login.ts',
  '@@ -1,1 +1,1 @@',
  '+const ok = true;',
].join('\n');

describe('ChangeRiskService', () => {
  const keys = new DiffCacheService(null as never);

  function build(
    loader: (key: string, load: () => Promise<string>) => Promise<string>,
    reviewedRisk: unknown = null,
  ) {
    const diffCache = {
      remember: jest.fn(loader),
      pullRequestKey: keys.pullRequestKey.bind(keys),
      commitKey: keys.commitKey.bind(keys),
    };
    const github = {
      fetchPullRequestDiff: jest.fn().mockResolvedValue(DIFF),
      fetchCommitDiff: jest.fn().mockResolvedValue(DIFF),
    };
    const crypt = { decrypt: jest.fn().mockReturnValue('gho_token') };
    const reviewed = { find: jest.fn().mockResolvedValue(reviewedRisk) };
    const service = new ChangeRiskService(
      diffCache as never,
      github as never,
      crypt as never,
      reviewed as never,
    );

    return { service, diffCache, github, reviewed };
  }

  it('serves the assessment of the revision the review read, without touching the live diff', async () => {
    const saved = { level: 'high', score: 70, stats: {}, signals: [], checklist: [] };
    const { service, diffCache, github } = build(async () => DIFF, saved);

    await expect(service.forPullRequest(owner, pr)).resolves.toEqual({
      risk: saved,
      basis: 'reviewed',
    });
    // A later push has moved the PR on; none of that may leak into this answer.
    expect(diffCache.remember).not.toHaveBeenCalled();
    expect(github.fetchPullRequestDiff).not.toHaveBeenCalled();
  });

  it('falls back to the live head only when nothing was saved, and labels it as such', async () => {
    const { service, diffCache, github } = build(async () => DIFF);

    const { risk, basis } = await service.forPullRequest(owner, pr);

    expect(basis).toBe('current');
    expect(diffCache.remember.mock.calls[0]?.[0]).toBe(
      keys.pullRequestKey(pr.id, pr.headBranch, pr.updatedAt),
    );
    expect(github.fetchPullRequestDiff).not.toHaveBeenCalled();
    expect(risk.signals.map((s) => s.id)).toContain('auth');
  });

  it('calls a commit\'s risk reviewed, since its diff cannot change', async () => {
    const { service } = build(async () => DIFF);

    await expect(service.forCommit(owner, commit)).resolves.toMatchObject({ basis: 'reviewed' });
  });

  it('fetches with the owner\'s decrypted token on a cache miss', async () => {
    const { service, github } = build(async (_key, load) => load());

    await service.forCommit(owner, commit);

    expect(github.fetchCommitDiff).toHaveBeenCalledWith('gho_token', 'acme/app', commit.commitSha);
  });

  it('reports a GitHub failure as a 502 naming GitHub\'s status', async () => {
    const { service } = build(async () => {
      throw new Error('Failed to fetch diff: 404');
    });

    const failure = service.forPullRequest(owner, pr);

    await expect(failure).rejects.toBeInstanceOf(BadGatewayException);
    await expect(failure).rejects.toThrow('Could not fetch the diff from GitHub (HTTP 404).');
  });
});
