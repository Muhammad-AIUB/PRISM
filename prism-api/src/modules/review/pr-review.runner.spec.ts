import { PromptBuilderService } from '../../ai/prompt-builder.service';
import * as riskRadar from '../../diff/risk-radar';
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

/**
 * The reviewed-revision risk has to change in the same step as the review row
 * it describes. Written any later, or only on the happy path, the page pairs a
 * new review with the previous push's risk and calls it "reviewed".
 */
describe('PullRequestReviewRunner reviewed-revision risk', () => {
  const AUTH_DIFF = [
    'diff --git a/src/auth/guard.ts b/src/auth/guard.ts',
    '--- a/src/auth/guard.ts',
    '+++ b/src/auth/guard.ts',
    '@@ -1,1 +1,1 @@',
    '+export const allow = true;',
  ].join('\n');

  function build(parsed: Record<string, unknown> | null) {
    const pullRequests = repo();
    const reviews = repo();
    const reviewComments = repo();
    const github = {
      fetchPullRequestDiff: jest.fn().mockResolvedValue(AUTH_DIFF),
      postPullRequestComment: jest.fn().mockResolvedValue(undefined),
    };
    const reviewedRisk = {
      save: jest.fn().mockResolvedValue(undefined),
      forget: jest.fn().mockResolvedValue(undefined),
    };

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

    const runner = new PullRequestReviewRunner(
      pullRequests as never,
      reviews as never,
      reviewComments as never,
      {
        callWithFallback: jest.fn().mockResolvedValue({ model: 'groq/test', parsed, raw: parsed ? null : 'garbled' }),
      } as never,
      new PromptBuilderService(),
      { generate: jest.fn().mockResolvedValue(null) } as never,
      github as never,
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

    return { runner, reviews, reviewedRisk, github };
  }

  afterEach(() => jest.restoreAllMocks());

  it('records the risk right after the review row, before anything else can fail', async () => {
    const { runner, reviews, reviewedRisk, github } = build({ overall_score: 80, summary: 's' });

    await runner.run(1, 1);

    expect(reviewedRisk.save).toHaveBeenCalledWith(1, expect.objectContaining({ level: expect.any(String) }));

    const [rowWrite] = reviews.save.mock.invocationCallOrder;
    const [riskWrite] = reviewedRisk.save.mock.invocationCallOrder;
    const [comment] = github.postPullRequestComment.mock.invocationCallOrder;

    expect(riskWrite).toBeGreaterThan(rowWrite as number);
    expect(riskWrite).toBeLessThan(comment as number);
  });

  it('records it on the unparseable-output path too, which returns early', async () => {
    const { runner, reviews, reviewedRisk } = build(null);

    await runner.run(1, 1);

    expect(reviews.save).toHaveBeenCalled();
    expect(reviewedRisk.save).toHaveBeenCalledWith(1, expect.objectContaining({ level: expect.any(String) }));
  });

  it('clears the saved risk when the scan fails, instead of leaving the last push\'s', async () => {
    jest.spyOn(riskRadar, 'tryAssessRisk').mockReturnValue(null);
    const { runner, reviewedRisk } = build({ overall_score: 80, summary: 's' });

    await runner.run(1, 1);

    expect(reviewedRisk.save).not.toHaveBeenCalled();
    expect(reviewedRisk.forget).toHaveBeenCalledWith(1);
  });
});
