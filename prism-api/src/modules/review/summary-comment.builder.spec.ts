import { ConfigService } from '@nestjs/config';
import { SummaryCommentBuilder } from './summary-comment.builder';

/**
 * This text is posted publicly on GitHub, so it is the most visible parity
 * surface in the slice. The expected strings below are copied from the Laravel
 * buildSummaryComment() implementations.
 */
const config = {
  get: (key: string) => (key === 'app.url' ? 'https://prism.example.com' : undefined),
} as unknown as ConfigService;

const review = {
  id: 42,
  overallScore: 88,
  summary: 'Looks good.',
  securityIssues: [{ comment: 'a' }, { comment: 'b' }],
  performanceIssues: [{ comment: 'c' }],
  codeQualityIssues: null,
  aiModelUsed: 'groq/llama-3.3-70b-versatile',
};

describe('SummaryCommentBuilder', () => {
  const builder = new SummaryCommentBuilder(config);

  it('builds the pull request comment', () => {
    expect(builder.buildForPullRequest(review)).toBe(
      '## 🔍 PRism AI Review\n\n' +
        '**Overall Score:** 88/100\n\n' +
        '- 🛡️ Security issues: 2\n' +
        '- ⚡ Performance issues: 1\n' +
        '- 🧹 Code quality issues: 0\n\n' +
        '**Summary:** Looks good.\n\n' +
        '_Model: groq/llama-3.3-70b-versatile_',
    );
  });

  it('builds the commit comment, which adds the heading suffix and a link', () => {
    expect(builder.buildForCommit(review)).toBe(
      '## 🔍 PRism AI Review (Commit)\n\n' +
        '**Overall Score:** 88/100\n\n' +
        '- 🛡️ Security issues: 2\n' +
        '- ⚡ Performance issues: 1\n' +
        '- 🧹 Code quality issues: 0\n\n' +
        '**Summary:** Looks good.\n\n' +
        '[View full review](https://prism.example.com/commits/42) · ' +
        '_Model: groq/llama-3.3-70b-versatile_',
    );
  });

  it('renders a null score as N/A', () => {
    expect(builder.buildForPullRequest({ ...review, overallScore: null })).toContain(
      '**Overall Score:** N/A/100',
    );
  });

  it.each([
    ['null', null],
    ['an empty string', ''],
  ])('substitutes the placeholder when the summary is %s', (_label, summary) => {
    expect(builder.buildForPullRequest({ ...review, summary })).toContain(
      '**Summary:** _No summary provided._',
    );
  });

  it('does not double a slash when APP_URL has a trailing one', () => {
    const trailing = {
      get: (key: string) => (key === 'app.url' ? 'https://prism.example.com/' : undefined),
    } as unknown as ConfigService;

    expect(new SummaryCommentBuilder(trailing).buildForCommit(review)).toContain(
      '(https://prism.example.com/commits/42)',
    );
  });
});
