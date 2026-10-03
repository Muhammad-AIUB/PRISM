import { commitReviewFeedItem, pullRequestFeedItem } from './review-feed.mapper';

/**
 * These rows are what the dashboard has always returned. The mapper was
 * extracted so a repository's own review list returns the same thing, and
 * the key order is asserted because the dashboard's JSON must not change.
 */
describe('review feed mapper', () => {
  const repository = { name: 'BSLCTR', fullName: 'Muhammad-AIUB/BSLCTR' };
  const createdAt = new Date('2026-06-12T11:28:00.000Z');

  it('maps a pull request to the dashboard row', () => {
    const row = pullRequestFeedItem({
      id: 5,
      title: 'Add login',
      author: 'octocat',
      status: 'completed',
      prNumber: 12,
      createdAt,
      repository,
      review: { overallScore: 81 },
    } as never);

    expect(row).toEqual({
      kind: 'pr',
      id: 5,
      title: 'Add login',
      author: 'octocat',
      status: 'completed',
      pr_number: 12,
      created_at: '2026-06-12T11:28:00+00:00',
      repository: { name: 'BSLCTR', full_name: 'Muhammad-AIUB/BSLCTR' },
      score: 81,
      url: '/reviews/5',
    });
    expect(Object.keys(row)).toEqual([
      'kind',
      'id',
      'title',
      'author',
      'status',
      'pr_number',
      'created_at',
      'repository',
      'score',
      'url',
    ]);
  });

  it('gives a pull request with no review yet a null score', () => {
    const row = pullRequestFeedItem({ id: 5, createdAt, repository, review: null } as never);

    expect(row.score).toBeNull();
  });

  it('maps a commit review, keeping only the first line of the message', () => {
    const row = commitReviewFeedItem({
      id: 9,
      commitMessage: 'Fix the parser\n\nLong body',
      author: 'octocat',
      status: 'analyzing',
      commitSha: '0123456789abcdef',
      branch: 'main',
      createdAt,
      repository,
      overallScore: null,
    } as never);

    expect(row).toEqual({
      kind: 'commit',
      id: 9,
      title: 'Fix the parser',
      author: 'octocat',
      status: 'analyzing',
      short_sha: '0123456',
      branch: 'main',
      created_at: '2026-06-12T11:28:00+00:00',
      repository: { name: 'BSLCTR', full_name: 'Muhammad-AIUB/BSLCTR' },
      score: null,
      url: '/commits/9',
    });
  });

  it('labels a commit that has no message', () => {
    const row = commitReviewFeedItem({
      id: 9,
      commitMessage: null,
      commitSha: 'abcdef0123',
      createdAt,
      repository,
    } as never);

    expect(row.title).toBe('(no commit message)');
  });

  it('survives a row whose repository relation was not loaded', () => {
    const row = pullRequestFeedItem({ id: 5, createdAt } as never);

    expect(row.repository).toEqual({ name: null, full_name: null });
  });
});
