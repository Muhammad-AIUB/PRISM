'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, apiGet, apiSend } from '@/lib/api';
import type { Branch } from '@/lib/types';

/**
 * Server actions for the repository screens.
 *
 * Why actions rather than fetching from the browser: the API origin and the
 * session cookie stay on the server. The client components below call these
 * and get back a plain result to render, which also replaces Laravel's
 * redirect-with-flash — there is no session to flash through any more.
 */
export interface ActionResult {
  ok: boolean;
  message: string;
  errors?: Record<string, string[]>;
}

function toResult(error: unknown, fallback: string): ActionResult {
  if (error instanceof ApiError) {
    return { ok: false, message: error.message, errors: error.errors };
  }

  return { ok: false, message: fallback };
}

export async function connectRepository(input: {
  github_repo_id: number;
  name: string;
  full_name: string;
  review_mode: string;
  review_branches: string[];
}): Promise<ActionResult> {
  try {
    const body = await apiSend<{ message: string }>('/repositories', 'POST', input);

    // The list shows connected state and the cached GitHub repo list, both of
    // which just changed.
    revalidatePath('/repositories');

    return { ok: true, message: body.message };
  } catch (error) {
    return toResult(error, 'Could not connect the repository.');
  }
}

export async function updateRepositorySettings(
  id: number,
  input: { review_mode: string; review_branches: string[] },
): Promise<ActionResult> {
  try {
    const body = await apiSend<{ message: string }>(
      `/repositories/${id}/settings`,
      'POST',
      input,
    );

    revalidatePath(`/repositories/${id}/settings`);
    revalidatePath('/repositories');

    return { ok: true, message: body.message };
  } catch (error) {
    return toResult(error, 'Could not save the settings.');
  }
}

/**
 * Loads a repository's branches for the picker. Returns an empty list on
 * failure rather than throwing, matching the API: a GitHub outage degrades the
 * picker instead of blocking the whole modal.
 */
export async function fetchBranches(fullName: string): Promise<Branch[]> {
  try {
    const body = await apiGet<{ branches: Branch[] }>(
      `/repositories/branches?full_name=${encodeURIComponent(fullName)}`,
    );

    return body.branches;
  } catch {
    return [];
  }
}
