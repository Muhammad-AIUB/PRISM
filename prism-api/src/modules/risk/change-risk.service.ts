import { BadGatewayException, Injectable } from '@nestjs/common';
import { DiffCacheService } from '../../cache/diff-cache.service';
import { CryptService } from '../../common/utils/crypt.service';
import type { CommitReview, PullRequest, User } from '../../database/entities';
import { assessRisk, type RiskAssessment } from '../../diff/risk-radar';
import { GithubClientService } from '../../github/github-client.service';

/**
 * Risk Radar on demand, for the review pages and the MCP server.
 *
 * Reads the diff through the same cache keys the review runners write, so
 * opening a review shortly after it ran costs no GitHub call at all, and a
 * risk panel can never describe a different diff than the one reviewed.
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
  ) {}

  async forPullRequest(owner: User, pr: PullRequest): Promise<RiskAssessment> {
    const diff = await this.load(
      this.diffCache.pullRequestKey(pr.id, pr.headBranch, pr.updatedAt),
      (token) => this.github.fetchPullRequestDiff(token, pr.repository.fullName, pr.prNumber),
      owner,
    );

    return assessRisk(diff);
  }

  async forCommit(owner: User, commit: CommitReview): Promise<RiskAssessment> {
    const diff = await this.load(
      this.diffCache.commitKey(commit.repositoryId, commit.commitSha),
      (token) =>
        this.github.fetchCommitDiff(token, commit.repository.fullName, commit.commitSha),
      owner,
    );

    return assessRisk(diff);
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
