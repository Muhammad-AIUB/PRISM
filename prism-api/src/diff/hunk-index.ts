export interface HunkLine {
  kind: 'added' | 'removed' | 'context';
  /** Null on an added line, which consumes no old-side number. */
  oldLine: number | null;
  /** Null on a removed line, which consumes no new-side number. */
  newLine: number | null;
  text: string;
}

export interface FileHunks {
  added: Map<number, string>;
  removed: Map<number, string>;
  context: Map<number, string>;
  /**
   * The same lines in the order the diff had them. The maps answer "is this
   * line real?"; this answers "what did the change look like?". Renderers need
   * the second, and it cannot be reconstructed from the maps because a removed
   * line and the added line replacing it share an integer.
   */
  lines: HunkLine[];
}

export type HunkIndex = Map<string, FileHunks>;

const FILE_HEADER = /^diff --git a\/(\S+) b\/\S+/;
const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function buildHunkIndex(diff: string): HunkIndex {
  const index: HunkIndex = new Map();
  let current: FileHunks | undefined;
  let inHunk = false;
  let oldLine = 0;
  let newLine = 0;

  for (const line of diff.split('\n')) {
    const file = FILE_HEADER.exec(line);

    if (file) {
      current = { added: new Map(), removed: new Map(), context: new Map(), lines: [] };
      index.set(file[1] as string, current);
      inHunk = false;
      continue;
    }

    const hunk = HUNK_HEADER.exec(line);

    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      inHunk = true;
      continue;
    }

    // Everything between the file header and the first `@@` is metadata, and
    // two of those lines (`--- a/path`, `+++ b/path`) begin with the same
    // characters as a changed line. Only lines inside a hunk are content.
    if (!current || !inHunk) {
      continue;
    }

    // A removed line consumes an old-side number and no new-side one; an added
    // line the reverse. That asymmetry is the whole reason both sides are kept:
    // an in-place edit puts the same integer in both maps.
    const text = line.slice(1);

    if (line.startsWith('+')) {
      current.added.set(newLine, text);
      current.lines.push({ kind: 'added', oldLine: null, newLine, text });
      newLine += 1;
    } else if (line.startsWith('-')) {
      current.removed.set(oldLine, text);
      current.lines.push({ kind: 'removed', oldLine, newLine: null, text });
      oldLine += 1;
    } else if (line.startsWith(' ')) {
      current.context.set(newLine, text);
      current.lines.push({ kind: 'context', oldLine, newLine, text });
      oldLine += 1;
      newLine += 1;
    }
  }

  return index;
}
