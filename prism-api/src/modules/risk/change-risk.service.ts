import { BadGatewayException, Injectable } from '@nestjs/common';
import { DiffCacheService } from '../../cache/diff-cache.service';
import { CryptService } from '../../common/utils/crypt.service';
import type { CommitReview, PullRequest, User } from '../../database/entities';
import { assessRisk, type RiskAssessment } from '../../diff/risk-radar';
import { GithubClientService } from '../../github/github-client.service';
import { ReviewRiskStore } from './review-risk.store';

/**
 * Which revision an assessment describes.
 *
 *   reviewed  the exact diff the review on the page read
 *   current   the pull request's head right now, which may be a later push
 *             than the review shows; only served when no reviewed-revision
 *             assessment exists (reviews older than this feature, or expired)
 */
export type RiskBasis = 'reviewed' | 'current';

export interface ChangeRisk {
  risk: RiskAssessment;
  basis: RiskBasis;
}

/**
 * Risk Radar for the review pages and the MCP server.
 *
 * A pull request's risk comes from ReviewRiskStore, written by the runner from
 * the diff it reviewed, so it always matches the verdict beside it. Only when
 * that is missing is the live diff assessed, through the runners' cache keys,
 * and the answer is labelled `current` rather than passed off as the reviewed
 * revision. A commit's diff is immutable per SHA, so it is always `reviewed`.
 *
 * Callers must have already established that `owner` owns the row. That check
 * lives with each caller's own lookup because the two surfaces answer a
 * missing or foreign row differently, and that difference is a contract.
 */
@Injectable()
export class ChangeRiskService {
  constructor(
    private readonly diffCache: DiffCacheService,
    private readonly github: GithubClientService,
    private readonly crypt: CryptService,
    private readonly reviewed: ReviewRiskStore,
  ) {}

  async forPullRequest(owner: User, pr: PullRequest): Promise<ChangeRisk> {
    const stored = await this.reviewed.find(pr.id);

    if (stored) {
      return { risk: stored, basis: 'reviewed' };
    }

    const diff = await this.load(
      this.diffCache.pullRequestKey(pr.id, pr.headBranch, pr.updatedAt),
      (token) => this.github.fetchPullRequestDiff(token, pr.repository.fullName, pr.prNumber),
      owner,
    );

    return { risk: assessRisk(diff), basis: 'current' };
  }

  async forCommit(owner: User, commit: CommitReview): Promise<ChangeRisk> {
    const diff = await this.load(
      this.diffCache.commitKey(commit.repositoryId, commit.commitSha),
      (token) =>
        this.github.fetchCommitDiff(token, commit.repository.fullName, commit.commitSha),
      owner,
    );

    return { risk: assessRisk(diff), basis: 'reviewed' };
  }

  private async load(
    key: string,
    fetcher: (token: string) => Promise<string>,
    owner: User,
  ): Promise<string> {
    const token = this.crypt.decrypt(owner.githubToken ?? null) ?? '';

    try {
      return await this.diffCache.remember(key, () => fetcher(token));
    } catch (error) {
      // The client throws "Failed to fetch diff: <status>". A 502 with that
      // status in words is honest about whose failure it was; a 500 is not.
      const status = /(\d{3})\s*$/.exec(error instanceof Error ? error.message : '')?.[1];

      throw new BadGatewayException(
        `Could not fetch the diff from GitHub${status ? ` (HTTP ${status})` : ''}.`,
      );
    }
  }
}
