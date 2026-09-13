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
 * IS the invalidation. Laravel got that write for free from Eloquent's
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
    } as never;
    commitReviews = {
      findOne: jest.fn().mockResolvedValue(commitReview),
      update: jest.fn().mockResolvedValue(undefined),
    } as never;
    reviewQueue = {
      enqueueCommitReview: jest.fn().mockResolvedValue(undefined),
      enqueuePullRequestReview: jest.fn().mockResolvedValue(undefined),
    } as never;
    diffCache = {
      forget: jest.fn().mockResolvedValue(undefined),
      // Delegated, not stubbed: the assertion below compares against the real
      // key, so a change to the key format must show up here.
      commitKey: jest.fn((repoId: number, sha: string) => keys.commitKey(repoId, sha)),
    } as never;
    auditLog = { record: jest.fn().mockResolvedValue(undefined) } as never;

    service = new ReviewsService(
      {} as never,
      commitReviews as never,
      pullRequests as never,
      reviewQueue,
      diffCache as never,
      auditLog as never,
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
