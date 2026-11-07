import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AiClientService, RateLimitedError, type AiCallContext, type FallbackAiResult } from '../../ai/ai-client.service';
import { mergeBatchResults, type BatchResult, type MergedReview } from '../../ai/batch-merge';
import { droppedCount, validateLayers } from '../../ai/issue-validator';
import { clampScore } from '../../ai/json-extractor';
import { PromptBuilderService, type ReviewTarget } from '../../ai/prompt-builder.service';
import { FixesService } from '../../ai/fixes.service';
import { TokenPacer, systemClock, type PaceClock, type PaceProfile } from '../../ai/token-pacer';
import { UserAiSettingsService } from '../../ai/user-ai-settings.service';
import { packForReview, selectionFor, type BatchConfig } from '../../diff/batch-pack';
import { coverageRatio, type Selection } from '../../diff/file-selection';
import { mergeHunkIndexes, type HunkIndex } from '../../diff/hunk-index';
import { coverageSentence, prepareBatch } from '../../diff/prepare';
import type { RiskAssessment } from '../../diff/risk-radar';
import { riskRankOf } from '../../diff/risk-rank';
import {
  BATCH_CONFIG,
  BATCH_WORST_CASE_MS,
  CHECKPOINT_VERSION,
  GROQ_FREE_PACE,
  MAX_MERGED_FINDINGS,
  OWN_KEY_PACE,
} from './batching.config';
import { ReviewCheckpointStore, type CheckpointRef } from './review-checkpoint.store';

/**
 * Reviews every reviewable file of a change: one model call per batch, each
 * validated against its own anchors, merged into one result.
 *
 * Both runners call this and only this for the review pass, which is what keeps
 * `pr-review.runner.ts` and `commit-review.runner.ts` from drifting apart over
 * the new logic. They still own their persistence, comment text and
 * notifications.
 *
 * The rules, each with the reason it exists:
 *  - Anchors are per batch. A finding is accepted only if it names an anchor
 *    shown in the same call, so validation is as strict as ADR 0006 (an id from
 *    another batch is unknown).
 *  - Nothing paid is repeated. Each validated batch is checkpointed before the
 *    next call, so a retry resumes. Saving is idempotent.
 *  - The job deadline (`signal`) is checked before every call and every save,
 *    and a retry is safe at any of those points.
 *  - A 429 that outlasts the model chain ends the review with what exists. If
 *    nothing exists yet it throws, so BullMQ's backoff retries as it always did.
 *  - A batch that times out or returns nothing usable is skipped, not fatal;
 *    coverage then says so honestly.
 */
export interface BatchedReviewInput {
  diffBody: string;
  languages: string[];
  target: ReviewTarget;
  /** "Review this diff" or "Review this commit diff": the sentence the single-call message always began with. */
  lead: string;
  context: AiCallContext;
  ref: CheckpointRef;
  /** For ordering files by risk when the change is over the call cap. */
  risk: RiskAssessment | null;
  signal?: AbortSignal;
}

export type BatchedOutcome =
  | {
      status: 'reviewed';
      merged: MergedReview;
      /** What the model saw, whole or in part. Feeds the fixes pass and the coverage text. */
      selection: Selection;
      index: HunkIndex;
      coverageRatio: number;
      coverage: string | null;
      /** Set when a rate limit ended the review early. */
      stopped: 'rate_limited' | null;
      batches: { total: number; reviewed: number };
    }
  | {
      /** No batch produced a usable review: the runners write the "not reviewed" summary. */
      status: 'unusable';
      raw: string | null;
      model: string | null;
    };

export interface BatchReviewOptions {
  config: BatchConfig;
  clock: PaceClock;
  groqPace: PaceProfile;
  ownKeyPace: PaceProfile;
  maxFindings: number;
  batchTimeoutMs: number;
}

export const BATCH_REVIEW_OPTIONS = Symbol('BATCH_REVIEW_OPTIONS');

@Injectable()
export class BatchedReviewService {
  private readonly logger = new Logger(BatchedReviewService.name);
  private readonly options: BatchReviewOptions;

  constructor(
    private readonly aiClient: AiClientService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly userAi: UserAiSettingsService,
    private readonly checkpoints: ReviewCheckpointStore,
    @Optional() @Inject(BATCH_REVIEW_OPTIONS) overrides?: Partial<BatchReviewOptions>,
  ) {
    this.options = {
      config: BATCH_CONFIG,
      clock: systemClock,
      groqPace: GROQ_FREE_PACE,
      ownKeyPace: OWN_KEY_PACE,
      maxFindings: MAX_MERGED_FINDINGS,
      batchTimeoutMs: BATCH_WORST_CASE_MS,
      ...overrides,
    };
  }

