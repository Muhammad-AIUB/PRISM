import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommitReview, type PullRequest, type User } from '../../database/entities';
import { UNPARSEABLE_REVIEW } from '../../ai/verdict';
import { ReviewsWebService } from './reviews-web.service';

const owner = { id: 1 } as User;
const stranger = { id: 2 } as User;

function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: 10,
    prNumber: 4,
    title: 'Add cache',
    status: 'completed',
    repository: { userId: 1, fullName: 'ada/app', name: 'app', user: { githubToken: 'cipher' } },
    review: { id: 20, summary: 'Looks fine', securityIssues: [], performanceIssues: [], codeQualityIssues: [], comments: [] },
    ...overrides,
  } as unknown as PullRequest;
}

function commit(overrides: Partial<CommitReview> = {}): CommitReview {
  return Object.assign(new CommitReview(), {
    id: 30,
    repositoryId: 5,
    commitSha: 'abcdef1234567890',
    summary: null,
    repository: { userId: 1, fullName: 'ada/app', name: 'app' },
    ...overrides,
  });
}

function build({
  pull = pr(),
  cr = commit(),
}: { pull?: PullRequest | null; cr?: CommitReview | null } = {}) {
  const deps = {
    pullRequests: { findOne: jest.fn().mockResolvedValue(pull), update: jest.fn() },
    reviews: { delete: jest.fn() },
    reviewComments: { delete: jest.fn() },
    commitReviews: { findOne: jest.fn().mockResolvedValue(cr), update: jest.fn() },
    queue: { enqueuePullRequestReview: jest.fn(), enqueueCommitReview: jest.fn() },
    github: { fetchPullRequestDiff: jest.fn().mockResolvedValue('diff --git a/x b/x') },
    crypt: { decrypt: jest.fn().mockReturnValue('gh-token') },
    diffCache: { forget: jest.fn(), commitKey: jest.fn().mockReturnValue('commit-key') },
    auditLog: { record: jest.fn() },
    changeRisk: { forPullRequest: jest.fn().mockResolvedValue({}), forCommit: jest.fn().mockResolvedValue({}) },
    reviewedRisk: { forget: jest.fn() },
  };
  const service = new ReviewsWebService(
    deps.pullRequests as never,
    deps.reviews as never,
    deps.reviewComments as never,
    deps.commitReviews as never,
    deps.queue as never,
    deps.github as never,
    deps.crypt as never,
    deps.diffCache as never,
    deps.auditLog as never,
    deps.changeRisk as never,
    deps.reviewedRisk as never,
  );

  return { service, ...deps };
}

/**
 * Every route here reads a user's private code through their GitHub token, so
 * ownership is the whole security model. Each one must refuse a stranger
 * before it touches GitHub, the queue or the database.
 */
