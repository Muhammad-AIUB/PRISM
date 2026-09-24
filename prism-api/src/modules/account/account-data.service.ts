import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { Repository as OrmRepository } from 'typeorm';
import { PullRequest, type User } from '../../database/entities';
import { summarise, type BlueprintSummary } from '../../design/blueprint';
import { DesignStore } from '../design/design.store';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { ReviewRiskStore } from '../risk/review-risk.store';
import { ERASURE_MARKER_TTL_SECONDS, erasureMarkerKey } from './erasure-marker';

/**
 * A user's data that lives outside Postgres, in one place.
 *
 * Deleting the `users` row cascades through every table, which is how account
 * deletion has always worked. It cannot reach Redis, where Design Studio keeps
 * design briefs (30 days) and Risk Radar keeps per-PR assessments (90 days).
 * Every path that deletes an account, and the "my data" export, goes through
 * here so a new store cannot be forgotten by one of them.
 */
@Injectable()
export class AccountDataService {
  private readonly logger = new Logger(AccountDataService.name);

  constructor(
    @InjectRepository(PullRequest)
    private readonly pullRequests: OrmRepository<PullRequest>,
    private readonly designs: DesignStore,
    private readonly reviewedRisk: ReviewRiskStore,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Erase it, before the caller deletes anything irreversible. On failure this
   * throws and the caller stops: telling someone their data is gone while it
   * is still stored would be the worse outcome than asking them to retry.
   */
  async erase(user: User): Promise<void> {
    try {
      // Before any purge: from here every store refuses new writes for this
      // user, so work in flight (a review, a generation) cannot re-create what
      // is about to be erased. See erasure-marker.ts.
      await this.redis.set(erasureMarkerKey(user.id), '1', 'EX', ERASURE_MARKER_TTL_SECONDS);

      const ids = await this.pullRequestIds(user.id);

      await this.reviewedRisk.purge(ids);
      await this.designs.purgeOwner(user.id);
    } catch (error) {
      this.logger.error(
        `Account data erasure failed (user_id=${user.id}): ${error instanceof Error ? error.message : String(error)}`,
      );

      throw new ServiceUnavailableException(
        'We could not delete all of your data just now, so nothing was deleted. Please try again in a minute.',
      );
    }
  }

  /**
   * For the "my data" page: what is held outside the database.
   *
   * Never throws. The page's core is Postgres, and a Redis outage must cost
   * these figures (reported as null, "unavailable") rather than the whole page.
   * Zero would be worse than null here: it would tell someone they have
   * nothing stored when the truth is that we could not look.
   */
  async summary(user: User): Promise<{
    saved_designs: number | null;
    designs: BlueprintSummary[] | null;
    saved_risk_assessments: number | null;
  }> {
    try {
      const ids = await this.pullRequestIds(user.id);
      const [savedDesigns, designs, savedRisk] = await Promise.all([
        this.designs.count(user.id),
        this.designs.list(user.id),
        this.reviewedRisk.count(ids),
      ]);

      return {
        saved_designs: savedDesigns,
        designs: designs.map(summarise),
        saved_risk_assessments: savedRisk,
      };
    } catch (error) {
      this.logger.warn(
        `Account data summary unavailable (user_id=${user.id}): ${error instanceof Error ? error.message : String(error)}`,
      );

      return { saved_designs: null, designs: null, saved_risk_assessments: null };
    }
  }

  /** Read while the rows still exist: they cascade away with the user. */
  private async pullRequestIds(userId: number): Promise<number[]> {
    const rows = await this.pullRequests
      .createQueryBuilder('pr')
      .innerJoin('pr.repository', 'repo')
      .where('repo.user_id = :userId', { userId })
      .select('pr.id', 'id')
      .getRawMany<{ id: string | number }>();

    return rows.map((row) => Number(row.id));
  }
}
