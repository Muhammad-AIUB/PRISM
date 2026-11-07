import { prepareBatch, prepareDiff } from './prepare';

/**
 * The stage both runners share.
 *
 * `pr-review.runner.ts` and `commit-review.runner.ts` are near-parallel ports of
 * two separate original jobs, and their differences downstream are deliberate:
 * different tables, different comment text, different notifications. What
 * happens BEFORE the AI call is identical in both, and adding four more
 * identical steps to each would mean fixing every future parser bug twice.
 * Only the identical part moves here.
 */
const diff = (path: string, lines: string[]): string =>
  `diff --git a/${path} b/${path}\n@@ -1,${lines.length} +1,${lines.length} @@\n` +
  lines.map((l) => `${l}\n`).join('');

describe('prepareDiff', () => {
  it('detects languages from the whole diff, not the part that fits the budget', () => {
    const big = diff('app.ts', Array.from({ length: 400 }, (_, i) => `+const x${i} = ${i}`));
    const prepared = prepareDiff(`${big}${diff('go/main.py', ['+import os'])}`, 2000);

    expect(prepared.languages).toEqual(['TypeScript', 'Python']);
  });

  it('renders anchors and can resolve one back to real code', () => {
    const prepared = prepareDiff(diff('a.ts', [' keep', '-gone', '+fresh']), 8000);

    expect(prepared.body).toContain('[1]');
    expect(prepared.anchors.get(1)).toMatchObject({ file: 'a.ts', side: 'removed', text: 'gone' });
    expect(prepared.anchors.get(2)).toMatchObject({ file: 'a.ts', side: 'added', text: 'fresh' });
  });

  it('tells the model what an anchor is, since the frozen system prompt cannot', () => {
    const prepared = prepareDiff(diff('a.ts', ['+x']), 8000);

    expect(prepared.body).toContain('anchor');
  });

  it('says nothing about coverage when the whole diff was reviewed', () => {
    const prepared = prepareDiff(diff('a.ts', ['+x']), 8000);

    expect(prepared.coverage).toBeNull();
  });

  it('reports coverage when files were left out', () => {
    const wide =
      diff('a.ts', Array.from({ length: 200 }, (_, i) => `+const a${i} = ${i}`)) +
      diff('b.ts', Array.from({ length: 200 }, (_, i) => `+const b${i} = ${i}`)) +
      diff('c.ts', ['+const c = 1']);

    const prepared = prepareDiff(wide, 1500);

    expect(prepared.coverage).toMatch(/^Reviewed \d+ of 3 changed files/);
  });

  it('counts a partially reviewed file honestly', () => {
    const huge = diff('huge.ts', Array.from({ length: 500 }, (_, i) => `+const x${i} = ${i}`));
    const prepared = prepareDiff(huge, 900);

    expect(prepared.coverage).toContain('in part');
  });

  it('survives a diff it cannot parse', () => {
    const prepared = prepareDiff('this is not a diff', 8000);

    expect(prepared.anchors.size).toBe(0);
    expect(prepared.languages).toEqual([]);
    expect(prepared.coverage).toBeNull();
  });
});

describe('prepareDiff coverageRatio', () => {
  const one = (n: string): string =>
    `diff --git a/${n}.ts b/${n}.ts
index 1111111..2222222 100644
--- a/${n}.ts
+++ b/${n}.ts
@@ -1,1 +1,1 @@
+const ${n} = 1
`;

  it('is 1 when everything fit', () => {
    expect(prepareDiff(one('a') + one('b'), 10_000).coverageRatio).toBe(1);
  });

  it('is below 1 when files were left out', () => {
    const diff = ['a', 'b', 'c', 'd'].map(one).join('');

    expect(prepareDiff(diff, one('a').length).coverageRatio).toBeCloseTo(0.25);
  });
});

describe('prepareBatch', () => {
  it('numbers anchors from 1 in every batch, so ids from another batch are unknown here', () => {
    const first = prepareBatch(diff('a.ts', ['+one', '+two']));
    const second = prepareBatch(diff('b.ts', ['+three']));

    expect([...first.anchors.keys()]).toEqual([1, 2]);
    expect([...second.anchors.keys()]).toEqual([1]);
    expect(second.anchors.get(1)?.file).toBe('b.ts');
    expect(second.anchors.get(2)).toBeUndefined();
  });

  it('carries the anchor instructions, which the frozen system prompt cannot', () => {
    expect(prepareBatch(diff('a.ts', ['+x'])).body).toContain('anchor id in square brackets');
  });

  it('has an empty body for an empty batch', () => {
    expect(prepareBatch('').body).toBe('');
  });
});
