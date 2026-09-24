import type { Repository as OrmRepository } from 'typeorm';
import { DiffCacheService } from '../../../cache/diff-cache.service';
import type { AuditLogService } from '../../../audit/audit-log.service';
import type { CommitReview, PullRequest, User } from '../../../database/entities';
import type { ReviewQueueService } from '../../review/review-queue.service';
import { ReviewsService } from './reviews.service';

/**
 * The two /api/v1 re-analyze endpoints, and specifically how each one
 * invalidates the cached diff — because they do it by different mechanisms and
 * neither mechanism is visible at the call site.
 *
 * The commit endpoint purges explicitly: its cache key is the SHA, which never
 * changes. The pull-request endpoint has no explicit purge and must not grow
 * one — its key is sha1(head_branch|updated_at), so writing a fresh updated_at
 * IS the invalidation. The original got that write for free from the original ORM's
 * timestamps; TypeORM entities here declare plain @Column timestamps, so it has
 * to be passed by hand or the worker re-reviews the same bytes for an hour.
 */
const STALE = new Date('2026-09-01T10:00:00Z');

const user = { id: 1 } as User;

const pullRequest = {
  id: 42,
  prNumber: 7,
  headBranch: 'feature/login',
  updatedAt: STALE,
  repository: { userId: 1 },
} as unknown as PullRequest;

const commitReview = {
  id: 66,
  repositoryId: 7,
  commitSha: 'a'.repeat(40),
  shortSha: () => 'aaaaaaa',
  repository: { userId: 1 },
} as unknown as CommitReview;

describe('ReviewsService re-analyze', () => {
  let pullRequests: jest.Mocked<Pick<OrmRepository<PullRequest>, 'findOne' | 'update'>>;
  let commitReviews: jest.Mocked<Pick<OrmRepository<CommitReview>, 'findOne' | 'update'>>;
  let reviewQueue: jest.Mocked<ReviewQueueService>;
  let diffCache: jest.Mocked<Pick<DiffCacheService, 'forget' | 'commitKey'>>;
  let auditLog: jest.Mocked<Pick<AuditLogService, 'record'>>;
  let service: ReviewsService;

  /** The real key function, so the assertions track production behaviour. */
  const keys = new DiffCacheService(null as never);

  beforeEach(() => {
    pullRequests = {
      findOne: jest.fn().mockResolvedValue(pullRequest),
      update: jest.fn().mockResolvedValue(undefined),
    };
    commitReviews = {
      findOne: jest.fn().mockResolvedValue(commitReview),
      update: jest.fn().mockResolvedValue(undefined),
    };
    reviewQueue = {
      enqueueCommitReview: jest.fn().mockResolvedValue(undefined),
      enqueuePullRequestReview: jest.fn().mockResolvedValue(undefined),
    } as never;
    diffCache = {
      forget: jest.fn().mockResolvedValue(undefined),
      // Delegated, not stubbed: the assertion below compares against the real
      // key, so a change to the key format must show up here.
      commitKey: jest.fn((repoId: number, sha: string) => keys.commitKey(repoId, sha)),
    };
    auditLog = { record: jest.fn().mockResolvedValue(undefined) };

    service = new ReviewsService(
      {} as never,
      commitReviews as never,
      pullRequests as never,
      reviewQueue,
      diffCache as never,
      auditLog as never,
      {} as never,
    );
  });

  describe('reAnalyzePullRequest', () => {
    it('writes a fresh updated_at, which is what invalidates the cached diff', async () => {
      await service.reAnalyzePullRequest(user, 42);

      const [, values] = pullRequests.update.mock.calls[0] as [unknown, Partial<PullRequest>];

      expect(values.status).toBe('analyzing');
      expect(values.updatedAt).toBeInstanceOf(Date);

      // The point of the write: the worker's cache key must change, or
      // remember() serves the diff captured before the user pushed their fix.
      const staleKey = keys.pullRequestKey(pullRequest.id, pullRequest.headBranch, STALE);
      const freshKey = keys.pullRequestKey(
        pullRequest.id,
        pullRequest.headBranch,
        values.updatedAt as Date,
      );

      expect(freshKey).not.toBe(staleKey);
    });

    it('still purges nothing explicitly — the timestamp is the whole mechanism', async () => {
      await service.reAnalyzePullRequest(user, 42);

      expect(diffCache.forget).not.toHaveBeenCalled();
      expect(reviewQueue.enqueuePullRequestReview).toHaveBeenCalledWith(42);
    });

    it('403s on a pull request owned by someone else', async () => {
      pullRequests.findOne.mockResolvedValue({
        ...pullRequest,
        repository: { userId: 2 },
      } as unknown as PullRequest);

      await expect(service.reAnalyzePullRequest(user, 42)).rejects.toThrow(
        'Not your repository',
      );
      expect(reviewQueue.enqueuePullRequestReview).not.toHaveBeenCalled();
    });
  });

  describe('reAnalyzeCommit', () => {
    it('purges the SHA-keyed diff explicitly, since that key never changes', async () => {
      await service.reAnalyzeCommit(user, 66);

      expect(diffCache.forget).toHaveBeenCalledWith(
        keys.commitKey(commitReview.repositoryId, commitReview.commitSha),
      );
      expect(reviewQueue.enqueueCommitReview).toHaveBeenCalledWith(66);
    });

    it('blanks the card: score, summary, all three issue arrays and the fixes', async () => {
      await service.reAnalyzeCommit(user, 66);

      const [, values] = commitReviews.update.mock.calls[0] as [unknown, Partial<CommitReview>];

      expect(values).toMatchObject({
        status: 'analyzing',
        overallScore: null,
        summary: null,
        securityIssues: null,
        performanceIssues: null,
        codeQualityIssues: null,
        suggestedFixes: null,
      });
    });
  });
});

describe('ReviewsService risk', () => {
  const risk = { level: 'low', score: 0, stats: {}, signals: [], checklist: [] };
  const assessed = { risk, basis: 'reviewed' };

  function build(pr: unknown, commit: unknown) {
    const changeRisk = {
      forPullRequest: jest.fn().mockResolvedValue(assessed),
      forCommit: jest.fn().mockResolvedValue(assessed),
    };
    const service = new ReviewsService(
      {} as never,
      { findOne: jest.fn().mockResolvedValue(commit) } as never,
      { findOne: jest.fn().mockResolvedValue(pr) } as never,
      {} as never,
      {} as never,
      {} as never,
      changeRisk as never,
    );

    return { service, changeRisk };
  }

  it('returns the assessment for a pull request the caller owns', async () => {
    const { service, changeRisk } = build(pullRequest, null);

    await expect(service.pullRequestRisk(user, 42)).resolves.toEqual(assessed);
    expect(changeRisk.forPullRequest).toHaveBeenCalledWith(user, pullRequest);
  });

  it('refuses someone else\'s repository before any diff is read', async () => {
    const foreign = { ...pullRequest, repository: { userId: 2 } };
    const { service, changeRisk } = build(foreign, { ...commitReview, repository: { userId: 2 } });

    await expect(service.pullRequestRisk(user, 42)).rejects.toThrow('Not your repository');
    await expect(service.commitRisk(user, 66)).rejects.toThrow('Not your repository');
    expect(changeRisk.forPullRequest).not.toHaveBeenCalled();
    expect(changeRisk.forCommit).not.toHaveBeenCalled();
  });

  it('answers a missing row with the same 404 body the show routes use', async () => {
    const { service } = build(null, null);

    await expect(service.commitRisk(user, 9)).rejects.toThrow(
      'No query results for model [App\\Models\\CommitReview] 9',
    );
  });
});
