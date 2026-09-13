import { GROQ_MODELS, GROQ_TIMEOUT_MS } from '../../ai/ai-client.service';
import { REQUEST_TIMEOUT_MS as GITHUB_TIMEOUT_MS } from '../../github/github-client.service';
import {
  REVIEW_JOB_ATTEMPTS,
  REVIEW_JOB_TIMEOUT_MS,
  reviewBackoffStrategy,
} from './review.queue';

/**
 * BullMQ's built-in strategies cannot express the [60, 180, 600] backoff, and
 * it removed per-job timeouts entirely in v5. Both had to be rebuilt, so both
 * are pinned here — a silent regression would mean jobs retrying on the wrong
 * schedule or hanging forever on the single worker slot.
 */
describe('review job retry policy', () => {
  it('keeps the three attempts the PHP had', () => {
    expect(REVIEW_JOB_ATTEMPTS).toBe(3);
  });

  /**
   * This assertion used to pin 120_000, copied from the PHP `$timeout = 120`.
   * That number was wrong here and pinning it hid the fact: one attempt can
   * spend GROQ_TIMEOUT_MS per model on the review pass, the same again on the
   * fixes pass, and a GitHub round trip either side. The job died mid-pipeline,
   * which made the graceful-degradation path unreachable whenever the models
   * failed by hanging. The budget is derived now, so what is worth pinning is
   * the relationship, not the value.
   */
  it('leaves room for the slowest attempt the pipeline can actually take', () => {
    const aiWorstCase = GROQ_TIMEOUT_MS * (GROQ_MODELS.length + 1);
    const githubWorstCase = GITHUB_TIMEOUT_MS * 2;

    expect(REVIEW_JOB_TIMEOUT_MS).toBeGreaterThan(aiWorstCase + githubWorstCase);
  });

  it('stays inside a range a free-tier worker slot can afford to block for', () => {
    // Unbounded growth here starves the single worker: concurrency is 1, so a
    // stuck job is the whole queue. Ten minutes is the outer limit.
    expect(REVIEW_JOB_TIMEOUT_MS).toBeLessThanOrEqual(600_000);
  });

  it('reproduces the [60, 180, 600] second backoff', () => {
    expect(reviewBackoffStrategy(1)).toBe(60_000);
    expect(reviewBackoffStrategy(2)).toBe(180_000);
    expect(reviewBackoffStrategy(3)).toBe(600_000);
  });

  it('clamps rather than returning undefined outside the schedule', () => {
    expect(reviewBackoffStrategy(0)).toBe(60_000);
    expect(reviewBackoffStrategy(99)).toBe(600_000);
  });
});
