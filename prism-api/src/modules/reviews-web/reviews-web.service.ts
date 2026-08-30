import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as OrmRepository } from 'typeorm';
import { AuditLogService } from '../../audit/audit-log.service';
import { DiffCacheService } from '../../cache/diff-cache.service';
import { LaravelCryptService } from '../../common/utils/laravel-crypt.service';
import { toIso8601String } from '../../common/utils/iso8601';
import { CommitReview, PullRequest, Review, ReviewComment, User } from '../../database/entities';
import { GithubClientService } from '../../github/github-client.service';
import { ReviewQueueService } from '../review/review-queue.service';

/**
 * Port of ReviewController and CommitReviewController (the web ones).
 *
 * These are the last two routes that dispatched AI jobs onto Laravel's
 * database queue. With them here, every path that starts a review runs on
 * BullMQ, and Laravel's queue:work can finally be retired in slice D.
 */
@Injectable()
export class ReviewsWebService {
  constructor(
    @InjectRepository(PullRequest)
    private readonly pullRequests: OrmRepository<PullRequest>,
    @InjectRepository(Review)
    private readonly reviews: OrmRepository<Review>,
    @InjectRepository(ReviewComment)
    private readonly reviewComments: OrmRepository<ReviewComment>,
    @InjectRepository(CommitReview)
    private readonly commitReviews: OrmRepository<CommitReview>,
    private readonly queue: ReviewQueueService,
    private readonly github: GithubClientService,
    private readonly crypt: LaravelCryptService,
    private readonly diffCache: DiffCacheService,
    private readonly auditLog: AuditLogService,
  ) {}

  // ── Pull requests ──────────────────────────────────────────────────

  async showPullRequest(user: User, id: number): Promise<Record<string, unknown>> {
    const pr = await this.findOwnedPullRequest(user, id, true);

    return {
      pullRequest: this.prPayload(pr),
      review: this.reviewPayload(pr.review),
    };
  }

  /**
   * Drops the existing review and its comments so the page shows in-flight
   * state rather than a stale score, then queues a fresh job.
   *
   * Note this differs from the /api/v1 re-analyze, which leaves the previous
   * review in place. Both behaviours are Laravel's and both are intentional.
   */
  async reAnalyzePullRequest(user: User, id: number): Promise<{ message: string }> {
    const pr = await this.findOwnedPullRequest(user, id, true);

    // Touching updated_at is what actually invalidates the cached diff: the
    // worker's cache key is sha1(head_branch|updated_at), so a new value there
    // forces a fresh fetch. Laravel relied on the same side effect.
    await this.pullRequests.update(pr.id, { status: 'analyzing', updatedAt: new Date() });

    if (pr.review) {
      await this.reviewComments.delete({ reviewId: pr.review.id });
      await this.reviews.delete(pr.review.id);
    }

    await this.queue.enqueuePullRequestReview(pr.id);

    await this.auditLog.record(
      user.id,
      'review_reanalyzed',
      `Re-analyzed PR #${pr.prNumber} on ${pr.repository?.fullName ?? ''}`,
      { pull_request_id: pr.id },
    );

    return { message: 'Re-analyzing PR…' };
  }

  /**
   * Proxies the GitHub diff so the browser can render it without ever seeing
   * the user's GitHub token. GitHub's status is passed through unchanged.
   */
  async pullRequestDiff(
    user: User,
    id: number,
  ): Promise<{ status: number; body: string }> {
    const pr = await this.findOwnedPullRequest(user, id, false);
    const repository = pr.repository;
    const token = this.crypt.decrypt(repository.user?.githubToken ?? null) ?? '';

    try {
      const body = await this.github.fetchPullRequestDiff(
        token,
        repository.fullName,
        pr.prNumber,
      );

      return { status: 200, body };
    } catch (error) {
      // fetchPullRequestDiff throws "Failed to fetch diff: <status>" — recover
      // the code so the browser sees GitHub's, as Laravel passed it through.
      const match = /(\d{3})\s*$/.exec(error instanceof Error ? error.message : '');

      return { status: match ? Number(match[1]) : 502, body: '' };
    }
  }

  async exportData(user: User, id: number): Promise<{ pr: PullRequest; review: Review | null }> {
    const pr = await this.findOwnedPullRequest(user, id, true);

    await this.auditLog.record(
      user.id,
      'data_exported',
      `Exported PDF for PR #${pr.prNumber} on ${pr.repository?.fullName ?? ''}`,
      { pull_request_id: pr.id },
    );

    return { pr, review: pr.review ?? null };
  }

  // ── Commit reviews ─────────────────────────────────────────────────

