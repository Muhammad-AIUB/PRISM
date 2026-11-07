import { parseGitHeader } from './git-paths';
import { NOISE, type Selection } from './file-selection';

/**
 * Splits everything a person would have to read into batches, one model call each.
 *
 * Pure. The old `selectForReview` answered "what fits one call?" and dropped the
 * rest; this answers "how many calls does the whole change need?" and only
 * reports a file as not reviewed when the call cap is hit.
 */
export interface BatchConfig {
  /** Characters of diff per model call. */
  batchChars: number;
  /** Calls per review; anything past it is reported as not reviewed. */
  maxBatches: number;
}

/** Higher means review sooner. Only consulted when the change does not fit the cap. */
export type RiskRank = (path: string) => number;

export interface BatchPiece {
  path: string;
  text: string;
}

export interface ReviewBatch {
  /** 0-based position among the kept batches. */
  index: number;
  text: string;
  /** Paths with at least one piece in this batch, in order. */
  files: string[];
  pieces: BatchPiece[];
}

export interface PackedReview {
  /** Always at least one. A diff with nothing to review yields one empty batch, as it always did. */
  batches: ReviewBatch[];
  /** Reviewable paths in diff order. */
  order: string[];
  /** Pieces each reviewable path was cut into, kept or not. */
  pieceTotals: Map<string, number>;
  noise: string[];
  /** Reviewable files that cannot be shown at all (a header larger than a batch). */
  unfit: string[];
  totalFiles: number;
}

const FILE_START = /(?=^diff --git )/m;
const HUNK_START = /(?=^@@ )/m;
const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Smallest slice of a batch worth cutting a file for. */
const MIN_ROOM = 200;
/** Room kept for the `@@ -a,b +c,d @@` line written on every cut piece. */
const HEADER_RESERVE = 48;
const CUT_MARK = ' [line cut]';

/**
 * Cuts one hunk that is larger than a batch at line boundaries. Every piece
 * starts with its own `@@` header carrying the real starting line numbers, so
 * the hunk index and the anchors resolve to true lines. A single line longer
 * than the room is cut and marked: it is the only content this ever drops.
 */
export function cutHunk(hunk: string, room: number): string[] {
  const lines = hunk.split('\n');

  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  const declared = HUNK_HEADER.exec(lines[0] ?? '');
  let oldLine = declared ? Number(declared[1]) : 1;
  let newLine = declared ? Number(declared[2]) : 1;
  const limit = Math.max(room - HEADER_RESERVE, MIN_ROOM - HEADER_RESERVE);
  const pieces: string[] = [];
  let body = '';
  let startOld = oldLine;
  let startNew = newLine;
  let oldCount = 0;
  let newCount = 0;

  const flush = (): void => {
    if (body !== '') {
      pieces.push(`@@ -${startOld},${oldCount} +${startNew},${newCount} @@\n${body}`);
    }

    body = '';
    startOld = oldLine;
    startNew = newLine;
    oldCount = 0;
    newCount = 0;
  };

  for (const raw of lines.slice(1)) {
    const line = raw.length + 1 > limit ? raw.slice(0, limit - CUT_MARK.length - 1) + CUT_MARK : raw;

    if (body !== '' && body.length + line.length + 1 > limit) {
      flush();
    }

    body += `${line}\n`;

    if (raw.startsWith('+')) {
      newLine += 1;
      newCount += 1;
    } else if (raw.startsWith('-')) {
      oldLine += 1;
      oldCount += 1;
    } else if (raw.startsWith(' ')) {
      oldLine += 1;
      newLine += 1;
      oldCount += 1;
      newCount += 1;
    }
  }

  flush();

  return pieces;
}

/**
 * One file as pieces that each fit `budget`: the whole file when it fits,
 * otherwise header plus whole hunks, and a hunk bigger than the room is cut at
 * line boundaries. Null when not even the header leaves room.
 */
