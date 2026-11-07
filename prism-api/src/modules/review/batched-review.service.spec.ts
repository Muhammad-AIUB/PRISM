import { RateLimitedError } from '../../ai/ai-client.service';
import { buildBatchedReview, InMemoryCheckpoints } from './batched-review.testing';
import type { BatchedReviewInput } from './batched-review.service';

/** About 1,250 characters per file: with batchChars 1500, one file per batch. */
const file = (name: string): string =>
  `diff --git a/${name} b/${name}\n--- a/${name}\n+++ b/${name}\n@@ -1,1 +1,71 @@\n ctx\n` +
  Array.from({ length: 70 }, (_, i) => `+const v${i} = ${i};`).join('\n') +
  '\n';

const diffOf = (...names: string[]): string => names.map(file).join('');
const REF = { kind: 'pr', id: 1, ownerId: 5 } as const;
const OPTIONS = { config: { batchChars: 1500, maxBatches: 3 } };

const input = (diffBody: string, extra: Partial<BatchedReviewInput> = {}): BatchedReviewInput => ({
  diffBody,
  languages: ['TypeScript'],
  target: 'pull request',
  lead: 'Review this diff',
  context: 'pr_review',
  ref: REF,
  risk: null,
  ...extra,
});

/** A model that reports its batch's first changed line, found through the anchor in the message. */
function model(extra: Record<string, unknown> = {}) {
  return jest.fn(async (_system: string, user: string) => {
    const anchor = /\[(\d+)\]/.exec(user)?.[1];

    return {
      model: 'groq/test',
      raw: null,
      parsed: {
        overall_score: 90,
        summary: 'ok',
        code_quality_issues: [
          { line: Number(anchor), category: 'other', severity: 'warning', comment: 'check this' },
        ],
        ...extra,
      },
    };
  });
}

