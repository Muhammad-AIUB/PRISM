/**
 * File paths as git writes them in a unified diff.
 *
 * Every diff parser in this directory needs them, and every one of them used
 * to read the header with `a\/(\S+) b\/\S+`. That pattern cannot match a path
 * containing a space, and the failure was not a skipped file: the parsers
 * carried on as if still inside the previous file, so the spaced file's
 * `--- a/…` and `+++ b/…` lines were counted as a removed and an added line and
 * its code was filed under the wrong name - and shown to the model that way.
 *
 * Git's own rules, which these follow:
 *   - `diff --git a/X b/Y`, unquoted, when the path is plain ASCII. A path with
 *     spaces is left unquoted here, which makes " b/" inside a name ambiguous.
 *   - C-style quoting, `"a/caf\303\251.ts"`, when a path has non-ASCII or
 *     control characters (core.quotePath). Escapes are octal UTF-8 bytes.
 *   - `--- a/X` / `+++ b/X` repeat the paths unambiguously, with a trailing
 *     tab when the path contains a space, and /dev/null for an added or
 *     deleted side. When present they are the authoritative source.
 */
export const GIT_HEADER = 'diff --git ';

export interface HeaderPaths {
  oldPath: string;
  newPath: string;
}

const SIMPLE_ESCAPES: Record<string, number> = {
  n: 10,
  t: 9,
  r: 13,
  b: 8,
  f: 12,
  v: 11,
  a: 7,
  '"': 34,
  '\\': 92,
};

/** Decodes git's C-style quoting; returns anything unquoted unchanged. */
export function unquotePath(raw: string): string {
  if (!raw.startsWith('"') || !raw.endsWith('"') || raw.length < 2) {
    return raw;
  }

  const bytes: number[] = [];
  const body = raw.slice(1, -1);

  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i] as string;

    if (ch !== '\\') {
      bytes.push(...Buffer.from(ch, 'utf8'));
      continue;
    }

    const next = body[i + 1] ?? '';
    const octal = /^[0-7]{3}/.exec(body.slice(i + 1));

    if (octal) {
      bytes.push(parseInt(octal[0], 8));
      i += 3;
    } else if (next in SIMPLE_ESCAPES) {
      bytes.push(SIMPLE_ESCAPES[next] as number);
      i += 1;
    } else {
      bytes.push(...Buffer.from(next, 'utf8'));
      i += 1;
    }
  }

  return Buffer.from(bytes).toString('utf8');
}

/**
 * The path from the text after `--- ` or `+++ `, without its `a/` or `b/`
 * prefix. Null for /dev/null, the side of an added or deleted file that does
 * not exist.
 */
export function markerPath(rest: string, prefix: 'a/' | 'b/'): string | null {
  const trimmed = rest.replace(/\t.*$/, '').trimEnd();

  if (trimmed === '/dev/null') {
    return null;
  }

  const path = unquotePath(trimmed);

  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/**
 * Both paths from a `diff --git` line, or null if the line is not one.
 *
 * A best reading only: for an unquoted rename whose names contain " b/" the
 * header is genuinely ambiguous, which is why callers that see the file's
 * `---`/`+++` lines should prefer those.
 */
export function parseGitHeader(line: string): HeaderPaths | null {
  if (!line.startsWith(GIT_HEADER)) {
    return null;
  }

  const rest = line.slice(GIT_HEADER.length);

  if (rest.startsWith('"')) {
    const first = /^"(?:[^"\\]|\\.)*"/.exec(rest)?.[0] ?? '';
    const second = rest.slice(first.length).trim();
    const oldPath = markerPath(first, 'a/') ?? '';
    const newPath = markerPath(second, 'b/') ?? oldPath;

    return { oldPath: oldPath || newPath, newPath };
  }

  // The common case, an unchanged path, makes the line symmetric:
  // "a/X b/X", however many spaces X contains.
  const half = (rest.length - 1) / 2;

  if (
    Number.isInteger(half) &&
    rest.startsWith('a/') &&
    rest.slice(half + 1).startsWith('b/') &&
    rest.slice(2, half) === rest.slice(half + 3)
  ) {
    const path = rest.slice(2, half);

    return { oldPath: path, newPath: path };
  }

  // A rename, possibly with only the new side quoted.
  const split = /^a\/(.+?) "?b\/(.+?)"?$/.exec(rest);

  if (split) {
    const oldPath = split[1] as string;
    // Everything after "a/<old> " is the new side, quoted or not.
    const newSide = rest.slice(2 + oldPath.length + 1);

    return { oldPath, newPath: markerPath(newSide, 'b/') ?? (split[2] as string) };
  }

  return { oldPath: rest, newPath: rest };
}