describe('ReviewsWebService ownership', () => {
  const prRoutes: [string, (s: ReviewsWebService, u: User) => Promise<unknown>][] = [
    ['showPullRequest', (s, u) => s.showPullRequest(u, 10)],
    ['reAnalyzePullRequest', (s, u) => s.reAnalyzePullRequest(u, 10)],
    ['pullRequestDiff', (s, u) => s.pullRequestDiff(u, 10)],
    ['pullRequestRisk', (s, u) => s.pullRequestRisk(u, 10)],
    ['exportData', (s, u) => s.exportData(u, 10)],
  ];
  const commitRoutes: [string, (s: ReviewsWebService, u: User) => Promise<unknown>][] = [
    ['showCommit', (s, u) => s.showCommit(u, 30)],
    ['reAnalyzeCommit', (s, u) => s.reAnalyzeCommit(u, 30)],
    ['commitRisk', (s, u) => s.commitRisk(u, 30)],
  ];

  it.each([...prRoutes, ...commitRoutes])("%s refuses someone else's review and does nothing", async (_name, call) => {
    const deps = build();

    await expect(call(deps.service, stranger)).rejects.toBeInstanceOf(ForbiddenException);

    expect(deps.github.fetchPullRequestDiff).not.toHaveBeenCalled();
    expect(deps.crypt.decrypt).not.toHaveBeenCalled();
    expect(deps.pullRequests.update).not.toHaveBeenCalled();
    expect(deps.commitReviews.update).not.toHaveBeenCalled();
    expect(deps.queue.enqueuePullRequestReview).not.toHaveBeenCalled();
    expect(deps.queue.enqueueCommitReview).not.toHaveBeenCalled();
    expect(deps.changeRisk.forPullRequest).not.toHaveBeenCalled();
    expect(deps.changeRisk.forCommit).not.toHaveBeenCalled();
    expect(deps.auditLog.record).not.toHaveBeenCalled();
  });

  it.each(prRoutes)('%s refuses a pull request whose repository is gone', async (_name, call) => {
    const deps = build({ pull: pr({ repository: null as never }) });

    await expect(call(deps.service, owner)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(prRoutes)('%s answers 404 for a missing pull request', async (_name, call) => {
    await expect(call(build({ pull: null }).service, owner)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(commitRoutes)('%s answers 404 for a missing commit review', async (_name, call) => {
    await expect(call(build({ cr: null }).service, owner)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ReviewsWebService.reAnalyzePullRequest', () => {
  it('drops the old review and its saved risk, then queues exactly one job', async () => {
    const deps = build();

    await deps.service.reAnalyzePullRequest(owner, 10);

    expect(deps.pullRequests.update).toHaveBeenCalledWith(10, {
      status: 'analyzing',
      updatedAt: expect.any(Date) as Date,
    });
    expect(deps.reviewComments.delete).toHaveBeenCalledWith({ reviewId: 20 });
    expect(deps.reviews.delete).toHaveBeenCalledWith(20);
    expect(deps.reviewedRisk.forget).toHaveBeenCalledWith(10);
    expect(deps.queue.enqueuePullRequestReview).toHaveBeenCalledTimes(1);
    expect(deps.queue.enqueuePullRequestReview).toHaveBeenCalledWith(10);
  });

  it('queues a job even when there was no review yet', async () => {
    const deps = build({ pull: pr({ review: null as never }) });

    await deps.service.reAnalyzePullRequest(owner, 10);

    expect(deps.reviews.delete).not.toHaveBeenCalled();
    expect(deps.queue.enqueuePullRequestReview).toHaveBeenCalledWith(10);
  });
});

describe('ReviewsWebService.reAnalyzeCommit', () => {
  it('clears the old result and the cached diff before queueing', async () => {
    const deps = build();

    await deps.service.reAnalyzeCommit(owner, 30);

    expect(deps.commitReviews.update).toHaveBeenCalledWith(30, expect.objectContaining({
      status: 'analyzing',
      overallScore: null,
      summary: null,
    }));
    // Keyed on the SHA alone, so without this the retry re-reviews the same bytes.
    expect(deps.diffCache.commitKey).toHaveBeenCalledWith(5, 'abcdef1234567890');
    expect(deps.diffCache.forget).toHaveBeenCalledWith('commit-key');
    expect(deps.queue.enqueueCommitReview).toHaveBeenCalledWith(30);
  });
});

describe('ReviewsWebService.pullRequestDiff', () => {
  it("fetches with the owner's decrypted token", async () => {
    const deps = build();

    await expect(deps.service.pullRequestDiff(owner, 10)).resolves.toEqual({
      status: 200,
      body: 'diff --git a/x b/x',
    });
    expect(deps.crypt.decrypt).toHaveBeenCalledWith('cipher');
    expect(deps.github.fetchPullRequestDiff).toHaveBeenCalledWith('gh-token', 'ada/app', 4);
  });

  it("passes GitHub's status through, with no body", async () => {
    const deps = build();

    deps.github.fetchPullRequestDiff.mockRejectedValue(new Error('Failed to fetch diff: 404'));

    await expect(deps.service.pullRequestDiff(owner, 10)).resolves.toEqual({ status: 404, body: '' });
  });

  it('answers 502 when GitHub gave no status at all', async () => {
    const deps = build();

    deps.github.fetchPullRequestDiff.mockRejectedValue(new Error('socket hang up'));

    await expect(deps.service.pullRequestDiff(owner, 10)).resolves.toEqual({ status: 502, body: '' });
  });
});

describe('ReviewsWebService payloads', () => {
  it('does not call a review the model never completed "nothing found"', async () => {
    const { service } = build({ cr: commit({ summary: UNPARSEABLE_REVIEW, status: 'completed' as never }) });

    const { commitReview } = (await service.showCommit(owner, 30)) as {
      commitReview: { verdict: string; short_sha: string };
    };

    expect(commitReview.short_sha).toBe('abcdef1');
    expect(commitReview.verdict).toBe('not_reviewed');
  });

  it('never sends the GitHub token down with a pull request', async () => {
    const { service } = build();

    const payload = JSON.stringify(await service.showPullRequest(owner, 10));

    expect(payload).not.toContain('cipher');
    expect(payload).not.toContain('gh-token');
  });
});
