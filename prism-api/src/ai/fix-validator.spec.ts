import { buildHunkIndex } from '../diff/hunk-index';
import { validateFixes } from './fix-validator';

/**
 * The last place PRism still showed a number nobody had checked.
 *
 * Suggested fixes come from a second AI pass and carry their own `file` and
 * `line`, rendered prominently in the UI (`parts.tsx` "Line {fix.line}"). The
 * first pass is now anchor-validated; this one was not, so a review could show
 * three carefully verified findings and, one tab over, a fix pointing at a line
 * that does not exist.
 *
 * Fixes cannot use anchors: they quote real code, so they are shown the raw
 * selected diff rather than the anchored rendering. But they carry
 * `problematic_code`, which is checkable — if the quoted code really is at the
 * claimed line, the claim holds. That is a stronger check than the first pass
 * can make, not a weaker one.
 */
const DIFF =
  'diff --git a/src/auth.ts b/src/auth.ts\n' +
  '@@ -10,4 +10,4 @@\n' +
  ' const user = load(req)\n' +
  '+const token = req.query.token\n' +
  '+if (token) return impersonate(token)\n' +
  ' return done\n';

const index = buildHunkIndex(DIFF);

const fix = (over: Record<string, unknown>) => ({
  layer: 'security',
  file: 'src/auth.ts',
  line: 11,
  original_issue: 'x',
  problematic_code: 'const token = req.query.token',
  suggested_code: 'const token = signedToken(req)',
  explanation: 'why',
  ...over,
});

describe('validateFixes', () => {
  it('keeps a fix whose quoted code really is at the claimed line', () => {
    const result = validateFixes([fix({})], index);

    expect(result.fixes).toHaveLength(1);
    expect(result.fixes[0]?.line).toBe(11);
  });

  it('snaps to the line the code is actually on, within tolerance', () => {
    const result = validateFixes([fix({ line: 13 })], index);

    expect(result.fixes[0]?.line).toBe(11);
  });

  it('ignores whitespace differences when matching the quoted code', () => {
    const result = validateFixes(
      [fix({ problematic_code: '  const   token = req.query.token  ' })],
      index,
    );

    expect(result.fixes[0]?.line).toBe(11);
  });

  it('matches a multi-line quote on its first meaningful line', () => {
    const result = validateFixes(
      [fix({ problematic_code: 'const token = req.query.token\nif (token) return impersonate(token)' })],
      index,
    );

    expect(result.fixes[0]?.line).toBe(11);
  });

  it('drops a fix whose file is not in the diff', () => {
    const result = validateFixes([fix({ file: 'src/nowhere.ts' })], index);

    expect(result.fixes).toEqual([]);
    expect(result.dropped).toBe(1);
  });

  it('drops a fix whose quoted code appears nowhere near the claimed line', () => {
    const result = validateFixes([fix({ problematic_code: 'totally invented code' })], index);

    expect(result.fixes).toEqual([]);
    expect(result.dropped).toBe(1);
  });

  it('keeps a fix with no quoted code but nulls its line rather than guessing', () => {
    const result = validateFixes([fix({ problematic_code: '' })], index);

    expect(result.fixes).toHaveLength(1);
    expect(result.fixes[0]?.line).toBeNull();
  });

  it('handles an empty list and a null input', () => {
    expect(validateFixes([], index).fixes).toEqual([]);
    expect(validateFixes(null, index).fixes).toEqual([]);
  });
});
