import type { ReviewIssue } from '../database/entities/review.entity';
import { mergeBatchResults, type BatchResult } from './batch-merge';

const issue = (over: Partial<ReviewIssue>): ReviewIssue => ({
  file: 'a.ts',
  line: 1,
  side: 'added',
  category: 'other',
  severity: 'suggestion',
  comment: 'c',
  ...over,
});

const result = (index: number, over: Partial<BatchResult> = {}): BatchResult => ({
  index,
  model: 'groq/m',
  security: [],
  performance: [],
  code_quality: [],
  dropped: 0,
  score: 80,
  summary: `s${index}`,
  ...over,
});

describe('mergeBatchResults', () => {
  it('returns a single batch as it was, summary untouched', () => {
    const merged = mergeBatchResults([result(0, { code_quality: [issue({})], summary: 'Looks fine.' })], 40);

    expect(merged.summary).toBe('Looks fine.');
    expect(merged.layers.code_quality).toHaveLength(1);
    expect(merged.trimmed).toBe(0);
  });

  it('drops a repeat of the same category on the same line, keeping the higher-priority layer', () => {
    const merged = mergeBatchResults(
      [
        result(0, { code_quality: [issue({ category: 'error_swallowed' })] }),
        result(1, { security: [issue({ category: 'error_swallowed' })] }),
      ],
      40,
    );

    expect(merged.layers.security).toHaveLength(1);
    expect(merged.layers.code_quality).toHaveLength(0);
  });

  it('keeps different categories or lines on the same file', () => {
    const merged = mergeBatchResults(
      [result(0, { code_quality: [issue({ line: 1 }), issue({ line: 2 }), issue({ line: 1, category: 'no_timeout' })] })],
      40,
    );

    expect(merged.kept).toBe(3);
  });

  it('keeps blocking findings first when the budget cuts the list', () => {
    const merged = mergeBatchResults(
      [
        result(0, {
          code_quality: [
            issue({ line: 1, severity: 'critical' }),
            issue({ line: 2, severity: 'critical' }),
            issue({ line: 3, severity: 'suggestion', category: 'auth_weakened' }),
          ],
        }),
      ],
      2,
    );

    expect(merged.layers.code_quality.map((i) => i.line)).toEqual([3, 1]);
    expect(merged.trimmed).toBe(1);
    expect(merged.summary).toBe('s0\n1 lower-priority finding was not shown.');
  });

  it('labels each part of a multi-batch summary and clips a long one', () => {
    const merged = mergeBatchResults([result(1, { summary: 'y'.repeat(900) }), result(0, { summary: 'first' })], 40);

    expect(merged.summary?.startsWith('Part 1: first\nPart 2: yyy')).toBe(true);
    expect(merged.summary?.length).toBeLessThan(500);
  });

  it('uses the lowest batch score, or null when none was given', () => {
    expect(mergeBatchResults([result(0, { score: 90 }), result(1, { score: 55 })], 40).score).toBe(55);
    expect(mergeBatchResults([result(0, { score: null })], 40).score).toBeNull();
  });

  it('sums validator drops and lists models once, remembering the last', () => {
    const merged = mergeBatchResults(
      [result(0, { dropped: 2, model: 'groq/a' }), result(1, { dropped: 1, model: 'groq/b' }), result(2, { model: 'groq/b' })],
      40,
    );

    expect(merged.dropped).toBe(3);
    expect(merged.models).toEqual(['groq/a', 'groq/b']);
    expect(merged.lastModel).toBe('groq/b');
  });
});
