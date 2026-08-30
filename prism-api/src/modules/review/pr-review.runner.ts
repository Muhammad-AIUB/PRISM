import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as OrmRepository } from 'typeorm';
import { AiClientService } from '../../ai/ai-client.service';
import { FixesService, toLine } from '../../ai/fixes.service';
import type { IssueLayers } from '../../ai/prompt-builder.service';
import { clampScore } from '../../ai/json-extractor';
import { PromptBuilderService } from '../../ai/prompt-builder.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { DiffCacheService } from '../../cache/diff-cache.service';
import { LaravelCryptService } from '../../common/utils/laravel-crypt.service';
import { PullRequest, Review, ReviewComment } from '../../database/entities';
import type { ReviewIssue } from '../../database/entities/review.entity';
import type { ReviewLayer, ReviewSeverity } from '../../database/entities/review-comment.entity';
import { detectLanguages } from '../../diff/language-detector';
import { GithubClientService } from '../../github/github-client.service';
import { EmailService } from '../../notifications/email.service';
import { SlackService } from '../../notifications/slack.service';
import { SummaryCommentBuilder } from './summary-comment.builder';

/**
 * Port of App\Jobs\ProcessPullRequestReview::handle().
 *
 * Differs from the commit pipeline in three ways that are behaviour, not
 * style: the review lives in its own `reviews` row (upserted, not updated in
 * place), issues are fanned out into `review_comments`, and the posted GitHub
 * comment carries no "View full review" link.
 */
const DIFF_LIMIT = 8000;
const VALID_SEVERITIES: ReviewSeverity[] = ['critical', 'warning', 'suggestion'];

@Injectable()
export class PullRequestReviewRunner {
  private readonly logger = new Logger(PullRequestReviewRunner.name);

  constructor(
    @InjectRepository(PullRequest)
    private readonly pullRequests: OrmRepository<PullRequest>,
    @InjectRepository(Review)
    private readonly reviews: OrmRepository<Review>,
    @InjectRepository(ReviewComment)
    private readonly reviewComments: OrmRepository<ReviewComment>,
    private readonly aiClient: AiClientService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly fixes: FixesService,
    private readonly github: GithubClientService,
    private readonly diffCache: DiffCacheService,
    private readonly crypt: LaravelCryptService,
    private readonly summaryComment: SummaryCommentBuilder,
    private readonly email: EmailService,
    private readonly slack: SlackService,
    private readonly auditLog: AuditLogService,
  ) {}

