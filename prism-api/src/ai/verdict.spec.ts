import type { ReviewIssue } from '../database/entities/review.entity';
import {
  EMPTY_REVIEW,
  incompleteReviewSummary,
  isIncompleteReview,
  orderFindings,
  reconcileScore,
  UNPARSEABLE_REVIEW,
  verdictFor,
  verdictForReview,
} from './verdict';

/**
 * The answer to the question a reviewer actually has.
 *
 * "62 out of 100" is not one. It is unstable across re-runs, unverifiable
 * against anything, and it answers a question nobody asked. What someone wants
 * to know before merging is whether anything here should stop them, and if so,
 * what.
 *
 * The verdict has to be more checkable than the number it fronts, or it is the
 * same problem wearing a new label. So `blocking` is not the model's own
 * `severity: critical` — that is free-text judgement sampled at temperature 0.2.
 * It requires a category a person can confirm from the diff in seconds.
 */
const issue = (over: Partial<ReviewIssue>): ReviewIssue => ({
  file: 'a.ts',
  line: 1,
  side: 'added',
  severity: 'warning',
  category: 'other',
  comment: 'x',
  ...over,
});

describe('verdictFor', () => {
  it('says nothing found when there is nothing', () => {
    expect(verdictFor([])).toBe('nothing_found');
  });

  it('blocks on a category a reader can check against the diff', () => {
    expect(verdictFor([issue({ category: 'auth_weakened' })])).toBe('blocking');
    expect(verdictFor([issue({ category: 'contract_changed' })])).toBe('blocking');
    expect(verdictFor([issue({ category: 'no_timeout' })])).toBe('blocking');
  });

  /**
   * The guard that stops the verdict being a rename of the score. A model can
   * call anything critical; it cannot make an unconfirmable claim blocking.
   */
  it('does not block on severity alone', () => {
    expect(verdictFor([issue({ severity: 'critical', category: 'other' })])).toBe('worth_a_look');
    expect(verdictFor([issue({ severity: 'critical', category: 'untested_change' })])).toBe(
      'worth_a_look',
    );
  });

  it('falls to worth a look when findings exist but none are checkable', () => {
    expect(verdictFor([issue({}), issue({ category: 'error_swallowed' })])).toBe('worth_a_look');
  });

  it('blocks when one checkable finding hides among unblocking ones', () => {
    expect(
      verdictFor([issue({}), issue({ category: 'auth_weakened' }), issue({})]),
    ).toBe('blocking');
  });
});

describe('orderFindings', () => {
  it('puts blocking categories first, whatever the model called their severity', () => {
    const ordered = orderFindings([
      issue({ comment: 'plain', severity: 'critical', category: 'other' }),
      issue({ comment: 'blocking one', severity: 'suggestion', category: 'auth_weakened' }),
    ]);

    expect(ordered[0]?.comment).toBe('blocking one');
  });

  it('orders by severity within the same checkability', () => {
    const ordered = orderFindings([
      issue({ comment: 'sugg', severity: 'suggestion' }),
      issue({ comment: 'crit', severity: 'critical' }),
      issue({ comment: 'warn', severity: 'warning' }),
    ]);

    expect(ordered.map((f) => f.comment)).toEqual(['crit', 'warn', 'sugg']);
  });

  it('is stable for findings that tie, so a re-render does not reshuffle them', () => {
    const input = [
      issue({ comment: 'first', file: 'z.ts' }),
      issue({ comment: 'second', file: 'a.ts' }),
    ];

    expect(orderFindings(input).map((f) => f.comment)).toEqual(['first', 'second']);
  });

  it('does not mutate the array it was given', () => {
    const input = [issue({ comment: 'a', severity: 'suggestion' }), issue({ comment: 'b', severity: 'critical' })];
    orderFindings(input);

    expect(input[0]?.comment).toBe('a');
  });
});

/**
 * Stops the page contradicting itself.
 *
 * `overall_score` is produced by the model in the same breath as the issue list,
 * BEFORE validation drops anything. So a review that reported six problems and
 * had five of them fail to resolve can render "Score 88/100" directly above the
 * word BLOCKING, or "Nothing found" above a 30. Both read as a tool that has not
 * made up its mind, and a reader who notices once stops trusting the number and
 * the verdict together.
 *
 * The score cannot simply be removed — `mcp-server/index.js` reads it in both
 * detail and list responses and that contract is additive-only. So it is pulled
 * into agreement with the verdict instead, using the bands the prompt itself
 * defines: it tells the model a clean change scores 80-95.
 */
describe('reconcileScore', () => {
  it('caps a blocking review below the band the prompt calls clean', () => {
    expect(reconcileScore(88, 'blocking')).toBe(60);
    expect(reconcileScore(95, 'blocking')).toBe(60);
  });

  it('leaves an already-low blocking score alone', () => {
    expect(reconcileScore(20, 'blocking')).toBe(20);
    expect(reconcileScore(60, 'blocking')).toBe(60);
  });

  it('raises a nothing-found review to the clean floor', () => {
    expect(reconcileScore(30, 'nothing_found')).toBe(80);
  });

  it('leaves an already-clean nothing-found score alone', () => {
    expect(reconcileScore(92, 'nothing_found')).toBe(92);
  });

  it('does not touch the middle verdict, which claims nothing precise', () => {
    expect(reconcileScore(45, 'worth_a_look')).toBe(45);
    expect(reconcileScore(88, 'worth_a_look')).toBe(88);
  });

  it('leaves a null score null, because that means the models never answered', () => {
    expect(reconcileScore(null, 'blocking')).toBeNull();
    expect(reconcileScore(null, 'nothing_found')).toBeNull();
  });
});

describe('verdictForReview: a review no model produced is not an all-clear', () => {
  it('calls both fallback summaries "not_reviewed", never "nothing_found"', () => {
    expect(verdictForReview([], incompleteReviewSummary(null))).toBe('not_reviewed');
    expect(verdictForReview([], incompleteReviewSummary('{"half": '))).toBe('not_reviewed');
  });

  it('leaves real reviews alone, including genuinely clean ones', () => {
    expect(verdictForReview([], 'Looks good.')).toBe('nothing_found');
    expect(verdictForReview([], null)).toBe('nothing_found');
    expect(verdictForReview([{ category: 'auth_weakened' }], 'x')).toBe('blocking');
  });

  it('does not mistake a summary that merely mentions the phrase later on', () => {
    expect(isIncompleteReview(`Fine. ${EMPTY_REVIEW}`)).toBe(false);
  });

  it('keeps the raw model output, capped, after the unparseable notice', () => {
    const summary = incompleteReviewSummary('x'.repeat(5000));

    expect(summary.startsWith(UNPARSEABLE_REVIEW)).toBe(true);
    expect(summary.length).toBeLessThan(UNPARSEABLE_REVIEW.length + 1600);
  });
});
