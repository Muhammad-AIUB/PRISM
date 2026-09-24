import type { ReviewIssue } from '../database/entities/review.entity';
import { BLOCKING_CATEGORIES, type IssueCategory } from './prompt-builder.service';

/**
 * The one line a reviewer reads first.
 *
 * `overall_score` stays in the database and in every API response, because
 * `mcp-server/index.js` reads it in both detail and list responses and that
 * contract is additive-only. But it stops being the headline. A number out of a
 * hundred is unstable across re-runs, unverifiable against anything, and
 * answers a question nobody asked; "is there anything here that should stop me
 * merging" is the question people actually have.
 *
 * For that to be an improvement rather than a rename, `blocking` has to mean
 * something a person can confirm. So it is NOT the model's own
 * `severity: critical` — that is free text sampled at temperature 0.2 and a
 * model will call anything critical. It requires a category from
 * BLOCKING_CATEGORIES, each of which is a claim a reader can check against the
 * diff in seconds: an auth check was removed, a public contract changed shape,
 * a new outbound call has no timeout.
 */
/**
 * `not_reviewed` is not a softer "nothing found": it means no model produced a
 * review at all, so nothing was checked. Showing that as a green all-clear is
 * the most misleading thing this product could say.
 */
export type Verdict = 'blocking' | 'worth_a_look' | 'nothing_found' | 'not_reviewed';

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  warning: 1,
  suggestion: 2,
};

const isBlocking = (issue: ReviewIssue): boolean =>
  BLOCKING_CATEGORIES.includes(issue.category as IssueCategory);

/**
 * The verdict for a stored review. Its findings alone cannot tell "checked and
 * clean" from "never checked"; the fallback summary the runners write can.
 */
export function verdictForReview(
  findings: readonly ReviewIssue[],
  summary: string | null | undefined,
): Verdict {
  return isIncompleteReview(summary) ? 'not_reviewed' : verdictFor(findings);
}

export function verdictFor(findings: readonly ReviewIssue[]): Verdict {
  if (findings.length === 0) {
    return 'nothing_found';
  }

  return findings.some(isBlocking) ? 'blocking' : 'worth_a_look';
}

/**
 * The score bands the system prompt itself defines. It tells the model that a
 * clean change with only minor suggestions scores 80-95, so 80 is the floor of
 * "clean" and anything at or above it is a claim the verdict has to support.
 */
const CLEAN_FLOOR = 80;
const BLOCKING_CEILING = 60;

/**
 * Pulls `overall_score` into agreement with the verdict.
 *
 * The model produces the score in the same breath as the issue list, before
 * validation drops anything. So a review that reported six problems and had
 * five fail to resolve can render "Score 88/100" directly above the word
 * BLOCKING. Both halves are then saying different things about the same change,
 * and a reader who notices once discounts the number and the verdict together.
 *
 * The score cannot be removed — `mcp-server/index.js` reads it in both detail
 * and list responses, and that contract is additive-only. So it is reconciled
 * instead, and only ever in the direction the verdict already justifies. A null
 * score is left null: that means no model answered, which is a third thing and
 * not a judgement about the code at all.
 */
export function reconcileScore(score: number | null, verdict: Verdict): number | null {
  if (score === null) {
    return null;
  }

  if (verdict === 'blocking') {
    return Math.min(score, BLOCKING_CEILING);
  }

  if (verdict === 'nothing_found') {
    return Math.max(score, CLEAN_FLOOR);
  }

  return score;
}

/**
 * Worst first, where "worst" means checkable before it means loud.
 *
 * Ties keep their original order. Three severity values across three layers
 * makes ties the common case, and an unstable sort would reshuffle a review's
 * findings between two renders of the same data — which looks, to a reader,
 * exactly like the review changed its mind.
 */
export function orderFindings(findings: readonly ReviewIssue[]): ReviewIssue[] {
  return findings
    .map((finding, index) => ({ finding, index }))
    .sort((a, b) => {
      const blocking = Number(isBlocking(b.finding)) - Number(isBlocking(a.finding));

      if (blocking !== 0) {
        return blocking;
      }

      const severity =
        (SEVERITY_RANK[a.finding.severity ?? 'suggestion'] ?? 2) -
        (SEVERITY_RANK[b.finding.severity ?? 'suggestion'] ?? 2);

      return severity !== 0 ? severity : a.index - b.index;
    })
    .map(({ finding }) => finding);
}

/**
 * What a review says when no model produced a usable answer. The review still
 * completes (documented graceful degradation), but it has checked nothing, so
 * every surface must be able to tell it apart from a clean one - see
 * `verdictForReview`. Both runners write exactly these, which is what makes
 * them safe to recognise; do not reword one without the other.
 */
export const UNPARSEABLE_REVIEW = "AI review couldn't be parsed cleanly. Click Re-analyze to retry.";
export const EMPTY_REVIEW = "AI review didn't return any usable content. Click Re-analyze to retry.";

export function incompleteReviewSummary(raw: string | null): string {
  return raw ? `${UNPARSEABLE_REVIEW}\n\n— Raw output —\n${raw.slice(0, 1500)}` : EMPTY_REVIEW;
}

export function isIncompleteReview(summary: string | null | undefined): boolean {
  return Boolean(summary && (summary.startsWith(UNPARSEABLE_REVIEW) || summary.startsWith(EMPTY_REVIEW)));
}
