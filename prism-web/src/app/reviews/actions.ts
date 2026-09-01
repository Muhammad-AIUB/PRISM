'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, apiRaw, apiSend } from '@/lib/api';

/**
 * Re-analyze and diff loading for the review screens, kept server-side so the
 * API origin and the session cookie stay off the browser.
 */
export interface ActionResult {
  ok: boolean;
  message: string;
}

export async function reAnalyzePullRequest(id: number): Promise<ActionResult> {
  try {
    const body = await apiSend<{ message: string }>(`/reviews/${id}/re-analyze`, 'POST');

    revalidatePath(`/reviews/${id}`);
    revalidatePath('/dashboard');

    return { ok: true, message: body.message };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof ApiError ? error.message : 'Could not start a re-analysis.',
    };
  }
}

export async function reAnalyzeCommit(id: number): Promise<ActionResult> {
  try {
    const body = await apiSend<{ message: string }>(`/commits/${id}/re-analyze`, 'POST');

    revalidatePath(`/commits/${id}`);
    revalidatePath('/dashboard');

    return { ok: true, message: body.message };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof ApiError ? error.message : 'Could not start a re-analysis.',
    };
  }
}

/**
 * The raw unified diff, proxied by the API so the user's GitHub token is never
 * needed in the browser. GitHub's status is surfaced as an error string rather
 * than thrown, so the tab can render the failure inline.
 */
export async function loadDiff(id: number): Promise<{ diff: string; error: string | null }> {
  const response = await apiRaw(`/reviews/${id}/diff`);

  if (!response.ok) {
    return { diff: '', error: `HTTP ${response.status}` };
  }

  return { diff: await response.text(), error: null };
}
