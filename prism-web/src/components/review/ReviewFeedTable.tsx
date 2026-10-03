import { GitCommit, GitPullRequest } from 'lucide-react';
import Link from 'next/link';
import { AuthorAvatar, ScorePill, StatusPill } from '@/components/ui/pills';
import { relativeTime } from '@/lib/time';
import type { FeedItem } from '@/lib/types';

/**
 * The rows of a review list: stacked cards on a phone, a table from md up.
 *
 * Shared by the dashboard and a repository's own review page so the two
 * cannot drift. A page that is already about one repository passes
 * `showRepository={false}` rather than repeating its name on every row.
 */
export default function ReviewFeedTable({
  rows,
  kind,
  showRepository = true,
}: {
  rows: FeedItem[];
  kind: 'prs' | 'commits';
  showRepository?: boolean;
}) {
  return (
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
                  {showRepository && (
                    <p
                      className="truncate font-mono text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {row.repository?.full_name ?? '—'}
                    </p>
                  )}
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
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
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
              {showRepository && <th className="px-5 py-3 font-medium">Repository</th>}
              <th className="px-5 py-3 font-medium">{kind === 'prs' ? 'PR Title' : 'Commit'}</th>
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
                {showRepository && (
                  <td
                    className="whitespace-nowrap px-5 py-3 font-mono text-xs"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {row.repository?.full_name ?? '—'}
                  </td>
                )}
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
  );
}
