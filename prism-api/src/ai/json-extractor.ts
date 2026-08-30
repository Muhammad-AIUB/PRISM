/**
 * Coax a JSON object out of whatever the AI returned.
 *
 * Port of ProcessPullRequestReview::extractJson / ProcessCommitReview::extractJson.
 * The four strategies run in the same order as the PHP, and strategy 3 operates
 * on the *reassigned* content from strategy 2 — that sequencing is load-bearing,
 * not incidental. Changing it changes which malformed responses parse.
 *
 * PHP checks `is_array($d)`, which is true for JSON objects and JSON arrays but
 * false for scalars and null. `typeof x === 'object' && x !== null` is the
 * equivalent test in JS.
 */
export type ExtractedJson = Record<string, unknown>;

function decode(candidate: string): ExtractedJson | null {
  try {
    const parsed: unknown = JSON.parse(candidate);

    return typeof parsed === 'object' && parsed !== null ? (parsed as ExtractedJson) : null;
  } catch {
    return null;
  }
}

export function extractJson(content: string): ExtractedJson | null {
  let working = content.trim();

  if (working === '') {
    return null;
  }

  // Strategy 1 — raw parse.
  const raw = decode(working);
  if (raw) {
    return raw;
  }

  // Strategy 2 — fenced code block. On a failed decode the PHP reassigns
  // $content to the captured group, so the later strategies see the fence
  // contents rather than the original string.
  const fenced = /```(?:json)?\s*(\{[\s\S]*\})\s*```/.exec(working);
  if (fenced?.[1]) {
    const fromFence = decode(fenced[1]);
    if (fromFence) {
      return fromFence;
    }
    working = fenced[1];
  }

  // Strategy 3 — drop trailing commas before a closing brace or bracket.
  const clean = working.replace(/,(\s*[}\]])/g, '$1');
  const decommaed = decode(clean);
  if (decommaed) {
    return decommaed;
  }

  // Strategy 4 — first balanced-looking object anywhere in the text.
  const balanced = /\{[\s\S]*\}/.exec(clean);
  if (balanced?.[0]) {
    const fromBalanced = decode(balanced[0]);
    if (fromBalanced) {
      return fromBalanced;
    }
  }

  return null;
}

/**
 * Port of clampScore(). Laravel returns null for anything non-numeric and
 * otherwise squeezes into 0–100 — the prompt states the same range, but models
 * still return 8.5 out of 10 often enough that this matters.
 */
export function clampScore(value: unknown): number | null {
  if (typeof value === 'boolean' || value === null || value === undefined) {
    return null;
  }

  // Number('') and Number('   ') are 0, but PHP's is_numeric() rejects both,
  // so an empty score must stay null rather than becoming a hard zero.
  const asString = typeof value === 'number' ? null : String(value).trim();

  if (asString === '') {
    return null;
  }

  const numeric = typeof value === 'number' ? value : Number(asString);

  if (!Number.isFinite(numeric)) {
    return null;
  }

  // PHP casts to int (truncating toward zero) *before* clamping.
  return Math.max(0, Math.min(100, Math.trunc(numeric)));
}
