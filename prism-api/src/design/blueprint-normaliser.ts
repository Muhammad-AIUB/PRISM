import type { ExtractedJson } from '../ai/json-extractor';
import type { BlueprintContent } from './blueprint';

/**
 * Turns whatever the model returned into a BlueprintContent that the page can
 * render without a single `?.`.
 *
 * Same stance as issue-validator.ts takes for review findings: the model's
 * output is untrusted input. Fields arrive missing, as the wrong type, as
 * numbers where strings were asked for, or as essays. Every string is trimmed
 * and capped, every list is capped, and an entry missing the one field that
 * gives it meaning is dropped rather than shown half-empty.
 *
 * Returns null when what is left is not a design at all, so the caller can
 * fall back to the baseline instead of rendering a page of blanks.
 */
const MAX_TEXT = 600;
const MAX_SHORT = 160;
const MAX_ITEMS = 8;

function text(value: unknown, max = MAX_TEXT): string {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.replace(/\s+/g, ' ').trim();

  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value.slice(0, MAX_ITEMS * 2) : [];
}

function strings(value: unknown): string[] {
  return list(value)
    .map((entry) => text(entry))
    .filter((entry) => entry !== '')
    .slice(0, MAX_ITEMS);
}

/**
 * Objects with the given keys. `required` is the key without which the entry
 * says nothing — a failure mode with no failure, a component with no name.
 */
function records<K extends string>(
  value: unknown,
  keys: readonly K[],
  required: K,
  short: readonly K[] = [],
): Record<K, string>[] {
  const out: Record<K, string>[] = [];

  for (const entry of list(value)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }

    const source = entry as Record<string, unknown>;
    const record = {} as Record<K, string>;

    for (const key of keys) {
      record[key] = text(source[key], short.includes(key) ? MAX_SHORT : MAX_TEXT);
    }

    if (record[required] !== '') {
      out.push(record);
    }

    if (out.length === MAX_ITEMS) {
      break;
    }
  }

  return out;
}

export function normaliseBlueprint(parsed: ExtractedJson | null): BlueprintContent | null {
  if (!parsed) {
    return null;
  }

  const content: BlueprintContent = {
    title: text(parsed['title'], 120),
    summary: text(parsed['summary'], 1500),
    architecture_style: text(parsed['architecture_style'], MAX_SHORT),
    components: records(
      parsed['components'],
      ['name', 'responsibility', 'technology', 'why'] as const,
      'name',
      ['name', 'technology'] as const,
    ),
    data_stores: records(
      parsed['data_stores'],
      ['name', 'kind', 'holds', 'why'] as const,
      'name',
      ['name', 'kind'] as const,
    ),
    request_flow: strings(parsed['request_flow']),
    reliability: records(
      parsed['reliability'],
      ['pattern', 'where', 'why'] as const,
      'pattern',
      ['pattern'] as const,
    ),
    failure_modes: records(
      parsed['failure_modes'],
      ['failure', 'impact', 'mitigation', 'detection'] as const,
      'failure',
    ),
    scaling_stages: records(
      parsed['scaling_stages'],
      ['stage', 'trigger', 'changes'] as const,
      'stage',
      ['stage'] as const,
    ),
    tradeoffs: records(
      parsed['tradeoffs'],
      ['decision', 'chosen', 'alternative', 'why'] as const,
      'decision',
    ),
    security: strings(parsed['security']),
    observability: strings(parsed['observability']),
    slos: records(parsed['slos'], ['name', 'target'] as const, 'name', ['name', 'target'] as const),
    risks: strings(parsed['risks']),
    first_milestones: strings(parsed['first_milestones']),
  };

  // A design with no components and no failure modes is a paragraph, not a
  // blueprint. The baseline is more useful than that.
  if (content.components.length === 0 && content.failure_modes.length === 0) {
    return null;
  }

  return content;
}
