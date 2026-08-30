'use client';

import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { GitBranch, GitCommit, GitPullRequest, Info, Plus, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ComponentType } from 'react';
import { Line } from 'react-chartjs-2';
import { AuthorAvatar, ScorePill, StatusPill } from '@/components/ui/pills';
import { relativeTime } from '@/lib/time';
import type { DashboardData, FeedItem } from '@/lib/types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
);

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="card flex items-start justify-between">
      <div>
        <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {label}
        </p>
        <p className="mt-2 text-3xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          {value}
        </p>
        {hint && (
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            {hint}
          </p>
        )}
      </div>
      <div
        className="grid h-9 w-9 place-items-center rounded-md"
        style={{
          color: 'var(--accent)',
          backgroundColor: 'rgba(99,102,241,0.12)',
          border: '1px solid rgba(99,102,241,0.25)',
        }}
      >
        <Icon className="h-4 w-4" />
      </div>
    </div>
  );
}

function ScoreTimeline({ timeline }: { timeline: DashboardData['timeline'] }) {
  if (timeline.length === 0) {
    return null;
  }

  const data = {
    labels: timeline.map((point) => {
      if (!point.date) {
        return '';
      }

      const date = new Date(point.date);

      return Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }),
    datasets: [
      {
        label: 'Score',
        data: timeline.map((point) => point.score),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.15)',
        pointBackgroundColor: '#818cf8',
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.35,
        fill: true,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1a1a24',
        borderColor: '#2a2a36',
        borderWidth: 1,
        titleColor: '#f1f5f9',
        bodyColor: '#94a3b8',
        callbacks: {
          title: (items: { dataIndex: number }[]) =>
            timeline[items[0]?.dataIndex ?? 0]?.pr ?? '',
          label: (item: { parsed: { y: number } }) => ` Score: ${item.parsed.y}/100`,
        },
      },
    },
    scales: {
      x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(42,42,54,0.5)' } },
      y: {
        min: 0,
        max: 100,
        ticks: { color: '#64748b', stepSize: 25 },
        grid: { color: 'rgba(42,42,54,0.5)' },
      },
    },
  };

  return (
    <div className="h-64">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <Line data={data} options={options as any} />
    </div>
  );
}

