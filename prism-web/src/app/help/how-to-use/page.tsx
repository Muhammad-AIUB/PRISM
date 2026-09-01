import type { Metadata } from 'next';
import HowToUseView from '@/components/help/HowToUseView';
import { getSessionUser } from '@/lib/session';

export const metadata: Metadata = { title: 'How to Use' };

/**
 * The Laravel page took no props at all — its content lives entirely in the
 * component — but the route sat inside the auth group, so it stays behind the
 * session here too.
 */
export default async function HowToUsePage() {
  const user = await getSessionUser();

  return <HowToUseView user={user} />;
}
