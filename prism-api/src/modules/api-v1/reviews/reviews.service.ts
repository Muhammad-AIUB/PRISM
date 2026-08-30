import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository as OrmRepository } from 'typeorm';
import { AuditLogService } from '../../../audit/audit-log.service';
import { DiffCacheService } from '../../../cache/diff-cache.service';
import { toIso8601String } from '../../../common/utils/iso8601';
import { ReviewQueueService } from '../../review/review-queue.service';
import {
  CommitReview,
  PullRequest,
  Repository as RepositoryEntity,
  User,
} from '../../../database/entities';
import type { ListReviewsQuery } from './dto/list-reviews.query';
import type {
  CommitDetailDto,
  CommitSummaryDto,
  LatestReviewResponseDto,
  ListReviewsResponseDto,
  MeResponseDto,
  PullRequestDetailDto,
  PullRequestSummaryDto,
  ReviewSummaryDto,
  ShowReviewResponseDto,
} from './dto/review-response.dto';

/**
 * Port of App\Http\Controllers\Api\ReviewApiController.
 *
 * Every query is scoped to repositories owned by the token's user - the same
 * invariant the Laravel controller enforced, restated here because it is the
 * only thing standing between two tenants' review data.
 */
@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(RepositoryEntity)
    private readonly repositories: OrmRepository<RepositoryEntity>,
    @InjectRepository(CommitReview)
    private readonly commitReviews: OrmRepository<CommitReview>,
    @InjectRepository(PullRequest)
    private readonly pullRequests: OrmRepository<PullRequest>,
    private readonly reviewQueue: ReviewQueueService,
    private readonly diffCache: DiffCacheService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * POST /api/v1/commits/:id/re-analyze
   *
   * Note how much more this clears than the pull-request version below: score,
   * summary, all three issue arrays, the fixes, AND the cached diff. That
   * asymmetry is deliberate in the Laravel controller — a commit card blanks
   * immediately on re-analyze while a PR keeps showing its previous review
   * until the new one overwrites it. Do not "tidy" these into one shape.
   */
  async reAnalyzeCommit(user: User, id: number): Promise<{ message: string; id: number }> {
    const commit = await this.commitReviews.findOne({
      where: { id },
      relations: { repository: true },
    });

    if (!commit) {
      throw new NotFoundException('No query results for model [App\\Models\\CommitReview] ' + id);
    }

    this.assertOwnership(user, commit.repository?.userId ?? null);

    await this.commitReviews.update(id, {
      status: 'analyzing',
      overallScore: null,
      summary: null,
      securityIssues: null,
      performanceIssues: null,
      codeQualityIssues: null,
      suggestedFixes: null,
    });

    await this.diffCache.forget(this.diffCache.commitKey(commit.repositoryId, commit.commitSha));
    await this.reviewQueue.enqueueCommitReview(id);

    await this.auditLog.record(
      user.id,
      'review_reanalyzed',
      `Re-analyzed commit ${commit.shortSha()} via API`,
      { commit_review_id: id, source: 'api' },
    );

    return { message: 'Re-analysis queued', id };
  }

  /** POST /api/v1/pull-requests/:id/re-analyze — status only, no cache purge. */
  async reAnalyzePullRequest(user: User, id: number): Promise<{ message: string; id: number }> {
    const pullRequest = await this.pullRequests.findOne({
      where: { id },
      relations: { repository: true },
    });

    if (!pullRequest) {
      throw new NotFoundException('No query results for model [App\\Models\\PullRequest] ' + id);
    }

    this.assertOwnership(user, pullRequest.repository?.userId ?? null);

    await this.pullRequests.update(id, { status: 'analyzing' });
    await this.reviewQueue.enqueuePullRequestReview(id);

    await this.auditLog.record(
      user.id,
      'review_reanalyzed',
      `Re-analyzed PR #${pullRequest.prNumber} via API`,
      { pull_request_id: id, source: 'api' },
    );

    return { message: 'Re-analysis queued', id };
  }

  async me(user: User): Promise<MeResponseDto> {
    const repositories = await this.repositories.find({
      where: { userId: user.id },
      select: ['id', 'name', 'fullName'],
    });

    return {
      name: user.name,
      github_username: user.githubUsername,
      repositories: repositories.map((repository) => ({
        id: repository.id,
        name: repository.name,
        full_name: repository.fullName,
      })),
    };
  }

  /** Commits and PRs interleaved, newest first. */
  async list(user: User, query: ListReviewsQuery): Promise<ListReviewsResponseDto> {
    const repoIds = await this.ownedRepositoryIds(user, query.repo);

    if (repoIds.length === 0) {
      return { reviews: [] };
    }

    const [commits, pullRequests] = await Promise.all([
      this.commitReviews.find({
        where: { repositoryId: In(repoIds) },
        relations: { repository: true },
        order: { createdAt: 'DESC' },
        take: query.limit,
      }),
      this.pullRequests.find({
        where: { repositoryId: In(repoIds) },
        relations: { repository: true, review: true },
        order: { createdAt: 'DESC' },
        take: query.limit,
      }),
    ]);

    const merged: ReviewSummaryDto[] = [
      ...commits.map((commit) => this.commitSummary(commit)),
      ...pullRequests.map((pullRequest) => this.pullRequestSummary(pullRequest)),
    ]
      .sort((a, b) => this.compareCreatedAtDesc(a.created_at, b.created_at))
      .slice(0, query.limit);

    return { reviews: merged };
  }

  /** The single newest review across both kinds - the MCP "last push" call. */
  async latest(user: User): Promise<LatestReviewResponseDto> {
    const repoIds = await this.ownedRepositoryIds(user);

    if (repoIds.length === 0) {
      throw new NotFoundException('No reviews yet');
    }

    const [commit, pullRequest] = await Promise.all([
      this.commitReviews.findOne({
        where: { repositoryId: In(repoIds) },
        relations: { repository: true },
        order: { createdAt: 'DESC' },
      }),
      this.pullRequests.findOne({
        where: { repositoryId: In(repoIds) },
        relations: { repository: true, review: true },
        order: { createdAt: 'DESC' },
      }),
    ]);

    if (!commit && !pullRequest) {
      throw new NotFoundException('No reviews yet');
    }

    const commitWins =
      commit !== null &&
      (pullRequest === null ||
        (commit.createdAt?.getTime() ?? 0) >= (pullRequest.createdAt?.getTime() ?? 0));

    if (commitWins && commit) {
      return { type: 'commit', review: this.commitDetail(commit) };
    }

    // Non-null: commitWins is false only when pullRequest exists.
    return { type: 'pull_request', review: this.pullRequestDetail(pullRequest as PullRequest) };
  }

  async showCommit(user: User, id: number): Promise<ShowReviewResponseDto> {
    const commit = await this.commitReviews.findOne({
      where: { id },
      relations: { repository: true },
    });

    if (!commit) {
      throw new NotFoundException('No query results for model [App\\Models\\CommitReview] ' + id);
    }

    this.assertOwnership(user, commit.repository?.userId ?? null);

    return { review: this.commitDetail(commit) };
  }

  async showPullRequest(user: User, id: number): Promise<ShowReviewResponseDto> {
    const pullRequest = await this.pullRequests.findOne({
      where: { id },
      relations: { repository: true, review: true },
    });

    if (!pullRequest) {
      throw new NotFoundException('No query results for model [App\\Models\\PullRequest] ' + id);
    }

    this.assertOwnership(user, pullRequest.repository?.userId ?? null);

    return { review: this.pullRequestDetail(pullRequest) };
  }

  // -- Internals -------------------------------------------------------

  private async ownedRepositoryIds(user: User, fullName?: string): Promise<number[]> {
    const repositories = await this.repositories.find({
      where: fullName ? { userId: user.id, fullName } : { userId: user.id },
      select: ['id'],
    });

    return repositories.map((repository) => repository.id);
  }

  private assertOwnership(user: User, ownerId: number | null): void {
    if (ownerId !== user.id) {
      throw new ForbiddenException('Not your repository');
    }
  }

  private compareCreatedAtDesc(a: string | null, b: string | null): number {
    return (b ?? '').localeCompare(a ?? '');
  }

  // -- Shapers (mirror the Laravel controller's protected methods) ------

  private commitSummary(commit: CommitReview): CommitSummaryDto {
    return {
      type: 'commit',
      id: commit.id,
      repository: commit.repository?.fullName ?? null,
      commit_sha: commit.commitSha.slice(0, 7),
      commit_message: commit.commitMessage,
      branch: commit.branch,
      status: commit.status,
      overall_score: commit.overallScore,
      created_at: toIso8601String(commit.createdAt),
    };
  }

  private pullRequestSummary(pullRequest: PullRequest): PullRequestSummaryDto {
    return {
      type: 'pull_request',
      id: pullRequest.id,
      repository: pullRequest.repository?.fullName ?? null,
      pr_number: pullRequest.prNumber,
      title: pullRequest.title,
      status: pullRequest.status,
      overall_score: pullRequest.review?.overallScore ?? null,
      created_at: toIso8601String(pullRequest.createdAt),
    };
  }

  private commitDetail(commit: CommitReview): CommitDetailDto {
    return {
      ...this.commitSummary(commit),
      commit_sha_full: commit.commitSha,
      author: commit.author,
      summary: commit.summary,
      security_issues: commit.securityIssues ?? [],
      performance_issues: commit.performanceIssues ?? [],
      code_quality_issues: commit.codeQualityIssues ?? [],
      suggested_fixes: commit.suggestedFixes?.fixes ?? [],
      detected_languages: commit.detectedLanguages ?? [],
      ai_model_used: commit.aiModelUsed,
    };
  }

  private pullRequestDetail(pullRequest: PullRequest): PullRequestDetailDto {
    const review = pullRequest.review;

    return {
      ...this.pullRequestSummary(pullRequest),
      author: pullRequest.author,
      base_branch: pullRequest.baseBranch,
      head_branch: pullRequest.headBranch,
      summary: review?.summary ?? null,
      security_issues: review?.securityIssues ?? [],
      performance_issues: review?.performanceIssues ?? [],
      code_quality_issues: review?.codeQualityIssues ?? [],
      suggested_fixes: review?.suggestedFixes?.fixes ?? [],
      detected_languages: pullRequest.detectedLanguages ?? [],
      ai_model_used: review?.aiModelUsed ?? null,
    };
  }
}
