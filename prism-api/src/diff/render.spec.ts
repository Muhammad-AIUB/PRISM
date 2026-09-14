import { buildHunkIndex } from './hunk-index';
import { renderWithAnchors, renderWithLineNumbers } from './render';

const EDIT_DIFF =
  'diff --git a/src/auth.ts b/src/auth.ts\n' +
  '--- a/src/auth.ts\n' +
  '+++ b/src/auth.ts\n' +
  '@@ -10,3 +10,3 @@\n' +
  ' const user = load(req)\n' +
  '-if (!user.isAdmin) return deny()\n' +
  '+return allow()\n' +
  ' return done\n';

describe('renderWithLineNumbers', () => {
  it('shows both side numbers, with a dot where a side has none', () => {
    const text = renderWithLineNumbers(buildHunkIndex(EDIT_DIFF));

    expect(text).toBe(
      '=== src/auth.ts ===\n' +
        ' old  new\n' +
        '  10   10 |   const user = load(req)\n' +
        '  11    . | - if (!user.isAdmin) return deny()\n' +
        '   .   11 | + return allow()\n' +
        '  12   12 |   return done\n',
    );
  });
});

describe('renderWithAnchors', () => {
  it('numbers only the changed lines, sequentially', () => {
    const { text } = renderWithAnchors(buildHunkIndex(EDIT_DIFF));

    expect(text).toBe(
      '=== src/auth.ts ===\n' +
        '      |   const user = load(req)\n' +
        ' [1]  | - if (!user.isAdmin) return deny()\n' +
        ' [2]  | + return allow()\n' +
        '      |   return done\n',
    );
  });

  it('maps each anchor back to its file, side, real line and text', () => {
    const { anchors } = renderWithAnchors(buildHunkIndex(EDIT_DIFF));

    expect(anchors.get(1)).toEqual({
      file: 'src/auth.ts',
      side: 'removed',
      line: 11,
      text: 'if (!user.isAdmin) return deny()',
    });
    expect(anchors.get(2)).toEqual({
      file: 'src/auth.ts',
      side: 'added',
      line: 11,
      text: 'return allow()',
    });
  });

  /**
   * The property per-file line numbers cannot offer. A fabricated line number
   * stays inside the file the model named and looks exactly like a real one.
   * A fabricated anchor usually resolves to a DIFFERENT file, so comparing the
   * anchor's file against the file the model claimed catches it.
   */
  it('keeps numbering across files so an anchor identifies a file too', () => {
    const { anchors } = renderWithAnchors(
      buildHunkIndex(
        'diff --git a/a.ts b/a.ts\n@@ -1 +1 @@\n+first\n' +
          'diff --git a/b.ts b/b.ts\n@@ -1 +1 @@\n+second\n',
      ),
    );

    expect(anchors.get(1)?.file).toBe('a.ts');
    expect(anchors.get(2)?.file).toBe('b.ts');
  });

  it('gives context lines no anchor', () => {
    const { anchors } = renderWithAnchors(buildHunkIndex(EDIT_DIFF));

    expect(anchors.size).toBe(2);
  });

  it('renders an empty index as empty text with no anchors', () => {
    const { text, anchors } = renderWithAnchors(buildHunkIndex(''));

    expect(text).toBe('');
    expect(anchors.size).toBe(0);
  });

  it('still lists a file that has no parsed lines', () => {
    const { text } = renderWithAnchors(
      buildHunkIndex(
        'diff --git a/logo.png b/logo.png\nBinary files a/logo.png and b/logo.png differ\n',
      ),
    );

    expect(text).toBe('=== logo.png ===\n');
  });
});
