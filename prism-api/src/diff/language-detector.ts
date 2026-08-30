/**
 * Port of detectLanguages(), duplicated verbatim in both Laravel jobs.
 *
 * Feeds two things: the `detected_languages` badges in the UI and the
 * language-specific rule block appended to the AI system prompt. Both are
 * user-visible, so the extension map and the ordering must not drift.
 */
const EXTENSION_LANGUAGES: Record<string, string> = {
  php: 'PHP',
  js: 'JavaScript',
  jsx: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  ts: 'TypeScript',
  tsx: 'TypeScript',
  py: 'Python',
  go: 'Go',
  rb: 'Ruby',
  java: 'Java',
};

/**
 * PHP's pathinfo(..., PATHINFO_EXTENSION) returns the substring after the last
 * dot in the *basename*, and nothing at all when the basename has no dot.
 * "src/a.b/Makefile" therefore has no extension, not "b/Makefile".
 */
function extensionOf(path: string): string {
  const basename = path.slice(path.lastIndexOf('/') + 1);
  const dot = basename.lastIndexOf('.');

  return dot === -1 ? '' : basename.slice(dot + 1).toLowerCase();
}

export function detectLanguages(diff: string): string[] {
  const pattern = /^diff --git a\/(\S+) b\/\S+/gm;
  const languages: string[] = [];

  for (const match of diff.matchAll(pattern)) {
    const language = EXTENSION_LANGUAGES[extensionOf(match[1] ?? '')];

    // array_unique keeps the first occurrence, so first-seen order wins.
    if (language !== undefined && !languages.includes(language)) {
      languages.push(language);
    }
  }

  return languages;
}
