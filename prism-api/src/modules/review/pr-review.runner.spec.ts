import { buildBatchedReview } from './batched-review.testing';
import * as riskRadar from '../../diff/risk-radar';
import { PullRequestReviewRunner } from './pr-review.runner';
import { PARTIAL_REVIEW } from '../../ai/verdict';

/**
 * Which diff the language detector gets to see.
 *
 * The AI call reads the batches, which cover a limited part of a large change,
 * but `detected_languages` describes the whole pull request. It feeds the badges
 * in the UI and the language-specific rule block appended to the system prompt,
 * so a PR whose Python files sort after a long run of other files must still be
 * reported, and reviewed with the Python rules.
 *
 * Nothing about a miss is visible: the review completes, the badges just show
 * fewer languages than the PR contains.
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
    // Past the first 8000 characters of the diff.
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
  it('detects languages from the whole diff, not only the part the model read', async () => {
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
      repository: { fullName: 'o/r', userId: 1, user: { id: 1, githubToken: null } },
    });
    reviews.findOne.mockResolvedValue(null);
    reviews.save.mockResolvedValue({ id: 99 });

    const reviewedRisk = { save: jest.fn().mockResolvedValue(undefined) };
    const runner = new PullRequestReviewRunner(
      pullRequests as never,
      reviews as never,
      reviewComments as never,
      buildBatchedReview({
        callWithFallback: jest.fn().mockResolvedValue({
          model: 'groq/test',
          parsed: { overall_score: 80, summary: 's' },
          raw: null,
        }),
      }).service,
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
    expect(reviewedRisk.save).toHaveBeenCalledWith(1, 1, expect.objectContaining({ level: expect.any(String) }));

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

  function build(parsed: Record<string, unknown> | null, generate: jest.Mock = jest.fn().mockResolvedValue(null)) {
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
      repository: { fullName: 'o/r', userId: 1, user: { id: 1, githubToken: null } },
    });
    reviews.findOne.mockResolvedValue(null);
    reviews.save.mockResolvedValue({ id: 99 });

    const runner = new PullRequestReviewRunner(
      pullRequests as never,
      reviews as never,
      reviewComments as never,
      buildBatchedReview({
        callWithFallback: jest.fn().mockResolvedValue({ model: 'groq/test', parsed, raw: parsed ? null : 'garbled' }),
      }).service,
      { generate } as never,
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

    expect(reviewedRisk.save).toHaveBeenCalledWith(1, 1, expect.objectContaining({ level: expect.any(String) }));

    const [rowWrite] = reviews.save.mock.invocationCallOrder;
    const [riskWrite] = reviewedRisk.save.mock.invocationCallOrder;
    const [comment] = github.postPullRequestComment.mock.invocationCallOrder;

    expect(riskWrite).toBeGreaterThan(rowWrite as number);
    expect(riskWrite).toBeLessThan(comment as number);
  });

  it('hands the fixes pass the last model and the reviewed text, and checks its fixes against the merged index', async () => {
    const fix = (file: string, code: string) => ({
      layer: 'security',
      file,
      line: 1,
      original_issue: 'i',
      problematic_code: code,
      suggested_code: 's',
      explanation: 'e',
    });
    const generate = jest.fn().mockResolvedValue({
      fixes: [fix('src/auth/guard.ts', 'export const allow = true;'), fix('src/elsewhere.ts', 'export const allow = true;')],
    });
    const { runner, reviews } = build({ overall_score: 80, summary: 's' }, generate);

    await runner.run(1, 1);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]?.[0]).toBe('groq/test');
    expect(generate.mock.calls[0]?.[2]).toContain('+export const allow = true;');

    const written = reviews.update.mock.calls.find((call) => (call[1] as Record<string, unknown>).suggestedFixes !== undefined);
    const kept = (written?.[1] as { suggestedFixes: { fixes: Array<{ file: string }> } }).suggestedFixes.fixes;

    expect(kept.map((f) => f.file)).toEqual(['src/auth/guard.ts']);
  });

  it('records it on the unparseable-output path too, which returns early', async () => {
    const { runner, reviews, reviewedRisk } = build(null);

    await runner.run(1, 1);

    expect(reviews.save).toHaveBeenCalled();
    expect(reviewedRisk.save).toHaveBeenCalledWith(1, 1, expect.objectContaining({ level: expect.any(String) }));
  });

  it('clears the saved risk when the scan fails, instead of leaving the last push\'s', async () => {
    jest.spyOn(riskRadar, 'tryAssessRisk').mockReturnValue(null);
    const { runner, reviewedRisk } = build({ overall_score: 80, summary: 's' });

    await runner.run(1, 1);

    expect(reviewedRisk.save).not.toHaveBeenCalled();
    expect(reviewedRisk.forget).toHaveBeenCalledWith(1);
  });
});

describe('PullRequestReviewRunner coverage', () => {
  const addedFile = (name: string, lines: number): string =>
    `diff --git a/src/${name}.ts b/src/${name}.ts\n--- a/src/${name}.ts\n+++ b/src/${name}.ts\n@@ -1,1 +1,${lines} @@\n` +
    Array.from({ length: lines }, (_, i) => `+const ${name}${i} = ${i};`).join('\n') +
    '\n';

  function build(diff: string, config = { batchChars: 16_000, maxBatches: 8 }) {
    const pullRequests = repo();
    const reviews = repo();

    pullRequests.findOne.mockResolvedValue({
      id: 1,
      prNumber: 7,
      title: 'x',
      author: 'a',
      headBranch: 'f',
      baseBranch: 'main',
      updatedAt: new Date(),
      repository: { fullName: 'o/r', userId: 1, user: { id: 1, githubToken: null } },
    });
    reviews.findOne.mockResolvedValue(null);
    reviews.save.mockResolvedValue({ id: 99 });

    const callWithFallback = jest.fn().mockResolvedValue({
      model: 'groq/test',
      parsed: { overall_score: 95, summary: 'Looks fine.', issues: [] },
      raw: null,
    });
    const runner = new PullRequestReviewRunner(
      pullRequests as never,
      reviews as never,
      repo() as never,
      buildBatchedReview({ callWithFallback }, { config }).service,
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
      { save: jest.fn().mockResolvedValue(undefined), forget: jest.fn().mockResolvedValue(undefined) } as never,
    );

    return { runner, reviews, callWithFallback };
  }

  it('withholds the score and marks the summary when the batch cap left most of the change unread', async () => {
    const diff = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((n) => addedFile(n, 150)).join('');
    // Each file is about 4,000 characters, so 8,000-character batches hold two and one batch reads a quarter.
    const { runner, reviews } = build(diff, { batchChars: 8000, maxBatches: 1 });

    await runner.run(1, 1);

    const saved = reviews.save.mock.calls[0]?.[0] as { overallScore: number | null; summary: string | null };

    expect(saved.overallScore).toBeNull();
    expect(saved.summary?.startsWith(PARTIAL_REVIEW)).toBe(true);
  });

  it('keeps the score and adds no marker when the whole change was read', async () => {
    const { runner, reviews } = build(addedFile('a', 5));

    await runner.run(1, 1);

    const saved = reviews.save.mock.calls[0]?.[0] as { overallScore: number | null; summary: string | null };

    expect(saved.overallScore).toBe(95);
    expect(saved.summary?.startsWith(PARTIAL_REVIEW)).toBe(false);
  });
  it('reviews all of it, with a normal score and no label, when the change needs several batches', async () => {
    const diff = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((n) => addedFile(n, 150)).join('');
    const { runner, reviews, callWithFallback } = build(diff, { batchChars: 8000, maxBatches: 8 });

    await runner.run(1, 1);

    const saved = reviews.save.mock.calls[0]?.[0] as { overallScore: number | null; summary: string | null };

    expect(callWithFallback).toHaveBeenCalledTimes(4);
    expect(saved.overallScore).toBe(95);
    expect(saved.summary?.startsWith(PARTIAL_REVIEW)).toBe(false);
    expect(saved.summary).not.toContain('Reviewed');
  });
});
