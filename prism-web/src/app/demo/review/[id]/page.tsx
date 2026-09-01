import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import DemoReviewDetailView, { type DemoReview } from '@/components/demo/DemoReviewDetailView';
import { ApiError, apiGet } from '@/lib/api';

interface DemoReviewResponse {
  isDemo: boolean;
  review: DemoReview;
}

/**
 * Public, like /demo. apiGet is used rather than apiGetAuthed because there is
 * no session here — which also means the 404 for an unknown id has to be
 * handled explicitly.
 */
async function load(id: string): Promise<DemoReviewResponse> {
  try {
    return await apiGet<DemoReviewResponse>(`/demo/review/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }

    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await load(id);

  return { title: `Demo · ${data.review.pr_title}` };
}

export default async function DemoReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await load(id);

  return <DemoReviewDetailView review={data.review} />;
}
