import type { Metadata } from 'next';
import SecurityIndexView from '@/components/security/SecurityIndexView';
import { apiGet } from '@/lib/api';
import { getOptionalSessionUser } from '@/lib/session';
import type { SecurityIndexData } from '@/lib/types';

export const metadata: Metadata = { title: 'Security & Privacy' };

/**
 * Public. Uses the optional session helper rather than getSessionUser: an
 * anonymous visitor must get the page, not a redirect to sign in — reading
 * this before authorising anything is the whole point.
 */
export default async function SecurityPage() {
  const [user, data] = await Promise.all([
    getOptionalSessionUser(),
    apiGet<SecurityIndexData>('/security'),
  ]);

  return <SecurityIndexView data={data} user={user} />;
}
