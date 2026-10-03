import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConnectedRepo, GithubRepo } from '@/lib/types';
import RepoCard from './RepoCard';

const repo: GithubRepo = {
  id: 900,
  name: 'BSLCTR',
  full_name: 'Muhammad-AIUB/BSLCTR',
  html_url: 'https://github.com/Muhammad-AIUB/BSLCTR',
  language: 'TypeScript',
};

const connected: ConnectedRepo = {
  id: 3,
  github_repo_id: 900,
  full_name: 'Muhammad-AIUB/BSLCTR',
  review_mode: 'commit_only',
  review_branches: ['main'],
};

describe('RepoCard', () => {
  it('opens the repository reviews when a connected card is clicked', () => {
    render(
      <RepoCard
        repo={repo}
        isConnected
        connectedRepo={connected}
        isLoading={false}
        onConnect={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('link', { name: 'View reviews for Muhammad-AIUB/BSLCTR' }),
    ).toHaveAttribute('href', '/repositories/3');
  });

  it('keeps the GitHub and settings links on a connected card', () => {
    render(
      <RepoCard
        repo={repo}
        isConnected
        connectedRepo={connected}
        isLoading={false}
        onConnect={vi.fn()}
      />,
    );

    expect(screen.getByRole('link', { name: 'Muhammad-AIUB/BSLCTR' })).toHaveAttribute(
      'href',
      'https://github.com/Muhammad-AIUB/BSLCTR',
    );
    expect(screen.getByRole('link', { name: 'Repository settings' })).toHaveAttribute(
      'href',
      '/repositories/3/settings',
    );
  });

  it('offers only Connect on a repository that is not connected', () => {
    render(<RepoCard repo={repo} isConnected={false} isLoading={false} onConnect={vi.fn()} />);

    expect(screen.queryByRole('link', { name: /View reviews/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  });
});
