import { redirect } from 'next/navigation';
import { apiRaw } from './api';
import type { SessionUser } from './types';

/**
 * The replacement for Inertia's shared `auth.user` prop, which every
 * authenticated page read from HandleInertiaRequests.
 *
 * Each page fetches it server-side. Nothing about the session reaches the
 * browser: the cookie is httpOnly and the API origin is never exposed.
 */
export async function getSessionUser(): Promise<SessionUser> {
  const response = await apiRaw('/auth/me');

  if (response.status === 401) {
    redirect('/login');
  }

  if (!response.ok) {
    throw new Error(`Could not load the session (${response.status}).`);
  }

  const body = (await response.json()) as { user: SessionUser };

  return body.user;
}

/** For pages that render either way — /security is the one. */
export async function getOptionalSessionUser(): Promise<SessionUser | null> {
  const response = await apiRaw('/auth/me');

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as { user: SessionUser };

  return body.user;
}
