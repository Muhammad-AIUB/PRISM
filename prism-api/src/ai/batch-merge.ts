import type { ReviewIssue } from '../database/entities/review.entity';
import { orderFindings } from './verdict';

/**
 * What one batch's model reply became after validation against that batch's own
 * anchors. This is the unit that is checkpointed, so it holds only plain JSON.
 */
export interface BatchResult {
  /** The batch's position in the review, 0-based. */
  index: number;
  /** Label stored in ai_model_used, e.g. "groq/openai/gpt-oss-120b". */
  model: string;
  security: ReviewIssue[];
  performance: ReviewIssue[];
  code_quality: ReviewIssue[];
  /** Findings the validator refused in this batch. */
  dropped: number;
  /** The model's own 0-100 score for this batch, before reconciliation. */
  score: number | null;
  summary: string | null;
}

export interface MergedReview {
  layers: { security: ReviewIssue[]; performance: ReviewIssue[]; code_quality: ReviewIssue[] };
  /** Findings shown. */
  kept: number;
  /** Validator drops summed over every batch. */
  dropped: number;
  /** Findings beyond the budget, not shown. */
  trimmed: number;
  /** The lowest batch score, or null when no batch gave one. Reconciled later by `scoreFor`. */
  score: number | null;
  summary: string | null;
  /** Distinct models that answered, in the order they first did. */
  models: string[];
  /** The model of the last batch, which the fixes pass reuses. */
  lastModel: string;
}

const LAYERS = ['security', 'performance', 'code_quality'] as const;
const PART_SUMMARY_CHARS = 400;

/**
 * Two reports of the same category on the same changed line are one finding,
 * whichever batch or layer raised them. Layers are walked in priority order, so
 * a security report wins over a quality one on the same line.
 */
const keyOf = (issue: ReviewIssue): string =>
  `${issue.file ?? ''}|${issue.side ?? ''}|${issue.line ?? ''}|${issue.category ?? ''}`;

const clip = (text: string): string =>
  text.length > PART_SUMMARY_CHARS ? `${text.slice(0, PART_SUMMARY_CHARS - 1)}…` : text;

/**
 * One review out of several batch replies. Already-validated findings are
 * de-duplicated, ordered worst first by the same `orderFindings` the pages use,
 * and cut to `maxFindings` so a large change cannot produce a comment nobody
 * scrolls. Nothing here invents text that a recogniser must know: the summary
 * is the model's own words, labelled by part.
 */
export function mergeBatchResults(results: readonly BatchResult[], maxFindings: number): MergedReview {
  const ordered = [...results].sort((a, b) => a.index - b.index);
  const seen = new Set<string>();
  const tagged: { issue: ReviewIssue; layer: (typeof LAYERS)[number] }[] = [];

  for (const layer of LAYERS) {
    for (const result of ordered) {
      for (const issue of result[layer]) {
        const key = keyOf(issue);

        if (!seen.has(key)) {
          seen.add(key);
          tagged.push({ issue, layer });
        }
      }
    }
  }

  const position = new Map(orderFindings(tagged.map((t) => t.issue)).map((issue, i) => [issue, i]));
  const shown = [...tagged]
    .sort((a, b) => (position.get(a.issue) ?? 0) - (position.get(b.issue) ?? 0))
    .slice(0, maxFindings);
  const layers: MergedReview['layers'] = { security: [], performance: [], code_quality: [] };

  for (const { issue, layer } of shown) {
    layers[layer].push(issue);
  }

  const trimmed = tagged.length - shown.length;
  const scores = ordered.map((r) => r.score).filter((s): s is number => s !== null);
  const parts = ordered
    .filter((r) => r.summary !== null && r.summary.trim() !== '')
    .map((r) => `Part ${r.index + 1}: ${clip((r.summary as string).trim())}`);
  let summary: string | null =
    ordered.length === 1 ? (ordered[0]?.summary ?? null) : parts.length > 0 ? parts.join('\n') : null;

  if (trimmed > 0) {
    const note = `${trimmed} lower-priority ${trimmed === 1 ? 'finding was' : 'findings were'} not shown.`;

    summary = summary === null ? note : `${summary}\n${note}`;
  }

  return {
    layers,
    kept: shown.length,
    dropped: ordered.reduce((sum, r) => sum + r.dropped, 0),
    trimmed,
    score: scores.length > 0 ? Math.min(...scores) : null,
    summary,
    models: [...new Set(ordered.map((r) => r.model))],
    lastModel: ordered[ordered.length - 1]?.model ?? '',
  };
}
