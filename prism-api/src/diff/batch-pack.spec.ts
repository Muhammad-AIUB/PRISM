import { coverageRatio } from './file-selection';
import { packForReview, selectionFor, splitFile } from './batch-pack';
import { buildHunkIndex } from './hunk-index';
import { renderWithAnchors } from './render';

const header = (name: string): string => `diff --git a/${name} b/${name}\n--- a/${name}\n+++ b/${name}\n`;

/** One hunk: a context line, a removed line, then `added` added lines, then a context line. */
const file = (name: string, added: number): string =>
  header(name) +
  `@@ -1,2 +1,${added + 2} @@\n ctx1\n-old\n` +
  Array.from({ length: added }, (_, i) => `+line ${i}`).join('\n') +
  '\n ctx2\n';

const CONFIG = { batchChars: 16_000, maxBatches: 8 };

describe('packForReview', () => {
  it('keeps a small change in one batch and leaves noise out of it', () => {
    const diff = file('a.ts', 10) + file('b.ts', 10) + 'diff --git a/x.png b/x.png\nBinary files differ\n';
    const packed = packForReview(diff, CONFIG);

    expect(packed.batches).toHaveLength(1);
    expect(packed.batches[0]?.files).toEqual(['a.ts', 'b.ts']);
    expect(packed.noise).toEqual(['x.png']);
    expect(coverageRatio(selectionFor(packed, new Set([0])))).toBe(1);
  });

  it('opens a new batch when the next file does not fit, in diff order', () => {
    const packed = packForReview(file('a.ts', 200) + file('b.ts', 200) + file('c.ts', 200), {
      batchChars: 3000,
      maxBatches: 8,
    });

    expect(packed.batches.map((b) => b.files)).toEqual([['a.ts'], ['b.ts'], ['c.ts']]);
  });

  it('cuts an oversized file into hunks and a giant hunk at line boundaries, keeping real line numbers', () => {
    const packed = packForReview(file('big.ts', 1500), { batchChars: 4000, maxBatches: 8 });

    expect(packed.batches.length).toBeGreaterThan(3);

    const seen = new Set<number>();
    let added = 0;

    for (const batch of packed.batches) {
      expect(batch.text.length).toBeLessThanOrEqual(4000);

      const hunks = buildHunkIndex(batch.text).get('big.ts');

      for (const line of hunks?.added.keys() ?? []) {
        expect(seen.has(line)).toBe(false);
        seen.add(line);
      }

      added += hunks?.added.size ?? 0;
    }

    expect(added).toBe(1500);
    // "ctx1" is new-side line 1, so "+line 0" is line 2 and "+line 1499" is line 1501.
    expect(Math.max(...seen)).toBe(1501);
  });

  it('gives a later piece anchors that resolve to the true line of the file', () => {
    const packed = packForReview(file('big.ts', 1500), { batchChars: 4000, maxBatches: 8 });
    const second = renderWithAnchors(buildHunkIndex(packed.batches[1]?.text ?? ''));
    const first = second.anchors.get(1);

    expect(first?.file).toBe('big.ts');
    expect(first?.text).toBe(`line ${(first?.line ?? 0) - 2}`);
  });

  it('cuts a single line longer than a batch rather than emitting an oversized batch', () => {
    const long = `${header('min.ts')}@@ -1,1 +1,2 @@\n ctx\n+${'x'.repeat(9000)}\n`;
    const packed = packForReview(long, { batchChars: 2000, maxBatches: 8 });

    expect(packed.batches.every((b) => b.text.length <= 2000)).toBe(true);
    expect(packed.batches.map((b) => b.text).join('')).toContain('[line cut]');
  });

  it('reports a file whose header alone cannot fit as unfit, not as noise', () => {
    const packed = packForReview(file('a.ts', 400), { batchChars: 100, maxBatches: 8 });

    expect(packed.unfit).toEqual(['a.ts']);
    expect(packed.noise).toEqual([]);
  });

  it('caps the batches and reports the overflow through the coverage ratio', () => {
    const diff = ['a', 'b', 'c', 'd', 'e'].map((n) => file(`${n}.ts`, 200)).join('');
    const packed = packForReview(diff, { batchChars: 3000, maxBatches: 3 });
    const selection = selectionFor(packed, new Set([0, 1, 2]));

    expect(packed.batches).toHaveLength(3);
    expect(selection.files).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(selection.skipped).toEqual(['d.ts', 'e.ts']);
    expect(coverageRatio(selection)).toBeCloseTo(0.6);
  });

  it('keeps the riskiest files when over the cap, in risk order then diff order', () => {
    const diff = ['a', 'b', 'c', 'd', 'e'].map((n) => file(`${n}.ts`, 200)).join('');
    const rank = (path: string): number => (path === 'e.ts' ? 10 : path === 'd.ts' ? 5 : 0);
    const packed = packForReview(diff, { batchChars: 3000, maxBatches: 3 }, rank);

    expect(packed.batches.map((b) => b.files)).toEqual([['e.ts'], ['d.ts'], ['a.ts']]);
  });

  it('does not reorder when everything fits, whatever the rank says', () => {
    const packed = packForReview(file('a.ts', 5) + file('b.ts', 5), CONFIG, (p) => (p === 'b.ts' ? 9 : 0));

    expect(packed.batches[0]?.files).toEqual(['a.ts', 'b.ts']);
  });

  it('counts a file with only some of its pieces reviewed as partial', () => {
    const packed = packForReview(file('big.ts', 1500), { batchChars: 4000, maxBatches: 2 });
    const selection = selectionFor(packed, new Set([0, 1]));

    expect(selection.files).toEqual(['big.ts']);
    expect(selection.partial).toEqual(['big.ts']);
    expect(coverageRatio(selection)).toBe(0.5);
  });

  it('treats a batch that never completed as not reviewed', () => {
    const packed = packForReview(file('a.ts', 200) + file('b.ts', 200), { batchChars: 3000, maxBatches: 8 });
    const selection = selectionFor(packed, new Set([1]));

    expect(selection.files).toEqual(['b.ts']);
    expect(selection.skipped).toEqual(['a.ts']);
  });

  it('yields one empty batch for a diff with nothing to review, so the caller still makes its one call', () => {
    const packed = packForReview('diff --git a/x.png b/x.png\nBinary files differ\n', CONFIG);

    expect(packed.batches).toHaveLength(1);
    expect(packed.batches[0]?.text).toBe('');
    expect(coverageRatio(selectionFor(packed, new Set([0])))).toBe(1);
  });
});

describe('splitFile', () => {
  it('returns the file untouched when it fits', () => {
    const body = file('a.ts', 3);

    expect(splitFile(body, 10_000)).toEqual([body]);
  });
});
