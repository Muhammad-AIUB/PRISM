import type { Metadata } from 'next';
import ReviewShowView from '@/components/review/ReviewShowView';
import { apiGetAuthed } from '@/lib/api';
import { getSessionUser } from '@/lib/session';
import type { PullRequestDetail, ReviewDetail } from '@/lib/types';

interface ShowResponse {
  pullRequest: PullRequestDetail;
  review: ReviewDetail | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pullRequest: string }>;
}): Promise<Metadata> {
  const { pullRequest } = await params;
  const data = await apiGetAuthed<ShowResponse>(`/reviews/${pullRequest}`);

  return { title: `Review · ${data.pullRequest.title}` };
}

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ pullRequest: string }>;
}) {
  const { pullRequest } = await params;

  const [user, data] = await Promise.all([
    getSessionUser(),
    apiGetAuthed<ShowResponse>(`/reviews/${pullRequest}`),
  ]);

  return <ReviewShowView user={user} pullRequest={data.pullRequest} review={data.review} />;
}