export function splitFile(body: string, budget: number): string[] | null {
  if (body.length <= budget) {
    return [body];
  }

  const parts = body.split(HUNK_START);
  const header = parts[0] ?? '';
  const room = budget - header.length;

  if (room < MIN_ROOM) {
    return null;
  }

  const pieces: string[] = [];
  let current = header;

  const flush = (): void => {
    if (current !== header) {
      pieces.push(current);
    }

    current = header;
  };

  for (const hunk of parts.slice(1)) {
    if (hunk.length <= room) {
      if (current.length + hunk.length > budget) {
        flush();
      }

      current += hunk;
      continue;
    }

    flush();

    for (const cut of cutHunk(hunk, room)) {
      pieces.push(header + cut);
    }
  }

  flush();

  return pieces.length === 0 ? null : pieces;
}

interface FileEntry {
  path: string;
  pieces: string[];
}

/** Greedy and sequential: fill the open batch, otherwise open a new one. */
function place(entries: readonly FileEntry[], budget: number): BatchPiece[][] {
  const batches: BatchPiece[][] = [];
  let used = 0;

  for (const entry of entries) {
    for (const text of entry.pieces) {
      let open = batches[batches.length - 1];

      if (!open || used + text.length > budget) {
        open = [];
        batches.push(open);
        used = 0;
      }

      open.push({ path: entry.path, text });
      used += text.length;
    }
  }

  return batches;
}

export function packForReview(diff: string, config: BatchConfig, rank?: RiskRank): PackedReview {
  const chunks = diff.split(FILE_START).filter((chunk) => chunk.startsWith('diff --git'));
  const entries: FileEntry[] = [];
  const noise: string[] = [];
  const unfit: string[] = [];

  for (const body of chunks) {
    const path = parseGitHeader(body.split('\n', 1)[0] ?? '')?.oldPath;

    if (!path) {
      continue;
    }

    if (NOISE.test(path)) {
      noise.push(path);
      continue;
    }

    const pieces = splitFile(body, config.batchChars);

    if (pieces === null) {
      unfit.push(path);
    } else {
      entries.push({ path, pieces });
    }
  }

  let placed = place(entries, config.batchChars);

  // Over the cap, the files left out should be the least risky, not the last.
  if (placed.length > config.maxBatches && rank) {
    const byRisk = entries
      .map((entry, position) => ({ entry, position }))
      .sort((a, b) => rank(b.entry.path) - rank(a.entry.path) || a.position - b.position)
      .map(({ entry }) => entry);

    placed = place(byRisk, config.batchChars);
  }

  const batches = placed.slice(0, config.maxBatches).map(
    (pieces, index): ReviewBatch => ({
      index,
      text: pieces.map((piece) => piece.text).join(''),
      files: [...new Set(pieces.map((piece) => piece.path))],
      pieces,
    }),
  );

  if (batches.length === 0) {
    batches.push({ index: 0, text: '', files: [], pieces: [] });
  }

  return {
    batches,
    order: entries.map((entry) => entry.path),
    pieceTotals: new Map(entries.map((entry) => [entry.path, entry.pieces.length])),
    noise,
    unfit,
    totalFiles: chunks.length,
  };
}

/**
 * What the model was actually shown, in the shape the rest of the pipeline
 * already understands (`coverageRatio`, `coverageSentence`). Only batches in
 * `completed` count, so a batch that failed or was never run lowers coverage
 * exactly as a file dropped by the old byte budget did. A file with some of
 * its pieces reviewed counts as partial, which is worth half.
 */
export function selectionFor(packed: PackedReview, completed: ReadonlySet<number>): Selection {
  const seen = new Map<string, number>();
  let text = '';

  for (const batch of packed.batches) {
    if (!completed.has(batch.index)) {
      continue;
    }

    text += batch.text;

    for (const piece of batch.pieces) {
      seen.set(piece.path, (seen.get(piece.path) ?? 0) + 1);
    }
  }

  const files: string[] = [];
  const partial: string[] = [];
  const skipped: string[] = [...packed.noise, ...packed.unfit];

  for (const path of packed.order) {
    const got = seen.get(path) ?? 0;

    if (got === 0) {
      skipped.push(path);
    } else {
      files.push(path);

      if (got < (packed.pieceTotals.get(path) ?? got)) {
        partial.push(path);
      }
    }
  }

  return { text, files, skipped, partial, noise: [...packed.noise], totalFiles: packed.totalFiles };
}