  async run(pullRequestId: number, attempt: number): Promise<void> {
    const pr = await this.pullRequests.findOne({
      where: { id: pullRequestId },
      relations: { repository: { user: true } },
    });

    if (!pr) {
      this.logger.warn(`Pull request ${pullRequestId} disappeared before processing.`);

      return;
    }

    const repository = pr.repository;
    const user = repository.user;

    this.logger.log(
      `PR review job started ${JSON.stringify({
        pr_id: pr.id,
        repo: repository.fullName,
        attempt,
      })}`,
    );

    await this.pullRequests.update(pr.id, { status: 'analyzing' });

    // 1. Diff, cached 1h and invalidated by a new push via updated_at.
    const token = this.crypt.decrypt(user?.githubToken ?? null) ?? '';
    const diffBody = await this.diffCache.remember(
      this.diffCache.pullRequestKey(pr.id, pr.headBranch, pr.updatedAt),
      () => this.github.fetchPullRequestDiff(token, repository.fullName, pr.prNumber),
    );

    const diff = diffBody.slice(0, DIFF_LIMIT);
    const languages = detectLanguages(diff);

    if (languages.length > 0) {
      await this.pullRequests.update(pr.id, { detectedLanguages: languages });
    }

    // 2. First AI pass.
    const attemptResult = await this.aiClient.callWithFallback(
      this.promptBuilder.buildSystemPrompt(languages, 'pull request'),
      `Review this diff:\n${diff}`,
      'pr_review',
    );

    const model = attemptResult.model;
    const parsed = attemptResult.parsed;

    if (!parsed) {
      await this.upsertReview(pr.id, {
        overallScore: null,
        summary: attemptResult.raw
          ? `AI review couldn't be parsed cleanly. Click Re-analyze to retry.\n\n— Raw output —\n${attemptResult.raw.slice(0, 1500)}`
          : "AI review didn't return any usable content. Click Re-analyze to retry.",
        aiModelUsed: model ?? 'multi-fallback',
        securityIssues: [],
        performanceIssues: [],
        codeQualityIssues: [],
      });

      await this.pullRequests.update(pr.id, { status: 'completed' });

      this.logger.warn(
        `PR review: all AI models failed to return parseable JSON (pr_id=${pr.id})`,
      );

      return;
    }

    const layers = FixesService.layersFrom(parsed);
    const overallScore = clampScore(parsed.overall_score);
    const summary = typeof parsed.summary === 'string' ? parsed.summary : null;

    // 3. Persist (or update) the review row.
    const review = await this.upsertReview(pr.id, {
      securityIssues: layers.security,
      performanceIssues: layers.performance,
      codeQualityIssues: layers.code_quality,
      overallScore,
      summary,
      aiModelUsed: model,
      suggestedFixes: null,
    });

    // Comments are replaced wholesale, so a re-analyze cannot accumulate them.
    await this.reviewComments.delete({ reviewId: review.id });

    const comments = this.buildComments(review.id, layers);

    if (comments.length > 0) {
      await this.reviewComments.save(comments);
    }

    // 4. Second AI pass: suggested fixes.
    const suggestedFixes = await this.fixes.generate(
      model ?? '',
      layers,
      diff,
      'pull request',
      'pr_review',
    );

    if (suggestedFixes !== null) {
      await this.reviews.update(review.id, { suggestedFixes });
    }

    // 5. Post the summary back on the GitHub PR.
    await this.github.postPullRequestComment(
      token,
      repository.fullName,
      pr.prNumber,
      this.summaryComment.buildForPullRequest({
        overallScore,
        summary,
        securityIssues: layers.security as ReviewIssue[],
        performanceIssues: layers.performance as ReviewIssue[],
        codeQualityIssues: layers.code_quality as ReviewIssue[],
        aiModelUsed: model,
      }),
    );

    await this.pullRequests.update(pr.id, { status: 'completed' });

    this.logger.log(
      `PR review job completed ${JSON.stringify({ pr_id: pr.id, score: overallScore })}`,
    );

    await this.auditLog.record(
      user?.id ?? null,
      'review_completed',
      `Review completed for PR #${pr.prNumber} on ${repository.fullName}`,
      { pull_request_id: pr.id, score: overallScore },
    );

    // 6. Out-of-band notifications, individually guarded.
    if (user?.email && user.emailNotifications) {
      try {
        await this.email.sendPullRequestReview({
          to: user.email,
          recipientName: user.name || (user.githubUsername ?? ''),
          pullRequestId: pr.id,
          title: pr.title,
          author: pr.author,
          repositoryFullName: repository.fullName,
          headBranch: pr.headBranch,
          baseBranch: pr.baseBranch,
          summary,
          score: overallScore,
        });
      } catch (error) {
        this.logger.warn(`Email notification failed: ${this.messageOf(error)}`);
      }
    }

    if (user?.slackWebhookUrl) {
      try {
        const [criticalCount, warningCount] = await Promise.all([
          this.reviewComments.count({ where: { reviewId: review.id, severity: 'critical' } }),
          this.reviewComments.count({ where: { reviewId: review.id, severity: 'warning' } }),
        ]);

        await this.slack.sendPullRequestReview({
          webhookUrl: user.slackWebhookUrl,
          pullRequestId: pr.id,
          title: pr.title,
          author: pr.author,
          repositoryFullName: repository.fullName,
          summary,
          score: overallScore,
          criticalCount,
          warningCount,
        });
      } catch (error) {
        this.logger.warn(`Slack notification failed: ${this.messageOf(error)}`);
      }
    }
  }

  /** Laravel's failed(): mark the row failed once every attempt is spent. */
  async markFailed(pullRequestId: number): Promise<void> {
    await this.pullRequests.update(pullRequestId, { status: 'failed' });
  }

  /** Eloquent's Review::updateOrCreate(['pull_request_id' => …], […]). */
  private async upsertReview(
    pullRequestId: number,
    values: Partial<Review>,
  ): Promise<Review> {
    const existing = await this.reviews.findOne({ where: { pullRequestId } });
    const now = new Date();

    if (existing) {
      await this.reviews.update(existing.id, { ...values, updatedAt: now });

      return { ...existing, ...values } as Review;
    }

    const created = this.reviews.create({
      ...values,
      pullRequestId,
      createdAt: now,
      updatedAt: now,
    });

    return this.reviews.save(created);
  }

  /**
   * Fan the three issue arrays out into review_comments. Entries without a
   * comment string are skipped and an unrecognised severity falls back to
   * 'suggestion', both matching the PHP.
   */
  private buildComments(reviewId: number, layers: IssueLayers): ReviewComment[] {
    const now = new Date();
    const rows: ReviewComment[] = [];

    for (const layer of ['security', 'performance', 'code_quality'] as ReviewLayer[]) {
      for (const issue of layers[layer] ?? []) {
        if (typeof issue !== 'object' || issue === null || !issue.comment) {
          continue;
        }

        rows.push(
          this.reviewComments.create({
            reviewId,
            // PHP: (string) ($issue['file'] ?? 'unknown') — only null/absent
            // falls back; a numeric file value is stringified, not replaced.
            filePath: issue.file === undefined || issue.file === null ? 'unknown' : String(issue.file),
            lineNumber: toLine(issue.line),
            layer,
            severity: VALID_SEVERITIES.includes(issue.severity as ReviewSeverity)
              ? (issue.severity as ReviewSeverity)
              : 'suggestion',
            comment: String(issue.comment),
            createdAt: now,
            updatedAt: now,
          }),
        );
      }
    }

    return rows;
  }

  private messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
