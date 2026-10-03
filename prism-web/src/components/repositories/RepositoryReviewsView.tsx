'use client';

import { ChevronLeft, ChevronRight, GitCommit, GitPullRequest } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import ReviewFeedTable from '@/components/review/ReviewFeedTable';
import type { RepositoryReviewsData } from '@/lib/types';

type Kind = RepositoryReviewsData['kind'];

const TABS = [
  { key: 'prs', label: 'Pull Requests', icon: GitPullRequest },
  { key: 'commits', label: 'Commits', icon: GitCommit },
] as const;

/**
 * Every review for one repository: the dashboard's table without its cap.
 *
 * The tab and the page live in the URL rather than in state, so a list can be
 * linked to and the server component fetches exactly what is shown.
 */
export default function RepositoryReviewsView({ data }: { data: RepositoryReviewsData }) {
  const { repository, kind, total_prs, total_commits, page, per_page, items } = data;
  const router = useRouter();

  const totals: Record<Kind, number> = { prs: total_prs, commits: total_commits };
  const lastPage = Math.max(1, Math.ceil(totals[kind] / per_page));

  const href = (target: Kind, targetPage = 1) =>
    `/repositories/${repository.id}?kind=${target}${targetPage > 1 ? `&page=${targetPage}` : ''}`;

  const hasInFlight = items.some((row) => row.status === 'pending' || row.status === 'analyzing');

  // Poll while anything is still being reviewed, as the dashboard does, so a
  // fresh push appears without a manual reload.
  useEffect(() => {
    if (!hasInFlight) {
      return;
    }

    const id = setInterval(() => router.refresh(), 8000);

    return () => clearInterval(id);
  }, [hasInFlight, router]);

  const EmptyIcon = kind === 'prs' ? GitPullRequest : GitCommit;

  return (
    <div className="card-flat overflow-hidden">
      <div className="border-b px-5" style={{ borderColor: 'var(--border)' }}>
        <nav className="-mx-1 flex gap-1" aria-label="Review type">
          {TABS.map(({ key, label, icon: Icon }) => {
            const isActive = kind === key;

            return (
              <Link
                key={key}
                href={href(key)}
                aria-current={isActive ? 'page' : undefined}
                className={`tab-item ${isActive ? 'tab-item-active' : ''}`}
              >
                <Icon className="h-4 w-4" />
                {label}
                <span
                  className="rounded-full px-1.5 text-xs"
                  style={{
                    backgroundColor: 'var(--bg-hover)',
                    color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                >
                  {totals[key]}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <div
            className="mx-auto grid h-12 w-12 place-items-center rounded-full"
            style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent)' }}
          >
            <EmptyIcon className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
            {page > 1
              ? 'Nothing on this page'
              : kind === 'prs'
                ? 'No pull request reviews yet'
                : 'No commit reviews yet'}
          </h2>
          {page === 1 && (
            <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: 'var(--text-secondary)' }}>
              {kind === 'prs'
                ? 'Open a pull request in this repository and PRism will review it.'
                : 'Push to a watched branch and PRism will review the commit.'}
            </p>
          )}
        </div>
      ) : (
        <ReviewFeedTable rows={items} kind={kind} showRepository={false} />
      )}

      {(lastPage > 1 || page > 1) && (
        <div
          className="flex items-center justify-between gap-3 border-t px-5 py-3 text-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          <span style={{ color: 'var(--text-muted)' }}>
            Page {page} of {lastPage}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              // From past the end, "previous" is the last page that exists.
              <Link href={href(kind, Math.min(page - 1, lastPage))} className="btn btn-secondary">
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Link>
            )}
            {page < lastPage && (
              <Link href={href(kind, page + 1)} className="btn btn-secondary">
                Next
                <ChevronRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