  async showCommit(user: User, id: number): Promise<Record<string, unknown>> {
    const cr = await this.findOwnedCommitReview(user, id);

    return {
      commitReview: {
        id: cr.id,
        commit_sha: cr.commitSha,
        short_sha: cr.shortSha(),
        commit_message: cr.commitMessage,
        author: cr.author,
        branch: cr.branch,
        status: cr.status,
        overall_score: cr.overallScore,
        summary: cr.summary,
        security_issues: cr.securityIssues ?? [],
        performance_issues: cr.performanceIssues ?? [],
        code_quality_issues: cr.codeQualityIssues ?? [],
        suggested_fixes: cr.suggestedFixes,
        detected_languages: cr.detectedLanguages ?? [],
        ai_model_used: cr.aiModelUsed,
        created_at: toIso8601String(cr.createdAt),
        repository: {
          name: cr.repository?.name ?? null,
          full_name: cr.repository?.fullName ?? null,
        },
        github_url: cr.repository
          ? `https://github.com/${cr.repository.fullName}/commit/${cr.commitSha}`
          : null,
      },
    };
  }

  async reAnalyzeCommit(user: User, id: number): Promise<{ message: string }> {
    const cr = await this.findOwnedCommitReview(user, id);

    await this.commitReviews.update(cr.id, {
      status: 'analyzing',
      overallScore: null,
      summary: null,
      securityIssues: null,
      performanceIssues: null,
      codeQualityIssues: null,
      suggestedFixes: null,
      updatedAt: new Date(),
    });

    // The commit diff cache is keyed on the SHA alone, which never changes, so
    // it has to be dropped explicitly or the retry re-reviews the same bytes.
    await this.diffCache.forget(this.diffCache.commitKey(cr.repositoryId, cr.commitSha));

    await this.queue.enqueueCommitReview(cr.id);

    await this.auditLog.record(
      user.id,
      'review_reanalyzed',
      `Re-analyzed commit ${cr.shortSha()} on ${cr.repository?.fullName ?? ''}`,
      { commit_review_id: cr.id },
    );

    return { message: 'Re-analyzing commit…' };
  }

  // ── Shapers and guards ─────────────────────────────────────────────

  private prPayload(pr: PullRequest): Record<string, unknown> {
    return {
      id: pr.id,
      title: pr.title,
      author: pr.author,
      pr_number: pr.prNumber,
      base_branch: pr.baseBranch,
      head_branch: pr.headBranch,
      status: pr.status,
      diff_url: pr.diffUrl,
      detected_languages: pr.detectedLanguages ?? [],
      created_at: toIso8601String(pr.createdAt),
      repository: {
        name: pr.repository?.name ?? null,
        full_name: pr.repository?.fullName ?? null,
      },
    };
  }

  private reviewPayload(review: Review | null | undefined): Record<string, unknown> | null {
    if (!review) {
      return null;
    }

    return {
      id: review.id,
      overall_score: review.overallScore,
      summary: review.summary,
      ai_model_used: review.aiModelUsed,
      security_issues: review.securityIssues ?? [],
      performance_issues: review.performanceIssues ?? [],
      code_quality_issues: review.codeQualityIssues ?? [],
      suggested_fixes: review.suggestedFixes,
      comments: (review.comments ?? []).map((comment) => ({
        id: comment.id,
        file_path: comment.filePath,
        line_number: comment.lineNumber,
        layer: comment.layer,
        severity: comment.severity,
        comment: comment.comment,
      })),
    };
  }

  private async findOwnedPullRequest(
    user: User,
    id: number,
    withReview: boolean,
  ): Promise<PullRequest> {
    const pr = await this.pullRequests.findOne({
      where: { id },
      relations: withReview
        ? { repository: { user: true }, review: { comments: true } }
        : { repository: { user: true } },
    });

    if (!pr) {
      throw new NotFoundException('No query results for model [App\\Models\\PullRequest] ' + id);
    }

    // Laravel aborts 403 when the repository is missing OR not the user's.
    if (!pr.repository || pr.repository.userId !== user.id) {
      throw new ForbiddenException();
    }

    return pr;
  }

  private async findOwnedCommitReview(user: User, id: number): Promise<CommitReview> {
    const cr = await this.commitReviews.findOne({
      where: { id },
      relations: { repository: true },
    });

    if (!cr) {
      throw new NotFoundException('No query results for model [App\\Models\\CommitReview] ' + id);
    }

    if (!cr.repository || cr.repository.userId !== user.id) {
      throw new ForbiddenException();
    }

    return cr;
  }
}
