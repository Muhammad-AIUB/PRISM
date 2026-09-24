import { REVIEW_JOB_TIMEOUT_MS } from '../review/review.queue';
import { DESIGN_BUDGET_MS } from '../design/design.service';
import { ERASURE_MARKER_TTL_SECONDS } from './erasure-marker';

/**
 * The marker has to outlive anything already running when erasure starts.
 * These are derived numbers elsewhere; pinning the relation here means raising
 * a budget cannot silently reopen the window the marker closes.
 */
describe('erasure marker lifetime', () => {
  it('outlasts a whole review attempt and a whole design generation, with room to spare', () => {
    expect(ERASURE_MARKER_TTL_SECONDS * 1000).toBeGreaterThan(REVIEW_JOB_TIMEOUT_MS * 2);
    expect(ERASURE_MARKER_TTL_SECONDS * 1000).toBeGreaterThan(DESIGN_BUDGET_MS * 2);
  });
});
