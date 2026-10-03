import { ArrowLeft, ExternalLink, Settings } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import AuthenticatedLayout from '@/components/layouts/AuthenticatedLayout';
import ModeBadge from '@/components/repositories/ModeBadge';
import RepositoryReviewsView from '@/components/repositories/RepositoryReviewsView';
import { apiGetAuthed } from '@/lib/api';
import { reviewsQuery } from '@/lib/repository-reviews';
import { getSessionUser } from '@/lib/session';
import type { RepositoryReviewsData } from '@/lib/types';

interface Props {
  params: Promise<{ repository: string }>;
  searchParams: Promise<{ kind?: string | string[]; page?: string | string[] }>;
}

/**
 * One request serves both the title and the page. Every API call leaves from
 * this server's address and counts against a throttle bucket all visitors
 * share, so fetching the same list twice per view is not free.
 */
const loadReviews = cache((repository: string, query: string) =>
  apiGetAuthed<RepositoryReviewsData>(
    `/repositories/${encodeURIComponent(repository)}/reviews${query}`,
  ),
);

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ repository }, search] = await Promise.all([params, searchParams]);
  const data = await loadReviews(repository, reviewsQuery(search));

  return { title: `Reviews · ${data.repository.full_name}` };
}

export default async function RepositoryReviewsPage({ params, searchParams }: Props) {
  const [{ repository }, search] = await Promise.all([params, searchParams]);

  const [user, data] = await Promise.all([
    getSessionUser(),
    loadReviews(repository, reviewsQuery(search)),
  ]);

  return (
    <AuthenticatedLayout
      user={user}
      header={
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p
              className="text-xs font-medium uppercase tracking-wider sm:text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              Repository
            </p>
            <div className="mt-0.5 flex min-w-0 items-center gap-3">
              <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
                {data.repository.full_name}
              </h1>
              <ModeBadge mode={data.repository.review_mode} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <a
              href={`https://github.com/${data.repository.full_name}`}
              target="_blank"
              rel="noreferrer"
              aria-label="Open on GitHub"
              className="btn btn-ghost min-h-[44px] transition active:scale-95"
              style={{ padding: '0.375rem 0.625rem' }}
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <Link
              href={`/repositories/${data.repository.id}/settings`}
              aria-label="Repository settings"
              className="btn btn-ghost min-h-[44px] transition active:scale-95"
              style={{ padding: '0.375rem 0.625rem' }}
            >
              <Settings className="h-4 w-4" />
            </Link>
            <Link
              href="/repositories"
              className="btn btn-ghost min-h-[44px] transition active:scale-95"
              style={{ padding: '0.375rem 0.625rem' }}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Back</span>
            </Link>
          </div>
        </div>
      }
    >
      <RepositoryReviewsView data={data} />
    </AuthenticatedLayout>
  );
}