export default function DashboardView({ data }: { data: DashboardData }) {
  const {
    total_repos,
    total_prs,
    total_commits,
    avg_score,
    recent_prs,
    recent_commits,
    timeline,
  } = data;

  const router = useRouter();

  // Commit-only users land on the commit list rather than an empty PR tab.
  const [tab, setTab] = useState<'prs' | 'commits'>(
    recent_prs.length === 0 && recent_commits.length > 0 ? 'commits' : 'prs',
  );

  const rows: FeedItem[] = tab === 'prs' ? recent_prs : recent_commits;

  const hasInFlight =
    recent_prs.some((row) => row.status === 'pending' || row.status === 'analyzing') ||
    recent_commits.some((row) => row.status === 'pending' || row.status === 'analyzing');

  /**
   * Poll while anything is still being reviewed, so a fresh push appears
   * without a manual reload. Inertia did this with a partial reload; the
   * equivalent here is router.refresh(), which re-runs the server component
   * and swaps in new data without losing the selected tab or the scroll
   * position.
   */
  useEffect(() => {
    if (!hasInFlight) {
      return;
    }

    const id = setInterval(() => router.refresh(), 8000);

    return () => clearInterval(id);
  }, [hasInFlight, router]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-6">
        <StatCard icon={GitBranch} label="Repos" value={total_repos} />
        <StatCard icon={GitPullRequest} label="PRs Reviewed" value={total_prs} />
        <StatCard icon={GitCommit} label="Commits Reviewed" value={total_commits} />
        <StatCard
          icon={TrendingUp}
          label="Average Score"
          value={avg_score ?? '—'}
          hint="PR reviews"
        />
      </div>

      {timeline.length > 0 && (
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Score Timeline</h2>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {timeline.length} review{timeline.length === 1 ? '' : 's'}
            </span>
          </div>
          <ScoreTimeline timeline={timeline} />
        </div>
      )}

      <div className="card-flat overflow-hidden">
        <div
          className="flex flex-col gap-2 border-b px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: 'var(--border)' }}
        >
          <nav className="-mx-1 flex gap-1" aria-label="Review type">
            {(
              [
                {
                  key: 'prs',
                  label: 'Pull Requests',
                  icon: GitPullRequest,
                  count: total_prs,
                  tip: 'Reviews from PRs you opened (PR Mode)',
                },
                {
                  key: 'commits',
                  label: 'Commits',
                  icon: GitCommit,
                  count: total_commits,
                  tip: 'Reviews from direct pushes (Commit Mode)',
                },
              ] as const
            ).map(({ key, label, icon: Icon, count, tip }) => {
              const isActive = tab === key;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  title={tip}
                  className={`tab-item ${isActive ? 'tab-item-active' : ''}`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                  <span
                    className="rounded-full px-1.5 text-[10px]"
                    style={{
                      backgroundColor: 'var(--bg-hover)',
                      color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                    }}
                  >
                    {count}
                  </span>
                  <Info
                    className="h-3 w-3 opacity-50"
                    style={{ color: 'var(--text-muted)' }}
                    aria-hidden
                  />
                </button>
              );
            })}
          </nav>
          {rows.length > 0 && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Showing last {rows.length}
            </span>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <div
              className="mx-auto grid h-12 w-12 place-items-center rounded-full"
              style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent)' }}
            >
              {tab === 'prs' ? (
                <GitPullRequest className="h-6 w-6" />
              ) : (
                <GitCommit className="h-6 w-6" />
              )}
            </div>
            <h3 className="mt-4 text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
              {tab === 'prs' ? 'No pull request reviews yet' : 'No commit reviews yet'}
            </h3>
            <p
              className="mx-auto mt-2 max-w-md text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              {tab === 'prs'
                ? 'Connect a repository and open a pull request to get AI-powered reviews.'
                : 'Connect a repository in commit mode and push to a watched branch.'}
            </p>

            {/* Cross-link to the other mode — the discoverability nudge. */}
            <div
              className="mt-4 inline-flex flex-wrap items-center justify-center gap-2 rounded-md px-4 py-2 text-sm"
              style={{ backgroundColor: 'var(--bg-hover)' }}
            >
              <Info className="h-4 w-4" style={{ color: 'var(--info)' }} />
              <span style={{ color: 'var(--text-secondary)' }}>
                {tab === 'prs' ? 'Working directly on main?' : 'Working in a team?'}
              </span>
              <Link
                href="/repositories"
                className="font-medium hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                {tab === 'prs' ? 'Enable Commit Mode →' : 'Use PR Mode instead →'}
              </Link>
            </div>

            <div className="mt-6">
              <Link href="/repositories" className="btn btn-primary inline-flex">
                <Plus className="h-4 w-4" /> Connect Repository
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <ul className="divide-y md:hidden" style={{ borderColor: 'var(--border)' }}>
              {rows.map((row) => (
                <li
                  key={`${row.kind}-${row.id}`}
                  className="px-4 py-3 transition active:bg-hover"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <Link href={row.url} className="block">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate font-mono text-[11px]"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {row.repository?.full_name ?? '—'}
                        </p>
                        <p
                          className="mt-0.5 inline-flex items-center gap-1.5 truncate text-sm font-medium"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {row.kind === 'pr' ? (
                            <GitPullRequest
                              className="h-3.5 w-3.5 shrink-0"
                              style={{ color: 'var(--text-muted)' }}
                            />
                          ) : (
                            <GitCommit
                              className="h-3.5 w-3.5 shrink-0"
                              style={{ color: 'var(--text-muted)' }}
                            />
                          )}
                          <span className="truncate">
                            <span style={{ color: 'var(--text-muted)' }}>
                              {row.kind === 'pr' ? `#${row.pr_number}` : row.short_sha}
                            </span>{' '}
                            {row.title}
                          </span>
                        </p>
                        <div className="mt-2 flex items-center gap-3">
                          <StatusPill status={row.status} />
                          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            {relativeTime(row.created_at)}
                          </span>
                        </div>
                      </div>
                      <ScorePill score={row.score} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {/* md+: full table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full">
                <thead>
                  <tr
                    className="text-left text-xs uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <th className="px-5 py-3 font-medium">Repository</th>
                    <th className="px-5 py-3 font-medium">
                      {tab === 'prs' ? 'PR Title' : 'Commit'}
                    </th>
                    <th className="px-5 py-3 font-medium">Author</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Score</th>
                    <th className="px-5 py-3 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={`${row.kind}-${row.id}`}
                      className="border-t text-sm transition-colors hover:bg-hover"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <td
                        className="whitespace-nowrap px-5 py-3 font-mono text-xs"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {row.repository?.full_name ?? '—'}
                      </td>
                      <td className="px-5 py-3" style={{ maxWidth: '24rem', width: '24rem' }}>
                        <Link
                          href={row.url}
                          className="flex w-full min-w-0 items-center gap-2 font-medium"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {row.kind === 'pr' ? (
                            <GitPullRequest
                              className="h-4 w-4 shrink-0"
                              style={{ color: 'var(--text-muted)' }}
                            />
                          ) : (
                            <GitCommit
                              className="h-4 w-4 shrink-0"
                              style={{ color: 'var(--text-muted)' }}
                            />
                          )}
                          <span className="block min-w-0 flex-1 truncate">
                            <span style={{ color: 'var(--text-muted)' }}>
                              {row.kind === 'pr' ? `#${row.pr_number}` : row.short_sha}
                            </span>{' '}
                            {row.title}
                          </span>
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <span
                          className="inline-flex items-center gap-2 text-xs"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          <AuthorAvatar login={row.author} />
                          {row.author}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <StatusPill status={row.status} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <ScorePill score={row.score} />
                      </td>
                      <td
                        className="whitespace-nowrap px-5 py-3 text-xs"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {relativeTime(row.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
