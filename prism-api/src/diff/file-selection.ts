/**
 * Chooses which part of a diff the model is shown.
 *
 * This replaces a flat `diff.slice(0, DIFF_LIMIT)`. The byte cut was honest in
 * one way — it always delivered something — and dishonest in another: it could
 * stop halfway through a hunk, leaving the model to reason about a fragment
 * whose line numbers it could not reconstruct.
 *
 * Selecting whole files fixes that and introduces a worse problem if taken
 * literally: a file larger than the budget never fits at any budget, so the
 * biggest change in a large pull request becomes the one thing never reviewed.
 * Measured on real data, not imagined — see `scripts/measure-anchoring.ts`. So
 * a file that cannot be included whole is included by the hunk instead, and the
 * caller is told which files that happened to.
 */
export interface Selection {
  /** The diff text to review. Always parseable, never cut mid-hunk. */
  text: string;
  /** Paths included, whole or partial, in diff order. */
  files: string[];
  /** Paths left out, either as noise or for want of budget. */
  skipped: string[];
  /** Paths included but missing some of their hunks. */
  partial: string[];
  /** Every path the diff touched, including the noise. */
  totalFiles: number;
}

/**
 * Generated, vendored, locked or binary. None of it is code a person wrote, and
 * every character of it is a character of real code the model does not see.
 */
const NOISE =
  /(^|\/)(dist|build|vendor|node_modules|__snapshots__)\/|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|Gemfile\.lock|go\.sum)$|\.min\.(js|css)$|\.(png|jpe?g|gif|ico|svg|pdf|woff2?|ttf|eot|zip|gz|lock)$/i;

const FILE_START = /(?=^diff --git )/m;
const PATH_OF = /^diff --git a\/(\S+)/;
const HUNK_START = /(?=^@@ )/m;

/** Whole lines only, so the renderer never sees half a line of code. */
function toLineBoundary(text: string, budget: number): string {
  const cut = text.slice(0, budget);
  const lastBreak = cut.lastIndexOf('\n');

  return lastBreak === -1 ? '' : cut.slice(0, lastBreak + 1);
}

/**
 * Header plus as many whole hunks as fit. When not even one hunk fits, the
 * first hunk is truncated at a line boundary rather than dropping the file:
 * a single enormous hunk is usually a rewrite or a generated file, and
 * reviewing the first part of it beats reviewing none of it. The result still
 * parses — the index walks the lines it is given and does not trust the hunk
 * header's declared counts.
 */
function partialFile(body: string, budget: number): string | null {
  const pieces = body.split(HUNK_START);
  const header = pieces[0] ?? '';

  if (header.length >= budget) {
    return null;
  }

  let text = header;

  for (const hunk of pieces.slice(1)) {
    if (text.length + hunk.length > budget) {
      break;
    }

    text += hunk;
  }

  if (text !== header) {
    return text;
  }

  const firstHunk = pieces[1];

  if (!firstHunk) {
    return null;
  }

  const truncated = toLineBoundary(firstHunk, budget - header.length);

  return truncated === '' ? null : header + truncated;
}

export function selectForReview(diff: string, budget: number): Selection {
  const chunks = diff.split(FILE_START).filter((chunk) => chunk.startsWith('diff --git'));
  const selection: Selection = {
    text: '',
    files: [],
    skipped: [],
    partial: [],
    totalFiles: chunks.length,
  };

  for (const body of chunks) {
    const path = PATH_OF.exec(body)?.[1];

    if (!path) {
      continue;
    }

    if (NOISE.test(path)) {
      selection.skipped.push(path);
      continue;
    }

    const remaining = budget - selection.text.length;

    if (body.length <= remaining) {
      selection.text += body;
      selection.files.push(path);
      continue;
    }

    const partial = partialFile(body, remaining);

    if (partial) {
      selection.text += partial;
      selection.files.push(path);
      selection.partial.push(path);
      continue;
    }

    selection.skipped.push(path);
  }

  return selection;
}
