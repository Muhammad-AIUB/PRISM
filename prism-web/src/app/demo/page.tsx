import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  Info,
  LogIn,
  TrendingUp,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ComponentType } from 'react';
import DemoLayout, {
  DemoLanguageDot,
  DemoModeBadge,
  DemoScorePill,
} from '@/components/demo/DemoLayout';
import { apiGet } from '@/lib/api';

export const metadata: Metadata = { title: 'Demo' };

/**
 * Port of Pages/Demo/Dashboard.jsx. Public and stateless: the sample data
 * comes from the API's hardcoded set, so no database, AI or GitHub call is
 * involved and nobody needs an account to look at it.
 */
interface DemoIndexData {
  isDemo: boolean;
  stats: {
    repos: number;
    prs_reviewed: number;
    commits_reviewed: number;
    avg_score: number;
  };
  repositories: { name: string; language: string; review_mode: string; reviews: number }[];
  recent_reviews: {
    id: number;
    pr_title: string;
    repo: string;
    language: string;
    score: number;
    status: string;
    created_at: string;
  }[];
}

const STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'var(--warning)' },
  analyzing: { label: 'Analyzing', color: 'var(--info)' },
  completed: { label: 'Completed', color: 'var(--success)' },
  failed: { label: 'Failed', color: 'var(--danger)' },
};

function StatusPill({ status }: { status: string }) {
  const entry = STATUS[status] ?? { label: status, color: 'var(--text-muted)' };

  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: entry.color }}
      />
      <span style={{ color: 'var(--text-primary)' }}>{entry.label}</span>
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
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

export default async function DemoPage() {
  const data = await apiGet<DemoIndexData>('/demo');

  return (
    <DemoLayout active="dashboard">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-[10px] font-medium uppercase tracking-wider sm:text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            Overview
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
            Dashboard
          </h1>
        </div>
        <Link href="/login" className="btn btn-primary min-h-[44px]">
          <LogIn className="h-4 w-4" /> Sign in for real
        </Link>
      </div>

      <div className="space-y-4 sm:space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-6">
          <StatCard icon={GitBranch} label="Repos" value={data.stats.repos} />
          <StatCard icon={GitPullRequest} label="PRs Reviewed" value={data.stats.prs_reviewed} />
          <StatCard
            icon={GitCommit}
            label="Commits Reviewed"
            value={data.stats.commits_reviewed}
          />
          <StatCard
            icon={TrendingUp}
            label="Average Score"
            value={data.stats.avg_score}
            hint="Across all reviews"
          />
        </div>

        <div className="card-flat overflow-hidden">
          <div className="border-b px-5 py-3" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-sm font-semibold">Connected repositories</h2>
          </div>
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {data.repositories.map((repo) => (
              <li
                key={repo.name}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <DemoLanguageDot language={repo.language} />
                  <span className="truncate font-mono" style={{ color: 'var(--text-primary)' }}>
                    {repo.name}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>{repo.language}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {repo.reviews} reviews
                  </span>
                  <DemoModeBadge mode={repo.review_mode} />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="card-flat overflow-hidden">
          <div
            className="flex items-center justify-between border-b px-5 py-3"
            style={{ borderColor: 'var(--border)' }}
          >
            <h2 className="text-sm font-semibold">Recent reviews</h2>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Sample data
            </span>
          </div>

          <ul className="divide-y md:hidden" style={{ borderColor: 'var(--border)' }}>
            {data.recent_reviews.map((review) => (
              <li key={review.id} className="px-4 py-3">
                <Link href={`/demo/review/${review.id}`} className="block">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate font-mono text-[11px]"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {review.repo}
                      </p>
                      <p
                        className="mt-0.5 truncate text-sm font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {review.pr_title}
                      </p>
                      <div className="mt-2 flex items-center gap-3">
                        <StatusPill status={review.status} />
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {review.created_at}
                        </span>
                      </div>
                    </div>
                    <DemoScorePill score={review.score} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full">
              <thead>
                <tr
                  className="text-left text-xs uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <th className="px-5 py-3 font-medium">Repository</th>
                  <th className="px-5 py-3 font-medium">PR Title</th>
                  <th className="px-5 py-3 font-medium">Language</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Score</th>
                  <th className="px-5 py-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_reviews.map((review) => (
                  <tr
                    key={review.id}
                    className="border-t text-sm transition-colors hover:bg-hover"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <td
                      className="whitespace-nowrap px-5 py-3 font-mono text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {review.repo}
                    </td>
                    <td className="max-w-md px-5 py-3">
                      <Link
                        href={`/demo/review/${review.id}`}
                        className="truncate font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {review.pr_title}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <DemoLanguageDot language={review.language} />
                        {review.language}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <StatusPill status={review.status} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <DemoScorePill score={review.score} />
                    </td>
                    <td
                      className="whitespace-nowrap px-5 py-3 text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {review.created_at}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div
          className="rounded-md p-5 text-center sm:p-6"
          style={{
            backgroundColor: 'var(--accent-bg)',
            border: '1px solid rgba(99,102,241,0.30)',
          }}
        >
          <Info className="mx-auto h-5 w-5" style={{ color: 'var(--accent)' }} />
          <p className="mt-2 text-sm" style={{ color: 'var(--text-primary)' }}>
            Everything you see is hardcoded sample data. The real PRism reviews <em>your</em> pull
            requests with AI.
          </p>
          <Link href="/login" className="btn btn-primary mt-4 inline-flex min-h-[44px]">
            <LogIn className="h-4 w-4" /> Sign in with GitHub
          </Link>
        </div>
      </div>
    </DemoLayout>
  );
}
