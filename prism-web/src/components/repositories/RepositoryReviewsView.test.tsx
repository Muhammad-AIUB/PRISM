import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FeedItem, RepositoryReviewsData } from '@/lib/types';
import RepositoryReviewsView from './RepositoryReviewsView';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function item(id: number, overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    kind: 'commit',
    id,
    title: `Commit ${id}`,
    author: 'octocat',
    status: 'completed',
    short_sha: `abc000${id}`,
    branch: 'main',
    created_at: '2026-06-12T11:28:00+00:00',
    repository: { name: 'BSLCTR', full_name: 'Muhammad-AIUB/BSLCTR' },
    score: 80,
    url: `/commits/${id}`,
    ...overrides,
  };
}

function data(overrides: Partial<RepositoryReviewsData> = {}): RepositoryReviewsData {
  return {
    repository: { id: 3, name: 'BSLCTR', full_name: 'Muhammad-AIUB/BSLCTR', review_mode: 'both' },
    kind: 'commits',
    total_prs: 2,
    total_commits: 60,
    page: 2,
    per_page: 25,
    items: [item(1)],
    ...overrides,
  };
}

describe('RepositoryReviewsView', () => {
  it('lists the reviews and links each to its page', () => {
    render(<RepositoryReviewsView data={data()} />);

    const links = screen.getAllByRole('link', { name: /Commit 1/ });

    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) => expect(link).toHaveAttribute('href', '/commits/1'));
  });

  it('marks the tab the API returned, and counts both', () => {
    render(<RepositoryReviewsView data={data()} />);

    const commits = screen.getByRole('link', { name: /Commits\s*60/ });
    const prs = screen.getByRole('link', { name: /Pull Requests\s*2/ });

    expect(commits).toHaveAttribute('aria-current', 'page');
    expect(prs).not.toHaveAttribute('aria-current');
    expect(prs).toHaveAttribute('href', '/repositories/3?kind=prs');
  });

  it('pages within the same kind', () => {
    render(<RepositoryReviewsView data={data()} />);

    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute(
      'href',
      '/repositories/3?kind=commits',
    );
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/repositories/3?kind=commits&page=3',
    );
  });

  it('shows no pager when everything fits on one page', () => {
    render(<RepositoryReviewsView data={data({ page: 1, total_commits: 1 })} />);

    expect(screen.queryByText(/^Page /)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('says what triggers a review when there are none', () => {
    render(
      <RepositoryReviewsView
        data={data({ kind: 'prs', page: 1, total_prs: 0, total_commits: 0, items: [] })}
      />,
    );

    expect(screen.getByText('No pull request reviews yet')).toBeInTheDocument();
    expect(screen.getByText(/Open a pull request/)).toBeInTheDocument();
  });

  it('offers the way back from a page past the end', () => {
    render(<RepositoryReviewsView data={data({ page: 9, items: [] })} />);

    expect(screen.getByText('Nothing on this page')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute(
      'href',
      '/repositories/3?kind=commits&page=3',
    );
    expect(screen.queryByRole('link', { name: 'Next' })).not.toBeInTheDocument();
  });
});
