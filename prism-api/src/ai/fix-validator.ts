import type { HunkIndex } from '../diff/hunk-index';
import type { SuggestedFix } from '../database/entities/review.entity';
import { toLine } from './fixes.service';

/**
 * Checks the suggested fixes the same way findings are checked.
 *
 * The first AI pass is anchor-validated, so a finding either points at a line
 * we rendered or it is dropped. The second pass could not use that scheme: fixes
 * quote real code, so they are shown the raw selected diff rather than the
 * anchored rendering, and they name a file and a line of their own. Those went
 * straight to the screen — `parts.tsx` renders "Line {fix.line}" in a badge.
 *
 * So a review could show three carefully verified findings and, one tab over, a
 * fix pointing at a line that does not exist. The weakest surface sets the
 * trust level for all of them.
 *
 * What makes fixes checkable is `problematic_code`: if the code the model quoted
 * really is at the line it claims, the claim holds. That is a stronger check
 * than anchors provide, not a weaker one, so it is worth the tolerance window.
 */
const TOLERANCE = 3;

export interface FixValidationResult {
  fixes: SuggestedFix[];
  dropped: number;
}

/** Trim, collapse runs of whitespace. Indentation differences are not lies. */
const normalise = (text: string): string => text.trim().replace(/\s+/g, ' ');

/** A multi-line quote is matched on its first line with content. */
function firstMeaningfulLine(code: string): string {
  for (const line of code.split('\n')) {
    if (normalise(line) !== '') {
      return normalise(line);
    }
  }

  return '';
}

/** The nearest line within tolerance whose text matches, or null. */
function resolveLine(
  index: HunkIndex,
  file: string,
  claimed: number | null,
  code: string,
): number | null {
  const hunks = index.get(file);

  if (!hunks) {
    return null;
  }

  const needle = firstMeaningfulLine(code);

  if (needle === '') {
    return null;
  }

  const candidates: number[] = [];

  for (const [line, text] of hunks.added) {
    if (normalise(text) === needle) {
      candidates.push(line);
    }
  }

  for (const [line, text] of hunks.removed) {
    if (normalise(text) === needle) {
      candidates.push(line);
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  if (claimed === null) {
    return candidates[0] as number;
  }

  // Nearest wins, and only inside the window — a match twenty lines away is a
  // different occurrence of the same code, not the one the model meant.
  const nearest = candidates.reduce((best, line) =>
    Math.abs(line - claimed) < Math.abs(best - claimed) ? line : best,
  );

  return Math.abs(nearest - claimed) <= TOLERANCE ? nearest : null;
}

export function validateFixes(raw: unknown, index: HunkIndex): FixValidationResult {
  const result: FixValidationResult = { fixes: [], dropped: 0 };

  if (!Array.isArray(raw)) {
    return result;
  }

  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      result.dropped += 1;
      continue;
    }

    const fix = entry as SuggestedFix;
    const file = String(fix.file ?? '');

    if (!index.has(file)) {
      result.dropped += 1;
      continue;
    }

    const quoted = String(fix.problematic_code ?? '');

    // No quote means nothing to check against. Keep the fix — its suggested code
    // may still be useful — but show it at file level rather than asserting a
    // line we never confirmed.
    if (normalise(quoted) === '') {
      result.fixes.push({ ...fix, line: null });
      continue;
    }

    const line = resolveLine(index, file, toLine(fix.line), quoted);

    if (line === null) {
      result.dropped += 1;
      continue;
    }

    result.fixes.push({ ...fix, line });
  }

  return result;
}
