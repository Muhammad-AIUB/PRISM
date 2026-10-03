'use client';

import { Search, X } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { connectRepository } from '@/app/repositories/actions';
import BranchPicker from '@/components/repositories/BranchPicker';
import ModeSelector, { CONNECT_MODE_OPTIONS } from '@/components/repositories/ModeSelector';
import RepoCard from '@/components/repositories/RepoCard';
import FlashBanner from '@/components/ui/FlashBanner';
import AuthenticatedLayout from '@/components/layouts/AuthenticatedLayout';
import type { GithubRepo, RepositoriesIndexData, SessionUser } from '@/lib/types';

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
              <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
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

/** What the visitor can do about each way GitHub refuses the listing. */
function githubErrorHint(status: number): string {
  if (status === 401) {
    return "GitHub no longer accepts PRism's access to your account. Sign out and sign in with GitHub again.";
  }
  if (status === 403 || status === 429) {
    return `GitHub is rate limiting requests right now (${status}). Try again in a few minutes.`;
  }
  if (status === 0) {
    return 'GitHub did not respond. Reload the page to try again.';
  }
  return `GitHub returned an error (${status}). Reload the page to try again.`;
}

export default function RepositoriesView({
  user,
  data,
}: {
  user: SessionUser;
  data: RepositoriesIndexData;
}) {
  const { repos, connectedIds, connectedRepos, githubError } = data;
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
              className="text-xs font-medium uppercase tracking-wider sm:text-xs"
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
            <p className="text-sm font-medium">
              {githubError ? 'Could not load your repositories' : 'No repositories found'}
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              {githubError
                ? githubErrorHint(githubError.status)
                : query
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
