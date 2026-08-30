import { createHmac } from 'node:crypto';
import type { Repository as OrmRepository } from 'typeorm';
import type { CommitReview, PullRequest, Repository } from '../../database/entities';
import type { ReviewQueueService } from '../review/review-queue.service';
import { WebhookService } from './webhook.service';

/**
 * GitHub records the status and body of every delivery and shows them in the
 * repository's webhook settings, so both are part of the contract. Every case
 * below is asserted against what Laravel's WebhookController returned.
 */
const SECRET = 'shhh';

const repository = {
  id: 7,
  userId: 1,
  fullName: 'muhammad/demo',
  githubRepoId: 999,
  webhookSecret: SECRET,
  reviewMode: 'both',
  reviewBranches: null,
} as unknown as Repository;

function sign(payload: string, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
}

describe('WebhookService', () => {
  let repositories: jest.Mocked<Pick<OrmRepository<Repository>, 'findOne'>>;
  let pullRequests: jest.Mocked<
    Pick<OrmRepository<PullRequest>, 'findOne' | 'update' | 'save' | 'create'>
  >;
  let commitReviews: jest.Mocked<
    Pick<OrmRepository<CommitReview>, 'findOne' | 'save' | 'create'>
  >;
  let queue: jest.Mocked<ReviewQueueService>;
  let service: WebhookService;

  beforeEach(() => {
    repositories = { findOne: jest.fn().mockResolvedValue(repository) } as never;
    pullRequests = {
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((values) => values),
      save: jest.fn().mockImplementation((values) => ({ ...values, id: 55 })),
    } as never;
    commitReviews = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((values) => values),
      save: jest.fn().mockImplementation((values) => ({ ...values, id: 66 })),
    } as never;
    queue = {
      enqueueCommitReview: jest.fn().mockResolvedValue(undefined),
      enqueuePullRequestReview: jest.fn().mockResolvedValue(undefined),
    } as never;

    service = new WebhookService(
      repositories as never,
      pullRequests as never,
      commitReviews as never,
      queue,
    );
  });

  const deliver = (body: unknown, event: string, secret = SECRET) => {
    const payload = JSON.stringify(body);

    return service.handle(Buffer.from(payload, 'utf8'), {
      signature: sign(payload, secret),
      deliveryId: 'delivery-1',
      event,
    });
  };

  describe('rejections', () => {
    it('400s when the payload carries no repository id', async () => {
      await expect(deliver({}, 'ping')).resolves.toEqual({
        status: 400,
        body: { message: 'Missing repository id' },
      });
    });

    it('404s when the repository is not connected', async () => {
      repositories.findOne.mockResolvedValue(null);

      await expect(deliver({ repository: { id: 999 } }, 'ping')).resolves.toEqual({
        status: 404,
        body: { message: 'Repository not connected' },
      });
    });

    it('401s on a signature computed with the wrong secret', async () => {
      await expect(deliver({ repository: { id: 999 } }, 'ping', 'wrong')).resolves.toEqual({
        status: 401,
        body: { message: 'Invalid signature' },
      });
    });

    it('401s when the signature header is absent', async () => {
      const payload = JSON.stringify({ repository: { id: 999 } });

      await expect(
        service.handle(Buffer.from(payload), { event: 'ping' }),
      ).resolves.toEqual({ status: 401, body: { message: 'Invalid signature' } });
    });
  });

  describe('event routing', () => {
    it('answers ping with pong', async () => {
      await expect(deliver({ repository: { id: 999 } }, 'ping')).resolves.toEqual({
        status: 200,
        body: { message: 'pong' },
      });
    });

    it('ignores unhandled events with a 200', async () => {
      await expect(deliver({ repository: { id: 999 } }, 'issues')).resolves.toEqual({
        status: 200,
        body: { message: 'Ignored event: issues' },
      });
    });
  });

  describe('pull_request', () => {
    const prBody = (action: string) => ({
      action,
      repository: { id: 999 },
      pull_request: {
        id: 4242,
        number: 12,
        title: 'Add caching',
        user: { login: 'muhammad' },
        base: { ref: 'main' },
        head: { ref: 'feature' },
        diff_url: 'https://github.com/x.diff',
      },
    });

    it.each(['closed', 'labeled', 'reopened'])('ignores the %s action', async (action) => {
      await expect(deliver(prBody(action), 'pull_request')).resolves.toEqual({
        status: 200,
        body: { message: `Ignored action: ${action}` },
      });
      expect(queue.enqueuePullRequestReview).not.toHaveBeenCalled();
    });

    it.each(['opened', 'synchronize'])('queues a review on %s', async (action) => {
      await expect(deliver(prBody(action), 'pull_request')).resolves.toEqual({
        status: 200,
        body: { message: 'Review queued', pr_id: 55 },
      });
      expect(queue.enqueuePullRequestReview).toHaveBeenCalledWith(55);
    });

    it('updates an existing row, because Laravel used updateOrCreate', async () => {
      pullRequests.findOne.mockResolvedValue({ id: 55 } as PullRequest);

      await deliver(prBody('synchronize'), 'pull_request');

      expect(pullRequests.update).toHaveBeenCalledWith(
        55,
        expect.objectContaining({ title: 'Add caching', status: 'pending' }),
      );
      expect(pullRequests.save).not.toHaveBeenCalled();
    });
  });

  describe('push', () => {
    const pushBody = (overrides: Record<string, unknown> = {}) => ({
      repository: { id: 999 },
      ref: 'refs/heads/main',
      after: 'a'.repeat(40),
      pusher: { name: 'muhammad' },
      head_commit: { id: 'a'.repeat(40), message: 'Fix things', author: { username: 'muhammad' } },
      commits: [{ id: 'a'.repeat(40), message: 'Fix things', author: { username: 'muhammad' } }],
      ...overrides,
    });

    it('queues a commit review for a watched branch', async () => {
      await expect(deliver(pushBody(), 'push')).resolves.toEqual({
        status: 200,
        body: { message: 'Commit review queued', review_id: 66 },
      });
      expect(queue.enqueueCommitReview).toHaveBeenCalledWith(66);
    });

    it('refuses pushes on a pr_only repository before checking the branch', async () => {
      repositories.findOne.mockResolvedValue({ ...repository, reviewMode: 'pr_only' } as never);

      await expect(
        deliver(pushBody({ ref: 'refs/heads/nope' }), 'push'),
      ).resolves.toEqual({ status: 200, body: { message: 'Repository set to PR-only mode' } });
    });

    it('defaults the watched branches to main and master', async () => {
      await expect(deliver(pushBody({ ref: 'refs/heads/dev' }), 'push')).resolves.toEqual({
        status: 200,
        body: { message: 'Branch not watched: dev' },
      });
      await expect(deliver(pushBody({ ref: 'refs/heads/master' }), 'push')).resolves.toEqual({
        status: 200,
        body: { message: 'Commit review queued', review_id: 66 },
      });
    });

    it('honours an explicit review_branches list', async () => {
      repositories.findOne.mockResolvedValue({
        ...repository,
        reviewBranches: ['develop'],
      } as never);

      await expect(deliver(pushBody({ ref: 'refs/heads/main' }), 'push')).resolves.toEqual({
        status: 200,
        body: { message: 'Branch not watched: main' },
      });
    });

    it('skips branch deletions', async () => {
      await expect(deliver(pushBody({ deleted: true }), 'push')).resolves.toEqual({
        status: 200,
        body: { message: 'Branch deleted, skipping' },
      });
    });

    it.each([
      ['an absent sha', undefined],
      ['the null sha', '0'.repeat(40)],
    ])('skips %s', async (_label, after) => {
      await expect(deliver(pushBody({ after }), 'push')).resolves.toEqual({
        status: 200,
        body: { message: 'No head commit' },
      });
    });

    it('does NOT update an existing row, because Laravel used firstOrCreate', async () => {
      commitReviews.findOne.mockResolvedValue({ id: 66 } as CommitReview);

      await deliver(pushBody({ head_commit: { message: 'Rewritten' } }), 'push');

      expect(commitReviews.save).not.toHaveBeenCalled();
      expect(queue.enqueueCommitReview).toHaveBeenCalledWith(66);
    });

    it('falls back through author.username, author.name, then pusher.name', async () => {
      await deliver(
        pushBody({
          commits: [],
          head_commit: { id: 'a'.repeat(40), message: 'm', author: { name: 'Fallback Name' } },
        }),
        'push',
      );

      expect(commitReviews.save).toHaveBeenCalledWith(
        expect.objectContaining({ author: 'Fallback Name' }),
      );
    });
  });
});
