import { SummaryCommentBuilder } from './summary-comment.builder';
import type { ReviewIssue } from '../../database/entities/review.entity';

/**
 * The most visible surface PRism has.
 *
 * This text is posted publicly on someone else's pull request, so it is asserted
 * byte for byte. It used to carry a score and three counts and nothing else:
 * "2 security issues" with no file, no line, no explanation and — on pull
 * requests — not even a link to go and find out. Every piece of value the review
 * produced was stranded in a dashboard the reader was not looking at.
 *
 * Now the findings themselves are here, worst first, three of them, with the
 * rest folded away. A reviewer reads the comment in the place they were already
 * standing and knows what to do.
 */
const config = { get: () => 'https://prism.example.com' } as never;

const issue = (over: Partial<ReviewIssue>): ReviewIssue => ({
  file: 'src/a.ts',
  line: 10,
  side: 'added',
  category: 'other',
  severity: 'warning',
  comment: 'Something to look at.',
  ...over,
});

const review = {
  id: 42,
  overallScore: 88,
  summary: 'Looks good.',
  securityIssues: [
    issue({ file: 'src/auth.ts', line: 118, side: 'removed', category: 'auth_weakened', severity: 'critical', comment: 'The admin check was removed from this path.' }),
  ],
  performanceIssues: [
    issue({ file: 'src/sync.ts', line: 44, category: 'no_timeout', comment: 'fetch() added with no timeout.' }),
  ],
  codeQualityIssues: [],
  aiModelUsed: 'groq/llama-3.3-70b-versatile',
};

describe('SummaryCommentBuilder', () => {
  const builder = new SummaryCommentBuilder(config);

  it('leads with the verdict and lists the findings, worst first', () => {
    expect(builder.buildForPullRequest(review)).toBe(
      '## 🔍 PRism AI Review\n\n' +
        '**BLOCKING** — 2 findings · Score 88/100\n\n' +
        '**1. `src/auth.ts:118` (removed)** · auth_weakened\n' +
        'The admin check was removed from this path.\n\n' +
        '**2. `src/sync.ts:44`** · no_timeout\n' +
        'fetch() added with no timeout.\n\n' +
        '**Summary:** Looks good.\n\n' +
        '[View full review](https://prism.example.com/reviews/42) · ' +
        '_Model: groq/llama-3.3-70b-versatile_',
    );
  });

  it('gives pull requests the link back that only commits used to get', () => {
    expect(builder.buildForPullRequest(review)).toContain(
      '[View full review](https://prism.example.com/reviews/42)',
    );
  });

  it('points a commit at its own page', () => {
    expect(builder.buildForCommit(review)).toContain(
      '[View full review](https://prism.example.com/commits/42)',
    );
    expect(builder.buildForCommit(review)).toContain('## 🔍 PRism AI Review (Commit)');
  });

  it('shows three findings and folds the rest away', () => {
    const many = {
      ...review,
      securityIssues: [issue({ comment: 'one' }), issue({ comment: 'two' })],
      performanceIssues: [issue({ comment: 'three' }), issue({ comment: 'four' })],
      codeQualityIssues: [issue({ comment: 'five' })],
    };
    const body = builder.buildForPullRequest(many);

    expect(body).toContain('one');
    expect(body).toContain('<details><summary>2 more findings</summary>');
    expect(body).toContain('five');
  });

  it('says plainly when nothing was found', () => {
    const clean = {
      ...review,
      securityIssues: [],
      performanceIssues: [],
      codeQualityIssues: [],
    };

    expect(builder.buildForPullRequest(clean)).toContain('**NOTHING FOUND**');
    expect(builder.buildForPullRequest(clean)).not.toContain('<details>');
  });

  it('drops to worth a look when no finding is checkable', () => {
    const soft = {
      ...review,
      securityIssues: [issue({ severity: 'critical', category: 'other' })],
      performanceIssues: [],
    };

    expect(builder.buildForPullRequest(soft)).toContain('**WORTH A LOOK**');
  });

  it('renders a null score without pretending it has one', () => {
    expect(builder.buildForPullRequest({ ...review, overallScore: null })).toContain(
      'Score N/A',
    );
  });

  it('handles an absent summary the way it always did', () => {
    expect(builder.buildForPullRequest({ ...review, summary: '' })).toContain(
      '**Summary:** _No summary provided._',
    );
  });
});
