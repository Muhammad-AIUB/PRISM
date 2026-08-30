import { redirect } from 'next/navigation';
import { apiRaw } from '@/lib/api';

/**
 * Port of Laravel's `/` route: dashboard when signed in, login otherwise.
 */
export default async function HomePage() {
  const response = await apiRaw('/auth/me');

  redirect(response.ok ? '/dashboard' : '/login');
}
