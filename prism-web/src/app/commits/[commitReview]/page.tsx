import type { Metadata } from 'next';
import CommitShowView from '@/components/review/CommitShowView';
import { apiGetAuthed } from '@/lib/api';
import { getSessionUser } from '@/lib/session';
import type { CommitReviewDetail } from '@/lib/types';

interface ShowResponse {
  commitReview: CommitReviewDetail;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ commitReview: string }>;
}): Promise<Metadata> {
  const { commitReview } = await params;
  const data = await apiGetAuthed<ShowResponse>(`/commits/${commitReview}`);

  return { title: `Commit · ${data.commitReview.short_sha}` };
}

export default async function CommitReviewPage({
  params,
}: {
  params: Promise<{ commitReview: string }>;
}) {
  const { commitReview } = await params;

  const [user, data] = await Promise.all([
    getSessionUser(),
    apiGetAuthed<ShowResponse>(`/commits/${commitReview}`),
  ]);

  return <CommitShowView user={user} commitReview={data.commitReview} />;
}
