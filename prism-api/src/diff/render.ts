import type { HunkIndex, HunkLine } from './hunk-index';

/**
 * Two ways to show the model a diff, kept side by side on purpose.
 *
 * The question they answer differently is "when the model names a location,
 * can we tell whether it is real?" Per-file line numbers are familiar to a
 * model but ambiguous to us: an in-place edit puts the same integer on both
 * sides, and a fabricated number stays inside the named file and is
 * indistinguishable from a true one. Anchors are unfamiliar but unambiguous,
 * and because they run across files, a fabricated anchor usually resolves to
 * a file the model did not name, which is a check the other scheme cannot make.
 *
 * Which one a 70B model actually does better with is a measurement, not an
 * opinion, so both ship until the harness reports.
 */
export interface Anchor {
  file: string;
  side: 'added' | 'removed';
  /** New-side number for an added line, old-side for a removed one. */
  line: number;
  text: string;
}

export interface AnchoredRender {
  text: string;
  anchors: Map<number, Anchor>;
}

const MARKERS: Record<HunkLine['kind'], string> = {
  added: '+',
  removed: '-',
  context: ' ',
};

const gutter = (value: number | null): string => String(value ?? '.').padStart(4, ' ');

/** Scheme A: the real numbers, both sides, dot where a side has none. */
export function renderWithLineNumbers(index: HunkIndex): string {
  let out = '';

  for (const [file, hunks] of index) {
    out += `=== ${file} ===\n`;

    if (hunks.lines.length > 0) {
      out += ' old  new\n';
    }

    for (const line of hunks.lines) {
      out += `${gutter(line.oldLine)} ${gutter(line.newLine)} | ${MARKERS[line.kind]} ${line.text}\n`;
    }
  }

  return out;
}

/** Scheme B: an opaque id per changed line, numbered across the whole review. */
export function renderWithAnchors(index: HunkIndex): AnchoredRender {
  const anchors = new Map<number, Anchor>();
  let out = '';
  let next = 1;

  for (const [file, hunks] of index) {
    out += `=== ${file} ===\n`;

    for (const line of hunks.lines) {
      if (line.kind === 'context') {
        out += `      |   ${line.text}\n`;
        continue;
      }

      const id = next;
      next += 1;

      anchors.set(id, {
        file,
        side: line.kind,
        line: (line.kind === 'added' ? line.newLine : line.oldLine) as number,
        text: line.text,
      });

      out += `${`[${id}]`.padStart(4, ' ')}  | ${MARKERS[line.kind]} ${line.text}\n`;
    }
  }

  return { text: out, anchors };
}
