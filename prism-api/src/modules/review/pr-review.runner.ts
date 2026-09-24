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
import { CryptService } from '../../common/utils/crypt.service';
import { PullRequest, Review, ReviewComment } from '../../database/entities';
import type { ReviewIssue } from '../../database/entities/review.entity';
import type { ReviewLayer, ReviewSeverity } from '../../database/entities/review-comment.entity';
import { prepareDiff } from '../../diff/prepare';
import { tryAssessRisk, type RiskAssessment } from '../../diff/risk-radar';
import { droppedCount, validateLayers } from '../../ai/issue-validator';
import { validateFixes } from '../../ai/fix-validator';
import { reconcileScore, verdictFor } from '../../ai/verdict';
import { composeSummary } from './review-summary';
import { GithubClientService } from '../../github/github-client.service';
import { SlackService } from '../../notifications/slack.service';
import { ReviewRiskStore } from '../risk/review-risk.store';
import { SummaryCommentBuilder } from './summary-comment.builder';

/**
 * Port of the original pull-request review job.
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
    private readonly crypt: CryptService,
    private readonly summaryComment: SummaryCommentBuilder,
    private readonly slack: SlackService,
    private readonly auditLog: AuditLogService,
    private readonly reviewedRisk: ReviewRiskStore,
  ) {}

  async run(pullRequestId: number, attempt: number, signal?: AbortSignal): Promise<void> {
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
      () => this.github.fetchPullRequestDiff(token, repository.fullName, pr.prNumber, signal),
    );

    // Select whole files rather than cutting at a byte, render every changed
    // line with an anchor, and detect languages from the WHOLE diff. Shared
    // with the commit runner so a parser fix lands in one place.
    const prepared = prepareDiff(diffBody, DIFF_LIMIT);
    const languages = prepared.languages;

    // Risk Radar reads the whole diff, not the budgeted selection the model
    // saw: blast radius is a property of the change, not of what fit. It is
    // recorded together with every review row below, never later, so the page
    // cannot pair this review with the previous push's risk.
    const risk = tryAssessRisk(diffBody);

    if (languages.length > 0) {
      await this.pullRequests.update(pr.id, { detectedLanguages: languages });
    }

    // 2. First AI pass.
    const attemptResult = await this.aiClient.callWithFallback(
      this.promptBuilder.buildSystemPrompt(languages, 'pull request'),
      `Review this diff:\n${prepared.body}`,
      'pr_review',
      signal,
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
      await this.recordReviewedRisk(pr.id, repository.userId, risk);

      await this.pullRequests.update(pr.id, { status: 'completed' });

      this.logger.warn(
        `PR review: all AI models failed to return parseable JSON (pr_id=${pr.id})`,
      );

      return;
    }

    // Every location the model reported is checked against the lines we
    // actually rendered. A finding that does not resolve is dropped rather than
    // shown against a guessed line — a comment pointing at the wrong line costs
    // more trust than a missing comment costs bugs.
    const layers = validateLayers(FixesService.layersFrom(parsed), prepared.anchors);
    const dropped = droppedCount(layers);

    if (dropped > 0) {
      this.logger.log(
        `issue_validation ${JSON.stringify({
          pr_id: pr.id,
          kept: layers.kept,
          dropped,
          reasons: layers.reasons,
        })}`,
      );
    }

    // The model scored the list it reported, not the list that survived. Pull
    // the number into agreement with the verdict so the page cannot contradict
    // itself; the score stays because deployed MCP clients read it.
    const verdict = verdictFor([
      ...layers.security,
      ...layers.performance,
      ...layers.code_quality,
    ]);
    const overallScore = reconcileScore(clampScore(parsed.overall_score), verdict);
    const summary = composeSummary(
      typeof parsed.summary === 'string' ? parsed.summary : null,
      prepared.coverage,
      dropped,
    );

    // Out of budget. Stop before the upsert: the retry redoes all of this, and
    // this row plus its comments must come from one attempt, not two.
    signal?.throwIfAborted();

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
    await this.recordReviewedRisk(pr.id, repository.userId, risk);

    // Comments are replaced wholesale, so a re-analyze cannot accumulate them.
    await this.reviewComments.delete({ reviewId: review.id });

    const comments = this.buildComments(review.id, layers);

    if (comments.length > 0) {
      await this.reviewComments.save(comments);
    }

    // 4. Second AI pass: suggested fixes.
    // The selected text, not a raw byte cut: the fixes pass gets the same code
    // the review pass saw. Its own 4000-character limit still applies inside
    // buildFixesPrompt, and its line numbers remain unvalidated — that is
    // tracked separately, not silently fixed here.
    const suggestedFixes = await this.fixes.generate(
      model ?? '',
      layers,
      prepared.selection.text,
      'pull request',
      'pr_review',
      signal,
    );

    if (suggestedFixes !== null) {
      // Fixes name their own file and line and the UI renders them in a badge,
      // so they get checked too: the code they quote has to actually be at the
      // line they claim. Otherwise the weakest surface sets the trust level for
      // every verified finding beside it.
      const checked = validateFixes(suggestedFixes.fixes, prepared.index);

      if (checked.dropped > 0) {
        this.logger.log(
          `fix_validation ${JSON.stringify({ pr_id: pr.id, kept: checked.fixes.length, dropped: checked.dropped })}`,
        );
      }

      await this.reviews.update(review.id, { suggestedFixes: { fixes: checked.fixes } });
    }

    // 5. Post the summary back on the GitHub PR. Last checkpoint before the
    // one irreversible side effect: GitHub keeps every comment we post, so a
    // timed-out attempt that carried on here left two on the same PR.
    signal?.throwIfAborted();

    await this.github.postPullRequestComment(
      token,
      repository.fullName,
      pr.prNumber,
      this.summaryComment.buildForPullRequest({
        // The web route is /reviews/[pullRequest], keyed on the pull request
        // rather than the review row, so this is pr.id and not review.id.
        id: pr.id,
        overallScore,
        summary,
        securityIssues: layers.security as ReviewIssue[],
        performanceIssues: layers.performance as ReviewIssue[],
        codeQualityIssues: layers.code_quality as ReviewIssue[],
        aiModelUsed: model,
        risk,
      }),
      signal,
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

    // 6. Out-of-band notification (Slack), guarded so it cannot fail the review.
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

  /** The original's failed(): mark the row failed once every attempt is spent. */
  async markFailed(pullRequestId: number): Promise<void> {
    await this.pullRequests.update(pullRequestId, { status: 'failed' });
  }

  /** The original ORM's an update-or-create keyed on pull_request_id. */
  /**
   * Called immediately after each review-row write, on every path. A missing
   * assessment (the scan threw) clears the saved one rather than leaving the
   * previous push's risk labelled as this review's.
   */
  private async recordReviewedRisk(
    pullRequestId: number,
    ownerId: number,
    risk: RiskAssessment | null,
  ): Promise<void> {
    if (risk) {
      // Refused, harmlessly, if the owner's account is being erased.
      await this.reviewedRisk.save(pullRequestId, ownerId, risk);
    } else {
      await this.reviewedRisk.forget(pullRequestId);
    }
  }

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