  async review(input: BatchedReviewInput): Promise<BatchedOutcome> {
    const { signal } = input;
    const packed = packForReview(input.diffBody, this.options.config, riskRankOf(input.risk));
    const total = packed.batches.length;
    const fingerprint = this.fingerprint(input.diffBody);
    const saved = await this.checkpoints.load(input.ref, fingerprint);
    const system = this.promptBuilder.buildSystemPrompt(input.languages, input.target);
    const own = await this.userAi.resolve(input.ref.ownerId);
    const pacer = new TokenPacer(own ? this.options.ownKeyPace : this.options.groqPace, this.options.clock);
    const results: BatchResult[] = [];
    const indexes: HunkIndex[] = [];
    let stopped: 'rate_limited' | null = null;
    let rateLimit: RateLimitedError | null = null;
    let lastRaw: string | null = null;
    let lastModel: string | null = null;

    for (const batch of packed.batches) {
      const prepared = prepareBatch(batch.text);
      const cached = saved.get(batch.index);

      if (cached) {
        results.push(cached);
        indexes.push(prepared.index);
        continue;
      }

      signal?.throwIfAborted();
      await pacer.acquire(pacer.estimate(prepared.body.length), signal);

      const deadline = AbortSignal.timeout(this.options.batchTimeoutMs);
      const batchSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
      let answer: FallbackAiResult;

      try {
        answer = await this.aiClient.callWithFallback(
          system,
          this.userMessage(input.lead, batch.index, total, prepared.body),
          input.context,
          batchSignal,
          { userId: input.ref.ownerId },
        );
      } catch (error) {
        // The whole job is out of budget: stop, the retry resumes from the checkpoints.
        if (signal?.aborted) {
          throw error;
        }

        if (error instanceof RateLimitedError) {
          stopped = 'rate_limited';
          rateLimit = error;
          break;
        }

        if (deadline.aborted) {
          this.logger.warn(`Batch ${batch.index + 1} of ${total} timed out (${input.ref.kind}_id=${input.ref.id})`);
          continue;
        }

        throw error;
      }

      lastModel = answer.model ?? lastModel;

      if (!answer.parsed) {
        lastRaw = answer.raw;
        continue;
      }

      // Checked against THIS batch's anchors only.
      const layers = validateLayers(FixesService.layersFrom(answer.parsed), prepared.anchors);
      const dropped = droppedCount(layers);
      const result: BatchResult = {
        index: batch.index,
        model: answer.model ?? 'multi-fallback',
        security: layers.security,
        performance: layers.performance,
        code_quality: layers.code_quality,
        dropped,
        score: clampScore(answer.parsed.overall_score),
        summary: typeof answer.parsed.summary === 'string' ? answer.parsed.summary : null,
      };

      if (dropped > 0) {
        this.logger.log(
          `issue_validation ${JSON.stringify({
            [`${input.ref.kind}_id`]: input.ref.id,
            batch: batch.index + 1,
            kept: layers.kept,
            dropped,
            reasons: layers.reasons,
          })}`,
        );
      }

      // Safe to repeat: the same batch saved twice writes the same field.
      signal?.throwIfAborted();
      await this.checkpoints.save(input.ref, fingerprint, result);
      results.push(result);
      indexes.push(prepared.index);
    }

    if (results.length === 0) {
      // Nothing reviewed because the provider would not talk to us: fail the
      // attempt so the existing backoff retries it (known issue T13 unchanged).
      if (rateLimit) {
        throw rateLimit;
      }

      return { status: 'unusable', raw: lastRaw, model: lastModel };
    }

    const selection = selectionFor(packed, new Set(results.map((r) => r.index)));

    if (stopped) {
      this.logger.warn(
        `Review ended early by a rate limit with ${results.length} of ${total} batches (${input.ref.kind}_id=${input.ref.id})`,
      );
    }

    return {
      status: 'reviewed',
      merged: mergeBatchResults(results, this.options.maxFindings),
      selection,
      index: mergeHunkIndexes(indexes),
      coverageRatio: coverageRatio(selection),
      coverage: coverageSentence(selection),
      stopped,
      batches: { total, reviewed: results.length },
    };
  }

  /** Called once the review is finished, so re-analyzing the same diff starts fresh. */
  finish(ref: CheckpointRef): Promise<void> {
    return this.checkpoints.clear(ref);
  }

  /** One batch reads exactly as the single-call message always did; several say which part they are. */
  private userMessage(lead: string, index: number, total: number, body: string): string {
    const part = total > 1 ? ` (part ${index + 1} of ${total} of one change; the other parts are reviewed separately)` : '';

    return `${lead}${part}:\n${body}`;
  }

  /** The diff and the batching settings: a new push or a retuned size never resumes from batches cut differently. */
  private fingerprint(diffBody: string): string {
    const { batchChars, maxBatches } = this.options.config;

    return createHash('sha256')
      .update(`${CHECKPOINT_VERSION}|${batchChars}|${maxBatches}|`)
      .update(diffBody)
      .digest('hex')
      .slice(0, 16);
  }
}
