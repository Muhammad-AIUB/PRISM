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
   * Deletes an account: everything held in Redis, then whatever `deleteRows`
   * removes (the users row, which cascades through Postgres, plus any step the
   * caller must do while the row still exists, such as uninstalling webhooks).
   *
   * The erasure marker lives exactly as long as the attempt. It is set first,
   * so work in flight cannot re-create what is being erased, and it is removed
   * if any step fails, because an attempt that failed has not deleted the
   * account: left in place, the marker would make the surviving account refuse
   * new designs and skip saving review risk for an hour.
   *
   * On success it is left to expire on its own. The user id is never reused
   * and a review still running for it may yet try to save; the marker is what
   * refuses that write.
   */
  async deleteAccount(user: User, deleteRows: () => Promise<void>): Promise<void> {
    const marker = erasureMarkerKey(user.id);

    try {
      // Before any purge: from here every store refuses new writes for this
      // user, so work in flight (a review, a generation) cannot re-create what
      // is about to be erased. See erasure-marker.ts.
      await this.redis.set(marker, '1', 'EX', ERASURE_MARKER_TTL_SECONDS);

      const ids = await this.pullRequestIds(user.id);

      await this.reviewedRisk.purge(ids);
      await this.designs.purgeOwner(user.id);
      await deleteRows();
    } catch (error) {
      this.logger.error(
        `Account deletion failed (user_id=${user.id}): ${error instanceof Error ? error.message : String(error)}`,
      );

      await this.redis.del(marker).catch((cleanupError: unknown) =>
        this.logger.error(
          `Could not clear the erasure marker after a failed deletion (user_id=${user.id}); ` +
            `it expires within ${ERASURE_MARKER_TTL_SECONDS}s: ${String(cleanupError)}`,
        ),
      );

      // Deliberately not "nothing was deleted": saved risk assessments may
      // already be gone by the time a later step fails. They are derived from
      // the reviews and regenerate on the next one; the account itself, and
      // everything the user created, is intact.
      throw new ServiceUnavailableException(
        'We could not finish deleting your account, so it has not been deleted. Please try again in a minute.',
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