describe('BatchedReviewService', () => {
  it('makes one call per batch and says which part each is, but nothing extra for a single batch', async () => {
    const ai = { callWithFallback: model() };
    const { service } = buildBatchedReview(ai, OPTIONS);

    await service.review(input(diffOf('a.ts', 'b.ts')));

    expect(ai.callWithFallback).toHaveBeenCalledTimes(2);
    expect(ai.callWithFallback.mock.calls[1]?.[1]).toContain('Review this diff (part 2 of 2 of one change');

    const single = { callWithFallback: model() };

    await buildBatchedReview(single, OPTIONS).service.review(input(diffOf('a.ts')));

    expect(single.callWithFallback.mock.calls[0]?.[1].startsWith('Review this diff:\n')).toBe(true);
  });

  it('validates each batch against its own anchors, so every finding lands in its own file', async () => {
    const { service } = buildBatchedReview({ callWithFallback: model() }, OPTIONS);
    const outcome = await service.review(input(diffOf('a.ts', 'b.ts', 'c.ts')));

    if (outcome.status !== 'reviewed') throw new Error('expected a review');

    // Every batch's first anchor is [1]; only per-batch maps keep these three apart.
    expect(outcome.merged.layers.code_quality.map((i) => i.file)).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(outcome.merged.dropped).toBe(0);
    expect(outcome.coverageRatio).toBe(1);
    expect(outcome.coverage).toBeNull();
  });

  it('rejects an anchor id that only exists in another batch', async () => {
    const ai = {
      callWithFallback: jest.fn(async (_s: string, user: string) => ({
        model: 'groq/test',
        raw: null,
        // Batch 2 cites an id that exists only in a longer batch 1.
        parsed: {
          overall_score: 80,
          summary: 's',
          code_quality_issues: [{ line: user.includes('part 2') ? 71 : 1, category: 'other', severity: 'warning', comment: 'c' }],
        },
      })),
    };
    const { service } = buildBatchedReview(ai, OPTIONS);
    const outcome = await service.review(input(diffOf('a.ts', 'b.ts')));

    if (outcome.status !== 'reviewed') throw new Error('expected a review');

    // Batch 1's finding resolves; batch 2's [71] is unknown in batch 2's own map and is dropped.
    expect(outcome.merged.layers.code_quality).toHaveLength(1);
    expect(outcome.merged.dropped).toBe(1);
  });

  it('reports the files past the cap through the coverage ratio and sentence', async () => {
    const { service } = buildBatchedReview({ callWithFallback: model() }, OPTIONS);
    const outcome = await service.review(input(diffOf('a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts')));

    if (outcome.status !== 'reviewed') throw new Error('expected a review');

    expect(outcome.batches).toEqual({ total: 3, reviewed: 3 });
    expect(outcome.coverageRatio).toBeCloseTo(0.6);
    expect(outcome.coverage).toBe('Reviewed 3 of 5 changed files.');
  });

  it('resumes from checkpoints instead of repeating paid calls', async () => {
    const ai = { callWithFallback: model() };
    const checkpoints = new InMemoryCheckpoints();
    const first = buildBatchedReview({ callWithFallback: model() }, OPTIONS, checkpoints);

    await first.service.review(input(diffOf('a.ts', 'b.ts', 'c.ts')));
    checkpoints.saved.get('pr:1')?.delete(2);

    const outcome = await buildBatchedReview(ai, OPTIONS, checkpoints).service.review(input(diffOf('a.ts', 'b.ts', 'c.ts')));

    expect(ai.callWithFallback).toHaveBeenCalledTimes(1);
    expect(ai.callWithFallback.mock.calls[0]?.[1]).toContain('part 3 of 3');
    expect(outcome.status === 'reviewed' && outcome.merged.kept).toBe(3);
  });

  it('saves each batch before the next call, so a failure on batch 3 loses nothing', async () => {
    const ai = {
      callWithFallback: jest
        .fn()
        .mockImplementationOnce(model())
        .mockImplementationOnce(model())
        .mockRejectedValueOnce(new Error('socket hang up')),
    };
    const { service, checkpoints } = buildBatchedReview(ai, OPTIONS);

    await expect(service.review(input(diffOf('a.ts', 'b.ts', 'c.ts')))).rejects.toThrow('socket hang up');
    expect([...(checkpoints.saved.get('pr:1')?.keys() ?? [])]).toEqual([0, 1]);
  });

  it('ends partial, with what exists, when a rate limit hits after the first batch', async () => {
    const ai = {
      callWithFallback: jest.fn().mockImplementationOnce(model()).mockRejectedValueOnce(new RateLimitedError('groq/x')),
    };
    const { service } = buildBatchedReview(ai, OPTIONS);
    const outcome = await service.review(input(diffOf('a.ts', 'b.ts', 'c.ts')));

    if (outcome.status !== 'reviewed') throw new Error('expected a review');

    expect(outcome.stopped).toBe('rate_limited');
    expect(outcome.batches).toEqual({ total: 3, reviewed: 1 });
    expect(outcome.coverageRatio).toBeCloseTo(1 / 3);
    expect(outcome.coverage).toBe('Reviewed 1 of 3 changed files.');
  });

  it('throws when the very first batch is rate limited, so BullMQ backs off as before', async () => {
    const ai = { callWithFallback: jest.fn().mockRejectedValue(new RateLimitedError('groq/x')) };

    await expect(buildBatchedReview(ai, OPTIONS).service.review(input(diffOf('a.ts', 'b.ts')))).rejects.toBeInstanceOf(
      RateLimitedError,
    );
  });

  it('reports nothing usable when no batch parsed, with the last raw text', async () => {
    const ai = { callWithFallback: jest.fn().mockResolvedValue({ model: 'groq/x', parsed: null, raw: 'oops' }) };
    const outcome = await buildBatchedReview(ai, OPTIONS).service.review(input(diffOf('a.ts', 'b.ts')));

    expect(outcome).toEqual({ status: 'unusable', raw: 'oops', model: 'groq/x' });
  });

  it('skips a batch that times out and lowers coverage instead of failing the review', async () => {
    const ai = {
      callWithFallback: jest.fn(async (_s: string, user: string, _c: string, signal: AbortSignal) => {
        if (user.includes('part 2')) {
          await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error(String(signal.reason)))));
        }

        return model()(_s, user);
      }),
    };
    const { service } = buildBatchedReview(ai, { ...OPTIONS, batchTimeoutMs: 20 });
    const outcome = await service.review(input(diffOf('a.ts', 'b.ts', 'c.ts')));

    if (outcome.status !== 'reviewed') throw new Error('expected a review');

    expect(outcome.batches).toEqual({ total: 3, reviewed: 2 });
    expect(outcome.selection.skipped).toEqual(['b.ts']);
  });

  it('stops at once when the job deadline passes, before another paid call or save', async () => {
    const controller = new AbortController();
    const ai = {
      callWithFallback: jest.fn(async (...args: [string, string]) => {
        controller.abort(new Error('job budget spent'));

        return model()(...args);
      }),
    };
    const { service, checkpoints } = buildBatchedReview(ai, OPTIONS);

    await expect(
      service.review(input(diffOf('a.ts', 'b.ts', 'c.ts'), { signal: controller.signal })),
    ).rejects.toThrow('job budget spent');
    expect(ai.callWithFallback).toHaveBeenCalledTimes(1);
    expect(checkpoints.saved.size).toBe(0);
  });

  it('paces the second large batch against the per-minute allowance', async () => {
    const ai = { callWithFallback: model() };
    const { service, clock } = buildBatchedReview(ai, {
      config: { batchChars: 16_000, maxBatches: 3 },
      groqPace: {
        tokensPerMinute: 4000,
        charsPerToken: 3.5,
        promptOverheadTokens: 800,
        assumedOutputTokens: 1200,
        maxWaitMs: 60_000,
      },
    });
    // About 8,000 characters each: two do not fit one 16,000-character batch, so each gets its own call.
    const big = (name: string): string => `${file(name)}+${'x'.repeat(7000)}\n`;

    await service.review(input(big('a.ts') + big('b.ts') + big('c.ts')));

    expect(clock.slept.length).toBeGreaterThanOrEqual(1);
  });

  const TIGHT = {
    tokensPerMinute: 4000,
    charsPerToken: 3.5,
    promptOverheadTokens: 800,
    assumedOutputTokens: 1200,
    maxWaitMs: 60_000,
  };
  // About 8,000 characters each: every file gets its own 16,000-character batch.
  const big = (name: string): string => `${file(name)}+${'x'.repeat(7000)}
`;
  const LARGE = { config: { batchChars: 16_000, maxBatches: 3 }, groqPace: TIGHT };

  it('does not pace a user with their own key, while the default user is paced', async () => {
    const diff = big('a.ts') + big('b.ts') + big('c.ts');
    const own = buildBatchedReview({ callWithFallback: model() }, LARGE, undefined, { provider: 'openai' });
    const plain = buildBatchedReview({ callWithFallback: model() }, LARGE);

    await own.service.review(input(diff));
    await plain.service.review(input(diff));

    expect(own.clock.slept).toEqual([]);
    expect(plain.clock.slept.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects, with no checkpoint for that batch, when the deadline passes while the pacer is sleeping', async () => {
    const controller = new AbortController();
    const ai = { callWithFallback: model() };
    const { service, checkpoints, clock } = buildBatchedReview(ai, LARGE);

    clock.sleep = (_ms: number, signal?: AbortSignal) => {
      controller.abort(new Error('job budget spent'));

      return Promise.reject(signal?.reason as Error);
    };

    await expect(
      service.review(input(big('a.ts') + big('b.ts') + big('c.ts'), { signal: controller.signal })),
    ).rejects.toThrow('job budget spent');
    expect(ai.callWithFallback).toHaveBeenCalledTimes(1);
    expect([...(checkpoints.saved.get('pr:1')?.keys() ?? [])]).toEqual([0]);
  });

  it('keeps the checkpoint out of a re-analyze: finish() clears it', async () => {
    const { service, checkpoints } = buildBatchedReview({ callWithFallback: model() }, OPTIONS);

    await service.finish(REF);

    expect(checkpoints.cleared).toEqual(['pr:1']);
  });
});
