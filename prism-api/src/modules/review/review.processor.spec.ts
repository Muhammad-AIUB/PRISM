import type { Job } from 'bullmq';
import type { CommitReviewRunner } from './commit-review.runner';
import type { PullRequestReviewRunner } from './pr-review.runner';
import { ReviewProcessor } from './review.processor';
import { COMMIT_REVIEW_JOB, PR_REVIEW_JOB, REVIEW_JOB_TIMEOUT_MS } from './review.queue';

/**
 * What the per-attempt deadline does when it fires.
 *
 * The first implementation raced the runner against a timer. Promise.race
 * resolves, but it does not cancel: the runner kept going, so a timed-out
 * attempt still posted its GitHub comment and still wrote its status while the
 * retry ran the same pipeline. The tests below are about that — the deadline
 * has to reach the work, not just stop waiting for it.
 */
const job = (name: string, data: Record<string, unknown>) =>
  ({ name, id: '1', data, attemptsMade: 0, opts: { attempts: 3 } }) as unknown as Job;

describe('ReviewProcessor deadline', () => {
  let commitRunner: jest.Mocked<Pick<CommitReviewRunner, 'run' | 'markFailed'>>;
  let prRunner: jest.Mocked<Pick<PullRequestReviewRunner, 'run' | 'markFailed'>>;
  let processor: ReviewProcessor;

  beforeEach(() => {
    jest.useFakeTimers();
    commitRunner = { run: jest.fn(), markFailed: jest.fn() } as never;
    prRunner = { run: jest.fn(), markFailed: jest.fn() } as never;
    processor = new ReviewProcessor(commitRunner as never, prRunner as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('hands the commit runner a signal that is live at the start', async () => {
    commitRunner.run.mockImplementation(async (_id, _attempt, signal) => {
      expect(signal?.aborted).toBe(false);
    });

    await processor.process(job(COMMIT_REVIEW_JOB, { commitReviewId: 5 }));

    expect(commitRunner.run).toHaveBeenCalledWith(5, 1, expect.anything());
  });

  it('aborts that signal once the budget is spent', async () => {
    let observed: AbortSignal | undefined;

    commitRunner.run.mockImplementation(async (_id, _attempt, signal) => {
      observed = signal;

      // Stand in for a hung provider call: still running when time runs out.
      await new Promise<void>((resolve) => {
        signal?.addEventListener('abort', () => resolve());
      });
    });

    const running = processor.process(job(COMMIT_REVIEW_JOB, { commitReviewId: 5 }));

    expect(observed?.aborted).toBe(false);

    jest.advanceTimersByTime(REVIEW_JOB_TIMEOUT_MS);
    await running;

    expect(observed?.aborted).toBe(true);
    expect(String(observed?.reason)).toContain('exceeded');
  });

  it('awaits the runner directly, so a rejection fails the job', async () => {
    prRunner.run.mockRejectedValue(new Error('GitHub 502'));

    await expect(processor.process(job(PR_REVIEW_JOB, { pullRequestId: 9 }))).rejects.toThrow(
      'GitHub 502',
    );
  });

  it('clears the timer on the happy path rather than leaving it pending', async () => {
    commitRunner.run.mockResolvedValue(undefined);

    await processor.process(job(COMMIT_REVIEW_JOB, { commitReviewId: 5 }));

    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears the timer when the runner throws too', async () => {
    commitRunner.run.mockRejectedValue(new Error('boom'));

    await expect(
      processor.process(job(COMMIT_REVIEW_JOB, { commitReviewId: 5 })),
    ).rejects.toThrow('boom');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rejects a job name it does not route', async () => {
    await expect(processor.process(job('nonsense', {}))).rejects.toThrow(
      'Unknown review job name: nonsense',
    );
  });
});
