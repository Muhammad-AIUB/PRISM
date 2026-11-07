import type { BatchResult } from '../../ai/batch-merge';
import { PromptBuilderService } from '../../ai/prompt-builder.service';
import type { PaceClock } from '../../ai/token-pacer';
import { BatchedReviewService, type BatchReviewOptions } from './batched-review.service';
import type { CheckpointRef } from './review-checkpoint.store';

/**
 * Test doubles for the batched review, shared by the service's own spec and the
 * two runners' specs. Not part of the application; Jest never runs this file.
 */
export class InMemoryCheckpoints {
  readonly saved = new Map<string, Map<number, BatchResult>>();
  readonly cleared: string[] = [];

  private key(ref: CheckpointRef): string {
    return `${ref.kind}:${ref.id}`;
  }

  load(ref: CheckpointRef): Promise<Map<number, BatchResult>> {
    return Promise.resolve(new Map(this.saved.get(this.key(ref)) ?? []));
  }

  save(ref: CheckpointRef, _fingerprint: string, result: BatchResult): Promise<boolean> {
    const batches = this.saved.get(this.key(ref)) ?? new Map<number, BatchResult>();

    batches.set(result.index, result);
    this.saved.set(this.key(ref), batches);

    return Promise.resolve(true);
  }

  clear(ref: CheckpointRef): Promise<void> {
    this.cleared.push(this.key(ref));
    this.saved.delete(this.key(ref));

    return Promise.resolve();
  }
}

export function fakeClock(): PaceClock & { time: number; slept: number[] } {
  const clock = {
    time: 0,
    slept: [] as number[],
    now: () => clock.time,
    sleep: (ms: number) => {
      clock.slept.push(ms);
      clock.time += ms;

      return Promise.resolve();
    },
  };

  return clock;
}

/** A real service with a fake clock, no Groq pacing, no own key by default and in-memory checkpoints. */
export function buildBatchedReview(
  aiClient: unknown,
  overrides: Partial<BatchReviewOptions> = {},
  checkpoints: InMemoryCheckpoints = new InMemoryCheckpoints(),
  /** What `UserAiSettingsService.resolve` returns: null (the default) is a user without their own key. */
  ownKeySetting: unknown = null,
): { service: BatchedReviewService; checkpoints: InMemoryCheckpoints; clock: ReturnType<typeof fakeClock> } {
  const clock = fakeClock();
  const service = new BatchedReviewService(
    aiClient as never,
    new PromptBuilderService(),
    { resolve: jest.fn().mockResolvedValue(ownKeySetting) } as never,
    checkpoints as never,
    {
      clock,
      groqPace: {
        tokensPerMinute: Number.POSITIVE_INFINITY,
        charsPerToken: 3.5,
        promptOverheadTokens: 800,
        assumedOutputTokens: 1200,
        maxWaitMs: 60_000,
      },
      ...overrides,
    },
  );

  return { service, checkpoints, clock };
}
