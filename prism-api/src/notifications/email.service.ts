import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Port of sendEmail() from both jobs, over Resend's REST API (Laravel uses the
 * same provider via MAIL_MAILER=resend).
 *
 * The two jobs send different things and that is preserved:
 *   - commits go out as plain text, built by Mail::raw
 *   - pull requests use the ReviewCompletedMail markdown mailable
 *
 * KNOWN DIVERGENCE: the PR mail's HTML is produced here by a self-contained
 * template rather than by Laravel's published markdown-mail components
 * (resources/views/vendor/mail). Every piece of content — subject, greeting,
 * score, summary, repository, author, branches, button target — is identical;
 * the surrounding table markup and CSS are not byte-for-byte Laravel's.
 * Reproducing that theme in Node was judged not worth the coupling.
 */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const TIMEOUT_MS = 15_000;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  /** Mirrors ReviewCompletedMail: subject "PRism Review Complete - Score: N/100". */
  async sendPullRequestReview(input: {
    to: string;
    recipientName: string;
    pullRequestId: number;
    title: string;
    author: string;
    repositoryFullName: string;
    headBranch: string;
    baseBranch: string;
    summary: string | null;
    score: number | null;
  }): Promise<void> {
    const score = input.score ?? 'N/A';
    const reviewUrl = this.url(`/reviews/${input.pullRequestId}`);
    const summary = input.summary ?? '_No summary provided._';

    const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="570" cellpadding="0" cellspacing="0" style="max-width:570px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:32px;">
            <tr><td>
              <h1 style="margin:0 0 24px;font-size:20px;">🔍 PRism Review Complete</h1>
              <p style="margin:0 0 16px;">Hey <strong>${escapeHtml(input.recipientName)}</strong>,</p>
              <p style="margin:0 0 16px;">Your pull request <strong>"${escapeHtml(input.title)}"</strong> has been reviewed by PRism AI.</p>
              <h2 style="margin:24px 0 12px;font-size:18px;">Score: ${score}/100</h2>
              <p style="margin:0 0 8px;"><strong>Summary:</strong></p>
              <p style="margin:0 0 24px;">${escapeHtml(summary)}</p>
              <p style="margin:0 0 4px;"><strong>Repository:</strong> ${escapeHtml(input.repositoryFullName)}</p>
              <p style="margin:0 0 4px;"><strong>Author:</strong> ${escapeHtml(input.author)}</p>
              <p style="margin:0 0 24px;"><strong>Branch:</strong> <code>${escapeHtml(input.headBranch)}</code> &rarr; <code>${escapeHtml(input.baseBranch)}</code></p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr><td style="background:#2563eb;border-radius:6px;">
                  <a href="${escapeHtml(reviewUrl)}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600;">View Full Review</a>
                </td></tr>
              </table>
              <p style="margin:0;">Thanks,<br>PRism AI</p>
            </td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    await this.send({
      to: input.to,
      subject: `PRism Review Complete - Score: ${score}/100`,
      html,
    });

    this.logger.log(`Email notification sent (pr_id=${input.pullRequestId}, to=${input.to})`);
  }

  /** Mirrors the Mail::raw() plain-text commit mail. */
  async sendCommitReview(input: {
    to: string;
    commitReviewId: number;
    shortSha: string;
    repositoryFullName: string;
    summary: string | null;
    score: number | null;
  }): Promise<void> {
    const score = input.score ?? 'N/A';

    const text =
      `PRism reviewed commit ${input.shortSha} on ${input.repositoryFullName}.\n\n` +
      `Score: ${score}/100\n\n` +
      `${input.summary ?? ''}\n\n` +
      this.url(`/commits/${input.commitReviewId}`);

    await this.send({
      to: input.to,
      subject: `PRism Commit Review — ${input.shortSha} (Score: ${score}/100)`,
      text,
    });

    this.logger.log(`Email notification sent (commit review_id=${input.commitReviewId})`);
  }

  private async send(message: {
    to: string;
    subject: string;
    html?: string;
    text?: string;
  }): Promise<void> {
    const apiKey = this.configService.get<string>('mail.resendKey') ?? '';

    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured.');
    }

    const fromAddress = this.configService.get<string>('mail.fromAddress') ?? '';
    const fromName = this.configService.get<string>('mail.fromName') ?? '';

    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromName ? `${fromName} <${fromAddress}>` : fromAddress,
        to: [message.to],
        subject: message.subject,
        ...(message.html ? { html: message.html } : {}),
        ...(message.text ? { text: message.text } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Resend returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
  }

  private url(path: string): string {
    return `${(this.configService.get<string>('app.url') ?? '').replace(/\/+$/, '')}${path}`;
  }
}
