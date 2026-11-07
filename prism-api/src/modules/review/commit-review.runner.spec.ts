import { PARTIAL_REVIEW, UNPARSEABLE_REVIEW } from '../../ai/verdict';
import { buildBatchedReview } from './batched-review.testing';
import { CommitReviewRunner } from './commit-review.runner';

const addedFile = (name: string, lines: number): string =>
  `diff --git a/src/${name}.ts b/src/${name}.ts\n--- a/src/${name}.ts\n+++ b/src/${name}.ts\n@@ -1,1 +1,${lines} @@\n` +
  Array.from({ length: lines }, (_, i) => `+const ${name}${i} = ${i};`).join('\n') +
  '\n';

function build(diff: string, ai: unknown, config = { batchChars: 16_000, maxBatches: 8 }) {
  const commitReviews = {
    findOne: jest.fn().mockResolvedValue({
      id: 4,
      commitSha: 'abcdef1234567',
      branch: 'main',
      author: 'a',
      shortSha: () => 'abcdef1',
      repository: { id: 2, fullName: 'o/r', userId: 1, user: { id: 1, githubToken: null } },
    }),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const { service, checkpoints } = buildBatchedReview(ai, { config });
  const github = {
    fetchCommitDiff: jest.fn().mockResolvedValue(diff),
    postCommitComment: jest.fn().mockResolvedValue(undefined),
  };
  const runner = new CommitReviewRunner(
    commitReviews as never,
    service,
    { generate: jest.fn().mockResolvedValue(null) } as never,
    github as never,
    {
      commitKey: jest.fn().mockReturnValue('k'),
      remember: jest.fn(async (_key: string, loader: () => Promise<string>) => loader()),
    } as never,
    { decrypt: jest.fn().mockReturnValue('token') } as never,
    { buildForCommit: jest.fn().mockReturnValue('body') } as never,
    { sendCommitReview: jest.fn() } as never,
    { record: jest.fn().mockResolvedValue(undefined) } as never,
  );

  return { runner, commitReviews, github, checkpoints };
}

const finalUpdate = (commitReviews: { update: jest.Mock }): Record<string, unknown> =>
  commitReviews.update.mock.calls.find((call) => (call[1] as Record<string, unknown>).summary !== undefined)?.[1] as Record<
    string,
    unknown
  >;

describe('CommitReviewRunner batched review', () => {
  const answer = { callWithFallback: jest.fn() };

  beforeEach(() => {
    answer.callWithFallback.mockReset().mockResolvedValue({
      model: 'groq/test',
      parsed: { overall_score: 95, summary: 'Looks fine.' },
      raw: null,
    });
  });

  it('reviews every file in several calls and keeps the normal score', async () => {
    const diff = ['a', 'b', 'c', 'd'].map((n) => addedFile(n, 150)).join('');
    const { runner, commitReviews, github, checkpoints } = build(diff, answer, { batchChars: 8000, maxBatches: 8 });

    await runner.run(4, 1);

    const saved = finalUpdate(commitReviews);

    expect(answer.callWithFallback).toHaveBeenCalledTimes(2);
    expect(saved.overallScore).toBe(95);
    expect(String(saved.summary).startsWith(PARTIAL_REVIEW)).toBe(false);
    expect(github.postCommitComment).toHaveBeenCalledTimes(1);
    expect(checkpoints.cleared).toEqual(['commit:4']);
  });

  it('marks the review partial and withholds the score when the cap leaves most of it unread', async () => {
    const diff = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((n) => addedFile(n, 150)).join('');
    const { runner, commitReviews } = build(diff, answer, { batchChars: 8000, maxBatches: 1 });

    await runner.run(4, 1);

    const saved = finalUpdate(commitReviews);

    expect(saved.overallScore).toBeNull();
    expect(String(saved.summary).startsWith(PARTIAL_REVIEW)).toBe(true);
  });

  it('completes as not reviewed, without posting, when no batch gives a usable answer', async () => {
    answer.callWithFallback.mockResolvedValue({ model: 'groq/test', parsed: null, raw: 'garbled' });

    const { runner, commitReviews, github } = build(addedFile('a', 5), answer);

    await runner.run(4, 1);

    const saved = finalUpdate(commitReviews);

    expect(String(saved.summary).startsWith(UNPARSEABLE_REVIEW)).toBe(true);
    expect(saved.overallScore).toBeNull();
    expect(github.postCommitComment).not.toHaveBeenCalled();
  });
});
