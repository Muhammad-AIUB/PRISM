import {
  REVIEW_JOB_ATTEMPTS,
  REVIEW_JOB_TIMEOUT_MS,
  reviewBackoffStrategy,
} from './review.queue';

/**
 * BullMQ's built-in strategies cannot express Laravel's [60, 180, 600], and it
 * removed per-job timeouts entirely in v5. Both had to be rebuilt, so both are
 * pinned here — a silent regression would mean jobs retrying on the wrong
 * schedule or hanging forever on the single worker slot.
 */
describe('review job retry policy', () => {
  it('matches Laravel $tries and $timeout', () => {
    expect(REVIEW_JOB_ATTEMPTS).toBe(3);
    expect(REVIEW_JOB_TIMEOUT_MS).toBe(120_000);
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
