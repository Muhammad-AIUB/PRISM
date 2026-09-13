import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as OrmRepository } from 'typeorm';
import { AiClientService } from '../../ai/ai-client.service';
import { clampScore } from '../../ai/json-extractor';
import { FixesService } from '../../ai/fixes.service';
import { PromptBuilderService } from '../../ai/prompt-builder.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { DiffCacheService } from '../../cache/diff-cache.service';
import { CryptService } from '../../common/utils/crypt.service';
import { CommitReview } from '../../database/entities';
import type { ReviewIssue } from '../../database/entities/review.entity';
import { detectLanguages } from '../../diff/language-detector';
import { GithubClientService } from '../../github/github-client.service';
import { EmailService } from '../../notifications/email.service';
import { SlackService } from '../../notifications/slack.service';
import { SummaryCommentBuilder } from './summary-comment.builder';

/**
 * Port of the original commit-review job.
 *
 * Exceptions propagate on purpose so BullMQ retries per the backoff schedule;
 * the terminal-failure cleanup lives in the processor's failed handler, exactly
 * as the original splits handle() and failed().
 */
const DIFF_LIMIT = 8000;

@Injectable()
export class CommitReviewRunner {
  private readonly logger = new Logger(CommitReviewRunner.name);

  constructor(
    @InjectRepository(CommitReview)
    private readonly commitReviews: OrmRepository<CommitReview>,
    private readonly aiClient: AiClientService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly fixes: FixesService,
    private readonly github: GithubClientService,
    private readonly diffCache: DiffCacheService,
    private readonly crypt: CryptService,
    private readonly summaryComment: SummaryCommentBuilder,
    private readonly email: EmailService,
    private readonly slack: SlackService,
    private readonly auditLog: AuditLogService,
  ) {}

  async run(commitReviewId: number, attempt: number, signal?: AbortSignal): Promise<void> {
    const review = await this.commitReviews.findOne({
      where: { id: commitReviewId },
      relations: { repository: { user: true } },
    });

    if (!review) {
      this.logger.warn(`Commit review ${commitReviewId} disappeared before processing.`);

      return;
    }

    const repository = review.repository;
    const user = repository.user;

    this.logger.log(
      `Commit review job started ${JSON.stringify({
        review_id: review.id,
        repo: repository.fullName,
        sha: review.commitSha,
        attempt,
      })}`,
    );

    await this.commitReviews.update(review.id, { status: 'analyzing' });

    // 1. Fetch the commit diff, cached 1h on the SHA (immutable per commit).
    const token = this.crypt.decrypt(user?.githubToken ?? null) ?? '';
    const diffBody = await this.diffCache.remember(
      this.diffCache.commitKey(repository.id, review.commitSha),
      () => this.github.fetchCommitDiff(token, repository.fullName, review.commitSha, signal),
    );

    const diff = diffBody.slice(0, DIFF_LIMIT);
    const languages = detectLanguages(diff);

    if (languages.length > 0) {
      await this.commitReviews.update(review.id, { detectedLanguages: languages });
    }

    // 2. First AI pass.
    const attemptResult = await this.aiClient.callWithFallback(
      this.promptBuilder.buildSystemPrompt(languages, 'commit'),
      `Review this commit diff:\n${diff}`,
      'commit_review',
      signal,
    );

    const model = attemptResult.model;
    const parsed = attemptResult.parsed;

    // Graceful degradation: every model returned unparseable output. The user
    // sees the raw text and a retry hint rather than a failed review.
    if (!parsed) {
      await this.commitReviews.update(review.id, {
        status: 'completed',
        overallScore: null,
        summary: attemptResult.raw
          ? `AI review couldn't be parsed cleanly. Click Re-analyze to retry.\n\n— Raw output —\n${attemptResult.raw.slice(0, 1500)}`
          : "AI review didn't return any usable content. Click Re-analyze to retry.",
        aiModelUsed: model ?? 'multi-fallback',
      });

      this.logger.warn(
        `Commit review: all AI models failed to return parseable JSON (review_id=${review.id})`,
      );

      return;
    }

    const layers = FixesService.layersFrom(parsed);
    const overallScore = clampScore(parsed.overall_score);
    const summary = typeof parsed.summary === 'string' ? parsed.summary : null;

    // Out of budget. Stop before persisting: the retry redoes all of this, and
    // a half-written row racing its own retry is how a review ends up with one
    // attempt's issues and another's status.
    signal?.throwIfAborted();

    await this.commitReviews.update(review.id, {
      securityIssues: layers.security,
      performanceIssues: layers.performance,
      codeQualityIssues: layers.code_quality,
      overallScore,
      summary,
      aiModelUsed: model,
      suggestedFixes: null,
    });

    // 3. Second AI pass: suggested fixes.
    const suggestedFixes = await this.fixes.generate(
      model ?? '',
      layers,
      diff,
      'commit',
      'commit_review',
      signal,
    );

    if (suggestedFixes !== null) {
      await this.commitReviews.update(review.id, { suggestedFixes });
    }

    // 4. Post the summary on the commit (a different endpoint than PRs use).
    // The last checkpoint before the one irreversible, user-visible side
    // effect in the pipeline: GitHub keeps every comment we ever post.
    signal?.throwIfAborted();

    await this.github.postCommitComment(
      token,
      repository.fullName,
      review.commitSha,
      this.summaryComment.buildForCommit({
        id: review.id,
        overallScore,
        summary,
        securityIssues: layers.security as ReviewIssue[],
        performanceIssues: layers.performance as ReviewIssue[],
        codeQualityIssues: layers.code_quality as ReviewIssue[],
        aiModelUsed: model,
      }),
      signal,
    );

    await this.commitReviews.update(review.id, { status: 'completed' });

    this.logger.log(
      `Commit review job completed ${JSON.stringify({ review_id: review.id, score: overallScore })}`,
    );

    await this.auditLog.record(
      user?.id ?? null,
      'review_completed',
      `Review completed for commit ${review.shortSha()} on ${repository.fullName}`,
      { commit_review_id: review.id, score: overallScore },
    );

    // 5. Notifications. Failure here must not retry or roll back the review.
    if (user?.email && user.emailNotifications) {
      try {
        await this.email.sendCommitReview({
          to: user.email,
          commitReviewId: review.id,
          shortSha: review.shortSha(),
          repositoryFullName: repository.fullName,
          summary,
          score: overallScore,
        });
      } catch (error) {
        this.logger.warn(`Email notification (commit) failed: ${this.messageOf(error)}`);
      }
    }

    if (user?.slackWebhookUrl) {
      try {
        await this.slack.sendCommitReview({
          webhookUrl: user.slackWebhookUrl,
          commitReviewId: review.id,
          shortSha: review.shortSha(),
          branch: review.branch,
          author: review.author,
          repositoryFullName: repository.fullName,
          summary,
          score: overallScore,
        });
      } catch (error) {
        this.logger.warn(`Slack notification (commit) failed: ${this.messageOf(error)}`);
      }
    }
  }

  /** The original's failed(): mark the row failed once every attempt is spent. */
  async markFailed(commitReviewId: number): Promise<void> {
    await this.commitReviews.update(commitReviewId, { status: 'failed' });
  }

  private messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
