import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FeedItem } from '@/lib/types';
import ReviewFeedTable from './ReviewFeedTable';

function row(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
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
    ...overrides,
  };
}

// jsdom applies no CSS, so the stacked (mobile) and tabular (desktop) layouts
// are both in the document and every row appears twice.
describe('ReviewFeedTable', () => {
  it('links every row to its review', () => {
    render(<ReviewFeedTable rows={[row()]} kind="prs" />);

    const links = screen.getAllByRole('link', { name: /#12 Add login/ });

    expect(links).toHaveLength(2);
    links.forEach((link) => expect(link).toHaveAttribute('href', '/reviews/5'));
  });

  it('identifies a commit by its short sha', () => {
    render(
      <ReviewFeedTable
        rows={[
          row({
            kind: 'commit',
            short_sha: '0123456',
            pr_number: undefined,
            title: 'Fix parser',
            url: '/commits/9',
          }),
        ]}
        kind="commits"
      />,
    );

    const links = screen.getAllByRole('link', { name: /0123456 Fix parser/ });

    expect(links).toHaveLength(2);
    links.forEach((link) => expect(link).toHaveAttribute('href', '/commits/9'));
    expect(screen.getByRole('columnheader', { name: 'Commit' })).toBeInTheDocument();
  });

  it('names the repository on the dashboard', () => {
    render(<ReviewFeedTable rows={[row()]} kind="prs" />);

    expect(screen.getByRole('columnheader', { name: 'Repository' })).toBeInTheDocument();
    expect(screen.getAllByText('Muhammad-AIUB/BSLCTR')).toHaveLength(2);
  });

  it('leaves the repository out where the page is already about one', () => {
    render(<ReviewFeedTable rows={[row()]} kind="prs" showRepository={false} />);

    expect(screen.queryByRole('columnheader', { name: 'Repository' })).not.toBeInTheDocument();
    expect(screen.queryByText('Muhammad-AIUB/BSLCTR')).not.toBeInTheDocument();
  });
});
