import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ReviewIssue } from '../../database/entities/review.entity';
import { orderFindings, verdictFor, type Verdict } from '../../ai/verdict';
import type { RiskAssessment, RiskLevel } from '../../diff/risk-radar';

/**
 * The comment PRism posts on a pull request or a commit.
 *
 * This is the most visible thing the product does. It used to say a score, three
 * counts, and a paragraph — "2 security issues" with no file, no line, no
 * explanation, and on pull requests not even a link to go and read them. A
 * reviewer standing in the pull request had to leave it, open a dashboard and
 * hunt, to find out what the bot meant. Most people do not.
 *
 * So the findings come here, worst first, capped at three with the rest folded
 * into a <details> block. The cap is the point rather than a limitation: a
 * reader who is handed eleven things reads none of them.
 */
const SHOWN = 3;

const VERDICT_LABELS: Record<Verdict, string> = {
  blocking: '**BLOCKING**',
  worth_a_look: '**WORTH A LOOK**',
  nothing_found: '**NOTHING FOUND**',
  // Never posted today (the runners skip the comment when no model answered);
  // present so the label table stays exhaustive over Verdict.
  not_reviewed: '**NOT REVIEWED**',
};

interface CommentReview {
  id: number;
  overallScore: number | null;
  summary: string | null;
  securityIssues: ReviewIssue[] | null;
  performanceIssues: ReviewIssue[] | null;
  codeQualityIssues: ReviewIssue[] | null;
  aiModelUsed: string | null;
  /**
   * Risk Radar's read of the diff. Optional so a caller that has no diff to
   * hand still gets the comment it always got, byte for byte.
   */
  risk?: RiskAssessment | null;
}

const RISK_LABELS: Record<RiskLevel, string> = {
  high: '**Change risk: HIGH**',
  medium: '**Change risk: MEDIUM**',
  low: '**Change risk: LOW**',
};

/** Signals named inline on the risk line. The rest are one click away. */
const RISK_SIGNALS_SHOWN = 3;

@Injectable()
export class SummaryCommentBuilder {
  constructor(private readonly configService: ConfigService) {}

  buildForPullRequest(review: CommentReview): string {
    return (
      '## 🔍 PRism AI Review\n\n' +
      this.body(review) +
      `[View full review](${this.url(`/reviews/${review.id}`)}) · _Model: ${review.aiModelUsed ?? ''}_`
    );
  }

  buildForCommit(review: CommentReview): string {
    return (
      '## 🔍 PRism AI Review (Commit)\n\n' +
      this.body(review) +
      `[View full review](${this.url(`/commits/${review.id}`)}) · _Model: ${review.aiModelUsed ?? ''}_`
    );
  }

  private body(review: CommentReview): string {
    const findings = orderFindings([
      ...(review.securityIssues ?? []),
      ...(review.performanceIssues ?? []),
      ...(review.codeQualityIssues ?? []),
    ]);
    const score = review.overallScore ?? 'N/A';
    const verdict = VERDICT_LABELS[verdictFor(findings)];
    const count = findings.length === 1 ? '1 finding' : `${findings.length} findings`;

    let out = `${verdict} — ${count} · Score ${score}/100\n\n`;

    findings.slice(0, SHOWN).forEach((finding, index) => {
      out += this.finding(finding, index + 1);
    });

    const rest = findings.slice(SHOWN);

    if (rest.length > 0) {
      out += `<details><summary>${rest.length} more finding${rest.length === 1 ? '' : 's'}</summary>\n\n`;
      rest.forEach((finding, index) => {
        out += this.finding(finding, SHOWN + index + 1);
      });
      out += '</details>\n\n';
    }

    // PHP's `?:` treated an empty summary as absent, not just null. Kept.
    out += `**Summary:** ${review.summary ? review.summary : '_No summary provided._'}\n\n`;

    return out + (review.risk ? this.risk(review.risk) : '');
  }

  /**
   * After the findings, not before: the verdict answers "is this wrong", which
   * is the question the reader came with. Risk answers "how carefully should I
   * look", and a checklist of questions is the thing a reviewer can act on
   * without leaving the pull request.
   */
  private risk(risk: RiskAssessment): string {
    const reasons = risk.signals.slice(0, RISK_SIGNALS_SHOWN).map((signal) => signal.label);
    let out = `${RISK_LABELS[risk.level]} (${risk.score}/100)`;

    out += reasons.length > 0 ? ` — ${reasons.join(' · ')}\n\n` : '\n\n';

    if (risk.checklist.length === 0) {
      return out;
    }

    out += `<details><summary>Before merging (${risk.checklist.length})</summary>\n\n`;

    for (const check of risk.checklist) {
      const where = check.files.map((file) => `\`${file}\``).join(', ');

      out += `- [ ] ${check.question}${where ? ` ${where}` : ''}\n`;
    }

    return `${out}\n</details>\n\n`;
  }

  private finding(finding: ReviewIssue, position: number): string {
    // A removed line is numbered on the old side, so saying so is the difference
    // between "look here" and "look at what used to be here".
    const side = finding.side === 'removed' ? ' (removed)' : '';
    const where = finding.line ? `${finding.file}:${finding.line}` : (finding.file ?? 'unknown');

    return (
      `**${position}. \`${where}\`${side}** · ${finding.category ?? 'other'}\n` +
      `${finding.comment ?? ''}\n\n`
    );
  }

  private url(path: string): string {
    return `${(this.configService.get<string>('app.url') ?? '').replace(/\/+$/, '')}${path}`;
  }
}
