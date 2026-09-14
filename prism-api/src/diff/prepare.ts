import { buildHunkIndex, type HunkIndex } from './hunk-index';
import { selectForReview, type Selection } from './file-selection';
import { renderWithAnchors, type Anchor } from './render';
import { detectLanguages } from './language-detector';

/**
 * Everything both review runners do to a diff before they ask the model about it.
 *
 * The two runners keep their own persistence, comment text and notifications,
 * which genuinely differ. This stage does not differ, and putting it in one
 * place means a parser bug is fixed once rather than in two files that drift.
 */
export interface PreparedDiff {
  /** The rendered diff to put in the user message. */
  body: string;
  /** Anchor id to real location, for validating whatever the model reports. */
  anchors: Map<number, Anchor>;
  /** From the WHOLE diff, not the reviewed part. */
  languages: string[];
  /** One sentence for the reader, or null when nothing was left out. */
  coverage: string | null;
  selection: Selection;
  /**
   * The parsed index of what was sent. The second AI pass sees raw code rather
   * than anchors, so its fixes are checked against this instead.
   */
  index: HunkIndex;
}

/**
 * The frozen system prompt describes a `line` field and cannot be changed
 * without rewriting 26 byte-exact fixtures. It does not have to change: the
 * model still returns an integer there. This tells it which integer, and lives
 * in the user message, which is not fixture-frozen.
 */
const ANCHOR_INSTRUCTIONS =
  'Every changed line below is prefixed with an anchor id in square brackets, like [7].\n' +
  'For each issue you report, put that anchor id in the "line" field. Report only lines that have an anchor.\n' +
  'Lines with no anchor are unchanged context, shown so you can understand the change.\n\n';

function coverageSentence(selection: Selection): string | null {
  const left = selection.skipped.length;
  const partial = selection.partial.length;

  if (left === 0 && partial === 0) {
    return null;
  }

  const reviewed = selection.files.length;
  const parts = [`Reviewed ${reviewed} of ${selection.totalFiles} changed files.`];

  if (partial > 0) {
    parts.push(`${partial} of them only in part.`);
  }

  return parts.join(' ');
}

export function prepareDiff(diffBody: string, budget: number): PreparedDiff {
  const selection = selectForReview(diffBody, budget);
  const index = buildHunkIndex(selection.text);
  const rendered = renderWithAnchors(index);

  return {
    body: rendered.text === '' ? '' : ANCHOR_INSTRUCTIONS + rendered.text,
    anchors: rendered.anchors,
    index,
    // Truncation decides what the model reads. It must not also decide which
    // language rules the prompt carries, which is what it used to do.
    languages: detectLanguages(diffBody),
    coverage: coverageSentence(selection),
    selection,
  };
}
