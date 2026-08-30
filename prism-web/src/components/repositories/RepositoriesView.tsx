'use client';

import {
  Check,
  ExternalLink,
  GitCommit,
  GitPullRequest,
  Layers,
  Lock,
  Search,
  Settings,
  Star,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, useTransition, type ComponentType } from 'react';
import { connectRepository } from '@/app/repositories/actions';
import BranchPicker from '@/components/repositories/BranchPicker';
import ModeSelector, { CONNECT_MODE_OPTIONS } from '@/components/repositories/ModeSelector';
import FlashBanner from '@/components/ui/FlashBanner';
import { relativeTime } from '@/lib/time';
import AuthenticatedLayout from '@/components/layouts/AuthenticatedLayout';
import type {
  ConnectedRepo,
  GithubRepo,
  RepositoriesIndexData,
  SessionUser,
} from '@/lib/types';

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

const MODE_BADGE: Record<
  string,
  { icon: ComponentType<{ className?: string }>; label: string; tone: string; color: string }
> = {
  pr_only: {
    icon: GitPullRequest,
    label: 'Pull Requests',
    tone: 'rgba(99,102,241,0.10)',
    color: 'var(--accent)',
  },
  commit_only: {
    icon: GitCommit,
    label: 'Commits',
    tone: 'rgba(59,130,246,0.10)',
    color: 'var(--info)',
  },
  both: { icon: Layers, label: 'Both', tone: 'rgba(34,197,94,0.10)', color: 'var(--success)' },
};

function ModeBadge({ mode }: { mode: string }) {
  const badge = MODE_BADGE[mode] ?? MODE_BADGE.pr_only!;
  const Icon = badge.icon;

  return (
    <span
      className="badge"
      style={{ backgroundColor: badge.tone, color: badge.color, borderColor: badge.color }}
      title={`Review mode: ${badge.label}`}
    >
      <Icon className="h-3 w-3" />
      {badge.label}
    </span>
  );
}

function ModeModal({
  repo,
  onClose,
  onSubmit,
  submitting,
}: {
  repo: GithubRepo | null;
  onClose: () => void;
  onSubmit: (repo: GithubRepo, mode: string, branches: string[]) => void;
  submitting: boolean;
}) {
  const [mode, setMode] = useState('pr_only');
  const [branches, setBranches] = useState<string[]>([]);

  if (!repo) {
    return null;
  }

  return (
    <>
      <div
        className="anim-fade-in fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="anim-fade-in w-full max-w-lg rounded-lg p-6 sm:p-7"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                Connect repository
              </p>
              <h2
                className="mt-1 truncate text-lg font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                {repo.full_name}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-md transition hover:bg-hover"
              style={{ color: 'var(--text-secondary)' }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
            How should PRism review code in this repository?
          </p>

          <div className="mt-4">
            <ModeSelector options={CONNECT_MODE_OPTIONS} value={mode} onChange={setMode} />
          </div>

          {(mode === 'commit_only' || mode === 'both') && (
            <div className="mt-4">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Branches to watch
              </label>
              <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Auto-loaded from your repo. Default branch is pre-selected — toggle as you like.
              </p>
              <div className="mt-2">
                <BranchPicker
                  fullName={repo.full_name}
                  selected={branches}
                  onChange={setBranches}
                />
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary min-h-[44px] transition active:scale-95"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              // Empty selection falls back to main/master, matching the API.
              onClick={() => onSubmit(repo, mode, branches.length ? branches : ['main', 'master'])}
              className="btn btn-primary min-h-[44px] transition active:scale-95"
            >
              {submitting ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function RepoCard({
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
    <div className="card flex flex-col gap-3 transition" style={{ minHeight: '180px' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <a
            href={repo.html_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold transition hover:opacity-80"
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
                className="grid h-7 w-7 place-items-center rounded transition hover:bg-hover"
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

export default function RepositoriesView({
  user,
  data,
}: {
  user: SessionUser;
  data: RepositoriesIndexData;
}) {
  const { repos, connectedIds, connectedRepos } = data;
  const [query, setQuery] = useState('');
  const [modalRepo, setModalRepo] = useState<GithubRepo | null>(null);
  const [connectingId, setConnectingId] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    if (!query.trim()) {
      return repos;
    }

    const needle = query.toLowerCase();

    return repos.filter(
      (repo) =>
        repo.full_name?.toLowerCase().includes(needle) ||
        repo.description?.toLowerCase().includes(needle) ||
        repo.language?.toLowerCase().includes(needle),
    );
  }, [repos, query]);

  const submitConnect = (repo: GithubRepo, mode: string, branches: string[]) => {
    setConnectingId(repo.id);

    startTransition(async () => {
      const result = await connectRepository({
        github_repo_id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        review_mode: mode,
        review_branches: branches,
      });

      setFlash({ type: result.ok ? 'success' : 'error', message: result.message });
      setConnectingId(null);
      setModalRepo(null);
    });
  };

  /**
   * The search box sits in the sticky header while the grid it filters sits in
   * the body, so this whole screen is one client component rather than a
   * server page with an island — otherwise the two could not share state.
   */
  return (
    <AuthenticatedLayout
      user={user}
      header={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p
              className="text-[10px] font-medium uppercase tracking-wider sm:text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              Connect
            </p>
            <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
              Repositories
            </h1>
          </div>
          <div className="relative w-full sm:w-72">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter repositories…"
              className="input min-h-[44px] pl-9"
            />
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {flash && <FlashBanner type={flash.type} message={flash.message} />}

        {filtered.length === 0 ? (
          <div className="card p-16 text-center">
            <p className="text-sm font-medium">No repositories found</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              {query
                ? 'Try a different search.'
                : 'Make sure your GitHub account has at least one repo.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {filtered.map((repo) => (
              <RepoCard
                key={repo.id}
                repo={repo}
                isConnected={connectedIds.includes(repo.id)}
                connectedRepo={connectedRepos[String(repo.id)]}
                isLoading={connectingId === repo.id}
                onConnect={setModalRepo}
              />
            ))}
          </div>
        )}
      </div>

      <ModeModal
        repo={modalRepo}
        onClose={() => setModalRepo(null)}
        onSubmit={submitConnect}
        submitting={connectingId !== null}
      />
    </AuthenticatedLayout>
  );
}
