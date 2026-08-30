import { clampScore, extractJson } from './json-extractor';

/**
 * These four strategies exist because the free models genuinely emit all of
 * these shapes (commit 9727b21 added the lenient parser after parse failures
 * in production). Each strategy gets a case that ONLY it can rescue.
 */
describe('extractJson', () => {
  it('parses clean JSON (strategy 1)', () => {
    expect(extractJson('{"overall_score": 90}')).toEqual({ overall_score: 90 });
  });

  it('parses JSON wrapped in a ```json fence (strategy 2)', () => {
    const content = 'Here you go:\n```json\n{"summary": "ok"}\n```\nHope that helps.';

    expect(extractJson(content)).toEqual({ summary: 'ok' });
  });

  it('parses a bare ``` fence with no language tag', () => {
    expect(extractJson('```\n{"summary": "ok"}\n```')).toEqual({ summary: 'ok' });
  });

  it('strips trailing commas (strategy 3)', () => {
    expect(extractJson('{"a": 1, "b": [1, 2,],}')).toEqual({ a: 1, b: [1, 2] });
  });

  it('recovers the first balanced object from surrounding prose (strategy 4)', () => {
    const content = 'Sure! Here is the review: {"overall_score": 70} — let me know.';

    expect(extractJson(content)).toEqual({ overall_score: 70 });
  });

  it('applies the trailing-comma strip to the fence contents when the fence itself failed', () => {
    // Only reachable because strategy 2 reassigns the working string before
    // strategy 3 runs — the PHP does the same, and the ordering is load-bearing.
    expect(extractJson('```json\n{"a": 1,}\n```')).toEqual({ a: 1 });
  });

  it('accepts a top-level array, matching PHP is_array()', () => {
    expect(extractJson('[1, 2]')).toEqual([1, 2]);
  });

  it.each([
    ['empty string', ''],
    ['whitespace only', '   \n  '],
    ['prose with no object', 'I could not review this diff.'],
    ['a bare scalar', '42'],
    ['a JSON string', '"just a string"'],
    ['null', 'null'],
    ['an unbalanced object', '{"a": '],
  ])('returns null for %s', (_label, content) => {
    expect(extractJson(content)).toBeNull();
  });
});

describe('clampScore', () => {
  it.each([
    [90, 90],
    [0, 0],
    [100, 100],
    [150, 100],
    [-20, 0],
    ['85', 85],
    [8.7, 8],
  ])('maps %p to %p', (input, expected) => {
    expect(clampScore(input)).toBe(expected);
  });

  it.each([[null], [undefined], ['high'], [''], [true], [Number.NaN]])(
    'returns null for %p',
    (input) => {
      expect(clampScore(input)).toBeNull();
    },
  );
});
