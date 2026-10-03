import { redirect } from 'next/navigation';
import { apiRaw } from '@/lib/api';

/**
 * Where "Continue with GitHub" starts.
 *
 * /auth/github is proxied straight to prism-api by the rewrite in
 * next.config.mjs, so nothing here sees its response. When the API was asleep
 * the visitor got Render's bare "Too Many Requests" and no way forward.
 *
 * One call through src/lib/api.ts first: a sleeping API ends it in a redirect
 * to the wake page, which comes back here once the API is up. Only then is the
 * browser handed to the real OAuth route.
 */
export async function GET(): Promise<never> {
  await apiRaw('/health');

  redirect('/auth/github');
}
