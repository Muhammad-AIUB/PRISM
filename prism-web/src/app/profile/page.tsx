import type { Metadata } from 'next';
import ProfileView from '@/components/profile/ProfileView';
import { getSessionUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Profile' };

/**
 * The Laravel page also fetched `mustVerifyEmail` and a session `status`. Both
 * are dropped: the User model never implemented MustVerifyEmail, so the flag
 * was always false and the verification block it gated was dead markup.
 */
export default async function ProfilePage() {
  const user = await getSessionUser();

  return <ProfileView user={user} />;
}
