import { buildHunkIndex } from '../diff/hunk-index';
import { renderWithAnchors } from '../diff/render';
import { droppedCount, validateIssues, validateLayers } from './issue-validator';

/**
 * The point of the whole exercise: a finding the reader can check.
 *
 * The model is shown anchors, not file line numbers, so every location it
 * reports either resolves to a line we rendered or it does not exist. What it
 * cannot do any more is name a plausible number inside a real file and have
 * that be indistinguishable from a true one.
 *
 * The file it claims is kept only as a cross-check. The authoritative location
 * comes from the anchor, so a finding that survives points at real code by
 * construction rather than by trust.
 */
const DIFF =
  'diff --git a/src/auth.ts b/src/auth.ts\n' +
  '@@ -10,3 +10,3 @@\n' +
  ' const user = load(req)\n' +
  '-if (!user.isAdmin) return deny()\n' +
  '+return allow()\n' +
  'diff --git a/src/util.ts b/src/util.ts\n' +
  '@@ -1,1 +1,2 @@\n' +
  '+export const noop = () => {}\n';

const { anchors } = renderWithAnchors(buildHunkIndex(DIFF));

const issue = (over: Record<string, unknown>) => ({
  file: 'src/auth.ts',
  line: 1,
  severity: 'critical',
  comment: 'something',
  ...over,
});

describe('validateIssues', () => {
  it('rewrites a resolved anchor to the real file, line and side', () => {
    const result = validateIssues([issue({ line: 1 })], anchors);

    expect(result.issues).toEqual([
      {
        file: 'src/auth.ts',
        line: 11,
        side: 'removed',
        // The fixture issue names no category, so it normalises to `other` and
        // cannot reach the blocking set.
        category: 'other',
        severity: 'critical',
        comment: 'something',
      },
    ]);
  });

  it('uses the anchor for an added line too', () => {
    const result = validateIssues([issue({ line: 2 })], anchors);

    expect(result.issues[0]).toMatchObject({ file: 'src/auth.ts', line: 11, side: 'added' });
  });

  it('drops a finding whose anchor was never rendered', () => {
    const result = validateIssues([issue({ line: 999 })], anchors);

    expect(result.issues).toEqual([]);
    expect(result.dropped.unknownAnchor).toBe(1);
  });

  it('drops a finding with no usable number at all', () => {
    const result = validateIssues([issue({ line: null }), issue({ line: 'abc' })], anchors);

    expect(result.issues).toEqual([]);
    expect(result.dropped.noAnchor).toBe(2);
  });

  /**
   * The check per-file line numbers structurally cannot make. The model said
   * src/auth.ts; anchor 3 is in src/util.ts. One of the two is invented, and
   * either way the finding is not trustworthy.
   */
  it('drops a finding whose claimed file disagrees with its anchor', () => {
    const result = validateIssues([issue({ file: 'src/auth.ts', line: 3 })], anchors);

    expect(result.issues).toEqual([]);
    expect(result.dropped.fileMismatch).toBe(1);
  });

  it('keeps a finding whose claimed file is absent, trusting the anchor', () => {
    const result = validateIssues([issue({ file: undefined, line: 2 })], anchors);

    expect(result.issues[0]).toMatchObject({ file: 'src/auth.ts', line: 11 });
  });

  it('normalises an unrecognised severity rather than dropping the finding', () => {
    const result = validateIssues([issue({ line: 2, severity: 'blocker' })], anchors);

    expect(result.issues[0]?.severity).toBe('suggestion');
  });

  it('carries a recognised category through', () => {
    const result = validateIssues([issue({ line: 2, category: 'auth_weakened' })], anchors);

    expect(result.issues[0]?.category).toBe('auth_weakened');
  });

  /**
   * An invented category must not be able to reach the blocking set. Falling
   * back to `other` keeps the finding and denies it the power to gate a merge.
   */
  it('falls back to other for a category it does not recognise', () => {
    const result = validateIssues([issue({ line: 2, category: 'catastrophic' })], anchors);

    expect(result.issues[0]?.category).toBe('other');
  });

  it('falls back to other when the model omits the category entirely', () => {
    const result = validateIssues([issue({ line: 2, category: undefined })], anchors);

    expect(result.issues[0]?.category).toBe('other');
  });

  it('drops entries that are not issues at all', () => {
    const result = validateIssues(
      [null, 'nope', { line: 2 }, issue({ line: 2, comment: '' })] as unknown[],
      anchors,
    );

    expect(result.issues).toEqual([]);
    expect(result.dropped.malformed).toBe(4);
  });

  it('counts what survived so the drop rate is measurable', () => {
    const result = validateIssues(
      [issue({ line: 1 }), issue({ line: 2 }), issue({ line: 999 })],
      anchors,
    );

    expect(result.kept).toBe(2);
    expect(result.total).toBe(3);
  });

  it('drops everything when nothing was rendered', () => {
    const result = validateIssues([issue({ line: 1 })], new Map());

    expect(result.issues).toEqual([]);
    expect(result.kept).toBe(0);
  });
});

describe('validateLayers', () => {
  it('validates all three layers and keeps them separate', () => {
    const layers = validateLayers(
      {
        security: [issue({ line: 1 })] as never,
        performance: [issue({ line: 2 })] as never,
        code_quality: [issue({ line: 999 })] as never,
      },
      anchors,
    );

    expect(layers.security).toHaveLength(1);
    expect(layers.performance).toHaveLength(1);
    expect(layers.code_quality).toEqual([]);
    expect(layers.kept).toBe(2);
  });

  it('sums the drop reasons across layers so the rate is one number', () => {
    const layers = validateLayers(
      {
        security: [issue({ line: 999 })] as never,
        performance: [issue({ line: 998 })] as never,
        code_quality: [issue({ line: null })] as never,
      },
      anchors,
    );

    expect(droppedCount(layers)).toBe(3);
    expect(layers.reasons.unknownAnchor).toBe(2);
    expect(layers.reasons.noAnchor).toBe(1);
  });

  it('treats a missing layer as empty rather than throwing', () => {
    const layers = validateLayers(
      { security: undefined as never, performance: [] as never, code_quality: [] as never },
      anchors,
    );

    expect(layers.security).toEqual([]);
    expect(droppedCount(layers)).toBe(0);
  });
});
