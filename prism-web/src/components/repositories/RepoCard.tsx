'use client';

import { Check, ExternalLink, Lock, Settings, Star } from 'lucide-react';
import Link from 'next/link';
import ModeBadge from '@/components/repositories/ModeBadge';
import { relativeTime } from '@/lib/time';
import type { ConnectedRepo, GithubRepo } from '@/lib/types';

/** GitHub's own language colours, so the dots match what github.com shows. */
const LANG_COLORS: Record<string, string> = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  PHP: '#4F5D95',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#dea584',
  Ruby: '#701516',
  Java: '#b07219',
  Kotlin: '#A97BFF',
  Swift: '#F05138',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Vue: '#41b883',
  Shell: '#89e051',
  Dockerfile: '#384d54',
};

export default function RepoCard({
  repo,
  isConnected,
  connectedRepo,
  isLoading,
  onConnect,
}: {
  repo: GithubRepo;
  isConnected: boolean;
  connectedRepo?: ConnectedRepo;
  isLoading: boolean;
  onConnect: (repo: GithubRepo) => void;
}) {
  const stars = (repo as { stargazers_count?: number }).stargazers_count ?? 0;

  return (
    <div className="card relative flex flex-col gap-3 transition" style={{ minHeight: '180px' }}>
      {/* The whole card opens the repository's reviews. An anchor cannot
          contain the GitHub link and the gear, so this one is stretched over
          the card instead and those two are raised above it. Not prefetched:
          each prefetch would render the page, and with it spend API calls
          from the throttle bucket every visitor shares. */}
      {connectedRepo?.id && (
        <Link
          href={`/repositories/${connectedRepo.id}`}
          prefetch={false}
          aria-label={`View reviews for ${repo.full_name}`}
          className="absolute inset-0 z-0 rounded-[inherit]"
        />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <a
            href={repo.html_url}
            target="_blank"
            rel="noreferrer"
            className="relative z-10 inline-flex items-center gap-1.5 text-sm font-semibold transition hover:opacity-80"
            style={{ color: 'var(--text-primary)' }}
          >
            <span className="truncate">{repo.full_name}</span>
            <ExternalLink className="h-3 w-3" style={{ color: 'var(--text-muted)' }} />
          </a>
          {repo.private && (
            <span
              className="badge ml-2"
              style={{
                backgroundColor: 'var(--bg-hover)',
                color: 'var(--text-secondary)',
                borderColor: 'var(--border)',
              }}
            >
              <Lock className="h-3 w-3" /> private
            </span>
          )}
        </div>
      </div>

      <p
        className="line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed"
        style={{ color: 'var(--text-secondary)' }}
      >
        {repo.description || <em style={{ color: 'var(--text-muted)' }}>No description.</em>}
      </p>

      <div
        className="mt-auto flex items-center justify-between text-xs"
        style={{ color: 'var(--text-muted)' }}
      >
        <div className="flex flex-wrap items-center gap-3">
          {repo.language && (
            <span
              className="inline-flex items-center gap-1.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: LANG_COLORS[repo.language] ?? '#94a3b8' }}
              />
              {repo.language}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Star className="h-3 w-3" />
            {stars}
          </span>
          {repo.updated_at && (
            <span title={new Date(repo.updated_at).toLocaleString()}>
              Updated {relativeTime(repo.updated_at)}
            </span>
          )}
        </div>

        {isConnected ? (
          <div className="inline-flex flex-wrap items-center gap-2">
            <span
              className="badge"
              style={{
                backgroundColor: 'rgba(34,197,94,0.10)',
                color: 'var(--success)',
                borderColor: 'rgba(34,197,94,0.30)',
              }}
            >
              <Check className="h-3 w-3" /> Connected
            </span>
            {connectedRepo?.review_mode && <ModeBadge mode={connectedRepo.review_mode} />}
            {connectedRepo?.id && (
              <Link
                href={`/repositories/${connectedRepo.id}/settings`}
                aria-label="Repository settings"
                className="relative z-10 grid h-7 w-7 place-items-center rounded transition hover:bg-hover"
                style={{ color: 'var(--text-muted)' }}
              >
                <Settings className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        ) : (
          <button
            type="button"
            disabled={isLoading}
            onClick={() => onConnect(repo)}
            className="btn btn-primary min-h-[36px] transition active:scale-95"
            style={{ padding: '0.375rem 0.875rem', fontSize: '0.75rem' }}
          >
            {isLoading ? 'Connecting…' : 'Connect'}
          </button>
        )}
      </div>
    </div>
  );
}
