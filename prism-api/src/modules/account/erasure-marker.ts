/**
 * The marker that closes the gap between "erasure started" and "the user row
 * is gone".
 *
 * Account erasure has to clear Redis before it deletes anything irreversible
 * (so a Redis failure can still abort it), which leaves a window - webhook
 * removal alone can take seconds per repository - in which work already in
 * flight can write again: a design finishing generation, a pull-request review
 * saving its risk assessment. Once the user row is gone, nothing could find
 * those writes to erase them.
 *
 * So erasure sets this marker first, and every Redis store holding a user's
 * data saves through an atomic script that refuses while it exists. Each write
 * then lands either before the purge reads it, or never. A new store that
 * holds user data must do the same.
 */
export function erasureMarkerKey(userId: number): string {
  return `account:erased:${userId}`;
}

/**
 * Must outlast anything in flight when erasure starts: a review attempt
 * (REVIEW_JOB_TIMEOUT_MS) and a design generation (DESIGN_BUDGET_MS). A test
 * pins that. A review retried after the user row is gone finds no pull request
 * and stops, so the marker does not need to outlast the retry schedule.
 */
export const ERASURE_MARKER_TTL_SECONDS = 60 * 60;
