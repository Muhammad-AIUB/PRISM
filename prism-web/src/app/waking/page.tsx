import type { Metadata } from 'next';
import WakeView from '@/components/wake/WakeView';
import { apiOrigin, safeNext } from '@/lib/wake';

export const metadata: Metadata = { title: 'Starting up', robots: { index: false } };

/**
 * Where a page load lands when prism-api is asleep. See src/lib/wake.ts.
 *
 * This page must not call the API itself: that call would find it asleep and
 * redirect straight back here.
 */
export default async function WakingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;

  return <WakeView apiOrigin={apiOrigin()} next={safeNext(next)} />;
}
