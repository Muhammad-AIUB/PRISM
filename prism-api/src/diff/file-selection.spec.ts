import { coverageRatio, selectForReview } from './file-selection';

/**
 * What the model is allowed to see, and what it is told it did not see.
 *
 * Replacing a byte cut with whole-file selection is a coverage regression on its
 * own: a byte cut always delivers N characters of something, whereas whole-file
 * selection delivers nothing when no file fits. Measured on real PRs, the
 * failure is not hypothetical — microsoft/TypeScript#64245 selects 3 of 6 files
 * at 8,000 characters and still 3 of 6 at 40,000, because one file never fits
 * at any budget. So selection has to be able to include part of a file.
 */
const file = (path: string, hunks: string[]): string =>
  `diff --git a/${path} b/${path}\nindex 1111111..2222222 100644\n--- a/${path}\n+++ b/${path}\n` +
  hunks.join('');

const hunk = (start: number, lines: string[]): string =>
  `@@ -${start},${lines.length} +${start},${lines.length} @@\n${lines.map((l) => `${l}\n`).join('')}`;

describe('selectForReview', () => {
  it('includes whole files in diff order until the budget is spent', () => {
    const diff =
      file('a.ts', [hunk(1, ['+const a = 1'])]) +
      file('b.ts', [hunk(1, ['+const b = 2'])]) +
      file('c.ts', [hunk(1, ['+const c = 3'])]);

    const selection = selectForReview(diff, 250);

    expect(selection.files).toEqual(['a.ts', 'b.ts']);
    expect(selection.skipped).toEqual(['c.ts']);
    expect(selection.totalFiles).toBe(3);
    expect(selection.text).toContain('const b = 2');
    expect(selection.text).not.toContain('const c = 3');
  });

  it('skips noise that no reviewer wants to read', () => {
    const diff =
      file('package-lock.json', [hunk(1, ['+lock'])]) +
      file('dist/bundle.js', [hunk(1, ['+built'])]) +
      file('vendor/dep.go', [hunk(1, ['+vendored'])]) +
      file('app.min.js', [hunk(1, ['+minified'])]) +
      file('logo.png', [hunk(1, ['+binary'])]) +
      file('src/real.ts', [hunk(1, ['+const real = 1'])]);

    const selection = selectForReview(diff, 100_000);

    expect(selection.files).toEqual(['src/real.ts']);
    expect(selection.skipped).toHaveLength(5);
  });

  /**
   * The case the harness found in production data. Skipping the file entirely
   * means a large PR's most substantial change is the one thing never reviewed.
   */
  it('includes whole hunks of a file too big to fit, rather than skipping it', () => {
    const big = file('big.ts', [
      hunk(1, Array.from({ length: 40 }, (_, i) => `+const x${i} = ${i}`)),
      hunk(500, Array.from({ length: 40 }, (_, i) => `+const y${i} = ${i}`)),
    ]);

    const selection = selectForReview(big, 700);

    expect(selection.files).toEqual(['big.ts']);
    expect(selection.partial).toEqual(['big.ts']);
    expect(selection.text).toContain('const x0 = 0');
    // The second hunk did not fit, so it is absent — but the file is not lost.
    expect(selection.text).not.toContain('const y39 = 39');
    // A partial file still parses: the header and whole hunks survive.
    expect(selection.text).toContain('diff --git a/big.ts b/big.ts');
  });

  it('never returns an empty selection when the diff has reviewable files', () => {
    const huge = file('huge.ts', [
      hunk(1, Array.from({ length: 200 }, (_, i) => `+const x${i} = ${i}`)),
    ]);

    const selection = selectForReview(huge, 120);

    expect(selection.files).toEqual(['huge.ts']);
    expect(selection.text.length).toBeGreaterThan(0);
  });

  it('reports totals a coverage sentence can be built from', () => {
    const diff =
      file('a.ts', [hunk(1, ['+a'])]) +
      file('package-lock.json', [hunk(1, ['+lock'])]) +
      file('b.ts', [hunk(1, ['+b'])]);

    const selection = selectForReview(diff, 100_000);

    expect(selection.totalFiles).toBe(3);
    expect(selection.files).toEqual(['a.ts', 'b.ts']);
    expect(selection.skipped).toEqual(['package-lock.json']);
  });

  it('handles an empty or unparseable diff', () => {
    expect(selectForReview('', 8000)).toEqual({
      text: '',
      files: [],
      skipped: [],
      noise: [],
      partial: [],
      totalFiles: 0,
    });
    expect(selectForReview('not a diff at all', 8000).totalFiles).toBe(0);
  });
});

describe('coverageRatio', () => {
  it('is 1 when every reviewable file is included whole', () => {
    const diff = file('a.ts', [hunk(1, ['+const a = 1'])]) + file('b.ts', [hunk(1, ['+const b = 2'])]);

    expect(coverageRatio(selectForReview(diff, 10_000))).toBe(1);
  });

  it('does not count lockfiles as missed code', () => {
    const diff =
      file('a.ts', [hunk(1, ['+const a = 1'])]) + file('package-lock.json', [hunk(1, ['+x'])]);
    const selection = selectForReview(diff, 10_000);

    expect(selection.noise).toEqual(['package-lock.json']);
    expect(coverageRatio(selection)).toBe(1);
  });

  it('is 1/8 when only the first of eight files fits', () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const diff = names.map((n) => file(`${n}.ts`, [hunk(1, [`+const ${n} = 1`])])).join('');
    const budget = file('a.ts', [hunk(1, ['+const a = 1'])]).length;

    expect(coverageRatio(selectForReview(diff, budget))).toBeCloseTo(0.125);
  });

  it('counts a file included only in part as half', () => {
    const diff = file('a.ts', [hunk(1, ['+one']), hunk(10, ['+two'])]);
    const budget = file('a.ts', [hunk(1, ['+one'])]).length;
    const selection = selectForReview(diff, budget);

    expect(selection.partial).toEqual(['a.ts']);
    expect(coverageRatio(selection)).toBe(0.5);
  });

  it('is 1 when the change is nothing but noise', () => {
    const selection = selectForReview(file('yarn.lock', [hunk(1, ['+x'])]), 10_000);

    expect(coverageRatio(selection)).toBe(1);
  });
});
