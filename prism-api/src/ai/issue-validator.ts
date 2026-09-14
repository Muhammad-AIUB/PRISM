import type { Anchor } from '../diff/render';
import type { ReviewIssue } from '../database/entities/review.entity';
import type { ReviewSeverity } from '../database/entities/review-comment.entity';
import { ISSUE_CATEGORIES, type IssueCategory, type IssueLayers } from './prompt-builder.service';

/**
 * Turns what the model said into what we are willing to show.
 *
 * Before this existed, a reported location was taken on trust: nothing checked
 * that the file was in the diff or that the line was one that changed, and the
 * UI then displayed the number prominently. A developer who opens the named
 * line, finds nothing wrong there, and closes the tab does not come back.
 *
 * The model is shown opaque anchors, so its answer is either a line we rendered
 * or it is nothing. The location it reports is never displayed; the anchor's
 * location is. The file the model names is kept only as a cross-check — when it
 * disagrees with the anchor, one of the two is invented and the finding goes.
 *
 * Dropping a real finding is the failure this prefers. A missing comment costs
 * a bug; a confident wrong one costs the reader's belief in every other comment
 * on the page.
 */
const VALID_SEVERITIES: ReviewSeverity[] = ['critical', 'warning', 'suggestion'];

export interface ValidationResult {
  issues: ReviewIssue[];
  kept: number;
  total: number;
  dropped: {
    malformed: number;
    noAnchor: number;
    unknownAnchor: number;
    fileMismatch: number;
  };
}

const emptyResult = (): ValidationResult => ({
  issues: [],
  kept: 0,
  total: 0,
  dropped: { malformed: 0, noAnchor: 0, unknownAnchor: 0, fileMismatch: 0 },
});

export function validateIssues(
  raw: unknown,
  anchors: Map<number, Anchor>,
): ValidationResult {
  const result = emptyResult();

  if (!Array.isArray(raw)) {
    return result;
  }

  for (const entry of raw) {
    result.total += 1;

    if (typeof entry !== 'object' || entry === null) {
      result.dropped.malformed += 1;
      continue;
    }

    const issue = entry as Record<string, unknown>;
    const comment = typeof issue.comment === 'string' ? issue.comment.trim() : '';

    // A finding with nothing to say is not a finding.
    if (comment === '') {
      result.dropped.malformed += 1;
      continue;
    }

    const anchorId =
      typeof issue.line === 'number'
        ? Math.trunc(issue.line)
        : typeof issue.line === 'string' && issue.line.trim() !== '' && Number.isFinite(Number(issue.line))
          ? Math.trunc(Number(issue.line))
          : null;

    if (anchorId === null) {
      result.dropped.noAnchor += 1;
      continue;
    }

    const anchor = anchors.get(anchorId);

    if (!anchor) {
      result.dropped.unknownAnchor += 1;
      continue;
    }

    // Only a cross-check: when the model names a file, it has to be the file
    // the anchor is in. An absent file is fine, because the anchor knows.
    if (typeof issue.file === 'string' && issue.file !== '' && issue.file !== anchor.file) {
      result.dropped.fileMismatch += 1;
      continue;
    }

    result.issues.push({
      file: anchor.file,
      line: anchor.line,
      side: anchor.side,
      // An unrecognised category becomes `other`, which keeps the finding and
      // denies it the power to gate a merge. Inventing a category must not be a
      // way to reach the blocking set.
      category: ISSUE_CATEGORIES.includes(issue.category as IssueCategory)
        ? (issue.category as IssueCategory)
        : 'other',
      severity: VALID_SEVERITIES.includes(issue.severity as ReviewSeverity)
        ? (issue.severity as ReviewSeverity)
        : 'suggestion',
      comment,
    });
    result.kept += 1;
  }

  return result;
}

/** The three layers, each validated, plus one set of counts for the whole review. */
export interface ValidatedLayers extends IssueLayers {
  kept: number;
  reasons: ValidationResult['dropped'];
}

export function validateLayers(
  raw: IssueLayers,
  anchors: Map<number, Anchor>,
): ValidatedLayers {
  const security = validateIssues(raw?.security, anchors);
  const performance = validateIssues(raw?.performance, anchors);
  const codeQuality = validateIssues(raw?.code_quality, anchors);

  return {
    security: security.issues,
    performance: performance.issues,
    code_quality: codeQuality.issues,
    kept: security.kept + performance.kept + codeQuality.kept,
    reasons: {
      malformed:
        security.dropped.malformed + performance.dropped.malformed + codeQuality.dropped.malformed,
      noAnchor:
        security.dropped.noAnchor + performance.dropped.noAnchor + codeQuality.dropped.noAnchor,
      unknownAnchor:
        security.dropped.unknownAnchor +
        performance.dropped.unknownAnchor +
        codeQuality.dropped.unknownAnchor,
      fileMismatch:
        security.dropped.fileMismatch +
        performance.dropped.fileMismatch +
        codeQuality.dropped.fileMismatch,
    },
  };
}

export function droppedCount(layers: ValidatedLayers): number {
  return (
    layers.reasons.malformed +
    layers.reasons.noAnchor +
    layers.reasons.unknownAnchor +
    layers.reasons.fileMismatch
  );
}
