import { PromptBuilderService } from '../../ai/prompt-builder.service';
import { PullRequestReviewRunner } from './pr-review.runner';

/**
 * Which diff the language detector gets to see.
 *
 * Both runners truncate the diff to DIFF_LIMIT for the AI call, then run
 * detectLanguages() on the TRUNCATED slice. The truncation is deliberate; the
 * detector reading it is not. `detected_languages` feeds two user-visible
 * things — the badges in the UI and the language-specific rule block appended
 * to the system prompt — so a PR whose Python files happen to sort after 8000
 * characters of Markdown silently gets reviewed with no Python rules at all.
 *
 * Nothing about that failure is visible: the review completes, the badges just
 * show fewer languages than the PR contains.
 */
const bigTypeScriptDiff = (): string => {
  const filler = Array.from(
    { length: 400 },
    (_, index) => `+const value${index} = ${index};`,
  ).join('\n');

  return (
    'diff --git a/src/app.ts b/src/app.ts\n' +
    '@@ -1,1 +1,401 @@\n' +
    `${filler}\n` +
    // Well past the 8000-character truncation point.
    'diff --git a/scripts/migrate.py b/scripts/migrate.py\n' +
    '@@ -1,1 +1,2 @@\n' +
    '+import os\n'
  );
};

const repo = () => ({
  findOne: jest.fn(),
  update: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined),
  create: jest.fn((value: unknown) => value),
  save: jest.fn(async (value: unknown) => value),
  count: jest.fn().mockResolvedValue(0),
});

describe('PullRequestReviewRunner language detection', () => {
  it('detects languages from the whole diff, not the truncated slice', async () => {
    const pullRequests = repo();
    const reviews = repo();
    const reviewComments = repo();
    const diff = bigTypeScriptDiff();

    expect(diff.length).toBeGreaterThan(8000);

    pullRequests.findOne.mockResolvedValue({
      id: 1,
      prNumber: 7,
      title: 'x',
      author: 'a',
      headBranch: 'f',
      baseBranch: 'main',
      updatedAt: new Date(),
      repository: { fullName: 'o/r', user: { id: 1, githubToken: null } },
    });
    reviews.findOne.mockResolvedValue(null);
    reviews.save.mockResolvedValue({ id: 99 });

    const reviewedRisk = { save: jest.fn().mockResolvedValue(undefined) };
    const runner = new PullRequestReviewRunner(
      pullRequests as never,
      reviews as never,
      reviewComments as never,
      {
        callWithFallback: jest.fn().mockResolvedValue({
          model: 'groq/test',
          parsed: { overall_score: 80, summary: 's' },
          raw: null,
        }),
      } as never,
      new PromptBuilderService(),
      { generate: jest.fn().mockResolvedValue(null) } as never,
      {
        fetchPullRequestDiff: jest.fn().mockResolvedValue(diff),
        postPullRequestComment: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        pullRequestKey: jest.fn().mockReturnValue('k'),
        remember: jest.fn(async (_key: string, loader: () => Promise<string>) => loader()),
      } as never,
      { decrypt: jest.fn().mockReturnValue('token') } as never,
      { buildForPullRequest: jest.fn().mockReturnValue('body') } as never,
      { sendPullRequestReview: jest.fn() } as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      reviewedRisk as never,
    );

    await runner.run(1, 1);

    // The assessment the page will show is of this exact diff, saved under this PR.
    expect(reviewedRisk.save).toHaveBeenCalledWith(1, expect.objectContaining({ level: expect.any(String) }));

    const languageWrite = pullRequests.update.mock.calls.find(
      (call) => (call[1] as Record<string, unknown>).detectedLanguages !== undefined,
    );

    expect(languageWrite?.[1]).toEqual({ detectedLanguages: ['TypeScript', 'Python'] });
  });
});
