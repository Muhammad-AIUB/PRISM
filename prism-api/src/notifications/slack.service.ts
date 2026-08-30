import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Port of sendSlack() from both jobs. Slack's legacy attachments payload —
 * chosen in Laravel because it also works with Mattermost and other
 * Slack-compatible endpoints.
 *
 * The two payloads differ: PRs report critical/warning counts, commits report
 * the branch. Both are preserved.
 */
const TIMEOUT_MS = 10_000;

export interface SlackField {
  title: string;
  value: string;
  short: boolean;
}

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendPullRequestReview(input: {
    webhookUrl: string;
    pullRequestId: number;
    title: string;
    author: string | null;
    repositoryFullName: string | null;
    summary: string | null;
    score: number | null;
    criticalCount: number;
    warningCount: number;
  }): Promise<void> {
    const score = input.score ?? 0;

    await this.post(input.webhookUrl, {
      attachments: [
        {
          color: this.colorFor(score),
          title: `🔍 PRism Review: ${input.title}`,
          title_link: this.url(`/reviews/${input.pullRequestId}`),
          text: input.summary ?? '',
          fields: [
            { title: 'Score', value: `${score}/100`, short: true },
            {
              title: 'Issues',
              value: `🔴 ${input.criticalCount} Critical | 🟡 ${input.warningCount} Warning`,
              short: true,
            },
            { title: 'Repository', value: input.repositoryFullName ?? '—', short: true },
            { title: 'Author', value: input.author ?? '—', short: true },
          ],
          footer: 'PRism AI Code Review',
          ts: this.timestamp(),
        },
      ],
    });

    this.logger.log(`Slack notification sent (pr_id=${input.pullRequestId})`);
  }

  async sendCommitReview(input: {
    webhookUrl: string;
    commitReviewId: number;
    shortSha: string;
    branch: string;
    author: string | null;
    repositoryFullName: string;
    summary: string | null;
    score: number | null;
  }): Promise<void> {
    const score = input.score ?? 0;

    await this.post(input.webhookUrl, {
      attachments: [
        {
          color: this.colorFor(score),
          title: `🔍 PRism Commit Review: ${input.shortSha} on \`${input.repositoryFullName}\``,
          title_link: this.url(`/commits/${input.commitReviewId}`),
          text: input.summary ?? '',
          fields: [
            { title: 'Score', value: `${score}/100`, short: true },
            { title: 'Branch', value: input.branch, short: true },
            { title: 'Repository', value: input.repositoryFullName, short: true },
            { title: 'Author', value: input.author ?? '—', short: true },
          ],
          footer: 'PRism AI Code Review (Commit)',
          ts: this.timestamp(),
        },
      ],
    });

    this.logger.log(`Slack notification sent (commit review_id=${input.commitReviewId})`);
  }

  /** score > 70 green, > 40 amber, else red — evaluated on 0 when null. */
  private colorFor(score: number): string {
    if (score > 70) {
      return '#22c55e';
    }

    return score > 40 ? '#f59e0b' : '#ef4444';
  }

  private timestamp(): number {
    return Math.floor(Date.now() / 1000);
  }

  private url(path: string): string {
    return `${(this.configService.get<string>('app.url') ?? '').replace(/\/+$/, '')}${path}`;
  }

  private async post(webhookUrl: string, payload: unknown): Promise<void> {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook returned ${response.status}`);
    }
  }
}
