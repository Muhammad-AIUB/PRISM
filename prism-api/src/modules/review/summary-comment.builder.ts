import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ReviewIssue } from '../../database/entities/review.entity';

/**
 * Port of buildSummaryComment() from both jobs. This text is posted publicly on
 * GitHub, so it is the most visible parity surface in the whole slice.
 *
 * The two differ in ways that look accidental but are shipped behaviour:
 *   - commits are headed "PRism AI Review (Commit)", PRs just "PRism AI Review"
 *   - commits append a "[View full review](…)" link, PRs do not
 */
@Injectable()
export class SummaryCommentBuilder {
  constructor(private readonly configService: ConfigService) {}

  buildForPullRequest(review: {
    overallScore: number | null;
    summary: string | null;
    securityIssues: ReviewIssue[] | null;
    performanceIssues: ReviewIssue[] | null;
    codeQualityIssues: ReviewIssue[] | null;
    aiModelUsed: string | null;
  }): string {
    return (
      '## 🔍 PRism AI Review\n\n' +
      this.body(review) +
      `_Model: ${review.aiModelUsed ?? ''}_`
    );
  }

  buildForCommit(
    review: {
      id: number;
      overallScore: number | null;
      summary: string | null;
      securityIssues: ReviewIssue[] | null;
      performanceIssues: ReviewIssue[] | null;
      codeQualityIssues: ReviewIssue[] | null;
      aiModelUsed: string | null;
    },
  ): string {
    return (
      '## 🔍 PRism AI Review (Commit)\n\n' +
      this.body(review) +
      `[View full review](${this.url(`/commits/${review.id}`)}) · _Model: ${review.aiModelUsed ?? ''}_`
    );
  }

  private body(review: {
    overallScore: number | null;
    summary: string | null;
    securityIssues: ReviewIssue[] | null;
    performanceIssues: ReviewIssue[] | null;
    codeQualityIssues: ReviewIssue[] | null;
  }): string {
    const score = review.overallScore ?? 'N/A';

    return (
      `**Overall Score:** ${score}/100\n\n` +
      `- 🛡️ Security issues: ${this.count(review.securityIssues)}\n` +
      `- ⚡ Performance issues: ${this.count(review.performanceIssues)}\n` +
      `- 🧹 Code quality issues: ${this.count(review.codeQualityIssues)}\n\n` +
      // PHP's `?:` treats an empty summary as absent, not just null.
      `**Summary:** ${review.summary ? review.summary : '_No summary provided._'}\n\n`
    );
  }

  private count(issues: ReviewIssue[] | null): number {
    return Array.isArray(issues) ? issues.length : 0;
  }

  private url(path: string): string {
    return `${(this.configService.get<string>('app.url') ?? '').replace(/\/+$/, '')}${path}`;
  }
}
