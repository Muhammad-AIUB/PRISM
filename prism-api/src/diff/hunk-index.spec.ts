import { buildHunkIndex, type HunkLine } from './hunk-index';

describe('buildHunkIndex', () => {
  it('records the new-side line numbers of added lines', () => {
    const index = buildHunkIndex(
      'diff --git a/src/a.ts b/src/a.ts\n' +
        '@@ -10,2 +10,3 @@\n' +
        ' const a = 1\n' +
        '+const b = 2\n' +
        ' const c = 3\n',
    );

    expect(index.get('src/a.ts')?.added).toEqual(new Map([[11, 'const b = 2']]));
  });

  it('records removed lines under their OLD-side line number', () => {
    const index = buildHunkIndex(
      'diff --git a/src/a.ts b/src/a.ts\n' +
        '@@ -10,3 +10,2 @@\n' +
        ' const a = 1\n' +
        '-const gone = 2\n' +
        ' const c = 3\n',
    );

    expect(index.get('src/a.ts')?.removed).toEqual(new Map([[11, 'const gone = 2']]));
  });

  it('records context lines under their new-side number', () => {
    const index = buildHunkIndex(
      'diff --git a/src/a.ts b/src/a.ts\n' +
        '@@ -10,2 +10,3 @@\n' +
        ' const a = 1\n' +
        '+const b = 2\n' +
        ' const c = 3\n',
    );

    expect(index.get('src/a.ts')?.context).toEqual(
      new Map([
        [10, 'const a = 1'],
        [12, 'const c = 3'],
      ]),
    );
  });

  /**
   * The reason anchoring cannot be a per-file line number plus a guess: an
   * in-place edit is a remove/add pair, so the SAME integer is a real line on
   * both sides. Any "prefer added" tiebreak silently re-points a finding about
   * the deleted line at the line that replaced it.
   */
  it('puts the same number in added and removed for an in-place edit', () => {
    const index = buildHunkIndex(
      'diff --git a/src/a.ts b/src/a.ts\n' +
        '@@ -10,3 +10,3 @@\n' +
        ' const a = 1\n' +
        '-if (!user.isAdmin) return deny()\n' +
        '+return allow()\n' +
        ' const c = 3\n',
    );

    const file = index.get('src/a.ts');

    expect(file?.removed.get(11)).toBe('if (!user.isAdmin) return deny()');
    expect(file?.added.get(11)).toBe('return allow()');
  });

  /**
   * The shape GitHub actually sends. The `---`/`+++` header pair arrives before
   * the first `@@`, and both start with a character that otherwise means
   * "changed line" — so a parser that only looks at the first character files
   * the header itself as a diff line.
   */
  it('ignores the ---/+++ file header pair', () => {
    const index = buildHunkIndex(
      'diff --git a/src/a.ts b/src/a.ts\n' +
        'index 1234567..89abcde 100644\n' +
        '--- a/src/a.ts\n' +
        '+++ b/src/a.ts\n' +
        '@@ -10,2 +10,3 @@\n' +
        ' const a = 1\n' +
        '+const b = 2\n' +
        ' const c = 3\n',
    );

    const file = index.get('src/a.ts');

    expect(file?.added).toEqual(new Map([[11, 'const b = 2']]));
    expect(file?.removed.size).toBe(0);
  });

  it('restarts the line counters at every hunk header', () => {
    const index = buildHunkIndex(
      'diff --git a/src/a.ts b/src/a.ts\n' +
        '--- a/src/a.ts\n' +
        '+++ b/src/a.ts\n' +
        '@@ -10,2 +10,2 @@\n' +
        ' one\n' +
        '+two\n' +
        '@@ -80,2 +90,2 @@\n' +
        ' eighty\n' +
        '+ninety-one\n',
    );

    expect(index.get('src/a.ts')?.added).toEqual(
      new Map([
        [11, 'two'],
        [91, 'ninety-one'],
      ]),
    );
  });

  it('keeps files separate and handles a hunk header with no counts', () => {
    const index = buildHunkIndex(
      'diff --git a/a.ts b/a.ts\n' +
        '@@ -1 +1 @@\n' +
        '-old\n' +
        '+new\n' +
        'diff --git a/b.ts b/b.ts\n' +
        '@@ -5,1 +5,2 @@\n' +
        ' keep\n' +
        '+added\n',
    );

    expect([...index.keys()]).toEqual(['a.ts', 'b.ts']);
    expect(index.get('a.ts')?.added).toEqual(new Map([[1, 'new']]));
    expect(index.get('a.ts')?.removed).toEqual(new Map([[1, 'old']]));
    expect(index.get('b.ts')?.added).toEqual(new Map([[6, 'added']]));
  });

  it('ignores the no-newline marker', () => {
    const index = buildHunkIndex(
      'diff --git a/a.ts b/a.ts\n' +
        '@@ -1 +1 @@\n' +
        '-old\n' +
        '\\ No newline at end of file\n' +
        '+new\n' +
        '\\ No newline at end of file\n',
    );

    expect(index.get('a.ts')?.added).toEqual(new Map([[1, 'new']]));
    expect(index.get('a.ts')?.removed).toEqual(new Map([[1, 'old']]));
  });

  it('records a rename or binary file as present but empty', () => {
    const index = buildHunkIndex(
      'diff --git a/old.ts b/new.ts\n' +
        'similarity index 100%\n' +
        'rename from old.ts\n' +
        'rename to new.ts\n' +
        'diff --git a/logo.png b/logo.png\n' +
        'Binary files a/logo.png and b/logo.png differ\n',
    );

    expect([...index.keys()]).toEqual(['old.ts', 'logo.png']);
    expect(index.get('logo.png')?.added.size).toBe(0);
  });

  it('returns an empty index for an empty or unparseable diff', () => {
    expect(buildHunkIndex('').size).toBe(0);
    expect(buildHunkIndex('just some text\n+not in a file\n').size).toBe(0);
  });

  /**
   * The three maps answer "is this line real?" but lose the order the diff had,
   * and a removed line and the added line replacing it share a number. Renderers
   * need the original sequence, so one pass produces both views.
   */
  it('keeps the lines in diff order with both side numbers', () => {
    const index = buildHunkIndex(
      'diff --git a/src/a.ts b/src/a.ts\n' +
        '@@ -10,3 +10,3 @@\n' +
        ' const a = 1\n' +
        '-if (!user.isAdmin) return deny()\n' +
        '+return allow()\n' +
        ' const c = 3\n',
    );

    const expected: HunkLine[] = [
      { kind: 'context', oldLine: 10, newLine: 10, text: 'const a = 1' },
      { kind: 'removed', oldLine: 11, newLine: null, text: 'if (!user.isAdmin) return deny()' },
      { kind: 'added', oldLine: null, newLine: 11, text: 'return allow()' },
      { kind: 'context', oldLine: 12, newLine: 12, text: 'const c = 3' },
    ];

    expect(index.get('src/a.ts')?.lines).toEqual(expected);
  });

  it('marks a hunk boundary so renderers can show a gap', () => {
    const index = buildHunkIndex(
      'diff --git a/a.ts b/a.ts\n' +
        '@@ -1,1 +1,2 @@\n' +
        ' one\n' +
        '+two\n' +
        '@@ -50,1 +51,2 @@\n' +
        ' fifty\n',
    );

    expect(index.get('a.ts')?.lines.map((line) => line.newLine)).toEqual([1, 2, 51]);
  });
});
