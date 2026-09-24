import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import type { RiskAssessment } from '../../diff/risk-radar';
import { REDIS_CLIENT } from '../../redis/redis.constants';

/**
 * The Risk Radar assessment of the exact diff a pull-request review read.
 *
 * A pull request's diff moves with every push, and the page keeps showing the
 * previous review until the next one completes. Recomputing risk from the live
 * pull request in that window would put a verdict about one revision next to a
 * risk panel about another. So the runner writes the assessment of the diff it
 * reviewed, here, and the review pages read it back.
 *
 * Commits need none of this: a commit's diff is immutable per SHA.
 *
 * Redis rather than a column on `reviews`, for the same reason Design Studio
 * uses it: a new column is hand-applied DDL. The TTL outlives the diff cache
 * by far; past it, the page falls back to a live assessment and says so.
 */
export const REVIEW_RISK_TTL_SECONDS = 90 * 24 * 60 * 60;

@Injectable()
export class ReviewRiskStore {
  private readonly logger = new Logger(ReviewRiskStore.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Never throws: losing this costs the page its reviewed-revision risk, not the review. */
  async save(pullRequestId: number, risk: RiskAssessment): Promise<void> {
    try {
      await this.redis.set(this.key(pullRequestId), JSON.stringify(risk), 'EX', REVIEW_RISK_TTL_SECONDS);
    } catch (error) {
      this.logger.warn(`Review risk save failed (pr_id=${pullRequestId}): ${this.messageOf(error)}`);
    }
  }

  /** Null when absent, expired or unreadable; the caller falls back and labels it. */
  async find(pullRequestId: number): Promise<RiskAssessment | null> {
    try {
      const raw = await this.redis.get(this.key(pullRequestId));

      return raw === null ? null : (JSON.parse(raw) as RiskAssessment);
    } catch (error) {
      this.logger.warn(`Review risk read failed (pr_id=${pullRequestId}): ${this.messageOf(error)}`);

      return null;
    }
  }

  async forget(pullRequestId: number): Promise<void> {
    try {
      await this.redis.del(this.key(pullRequestId));
    } catch (error) {
      this.logger.warn(`Review risk delete failed (pr_id=${pullRequestId}): ${this.messageOf(error)}`);
    }
  }

  /**
   * For account erasure. Unlike forget(), this throws: the caller is about to
   * tell someone their data is gone and must not if it is not.
   */
  async purge(pullRequestIds: number[]): Promise<void> {
    if (pullRequestIds.length > 0) {
      await this.redis.del(...pullRequestIds.map((id) => this.key(id)));
    }
  }

  /** How many saved assessments exist for these pull requests. */
  async count(pullRequestIds: number[]): Promise<number> {
    return pullRequestIds.length === 0
      ? 0
      : this.redis.exists(...pullRequestIds.map((id) => this.key(id)));
  }

  private key(pullRequestId: number): string {
    return `review-risk:pr:${pullRequestId}`;
  }

  private messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
