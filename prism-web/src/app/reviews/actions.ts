'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, apiGet, apiRaw, apiSend } from '@/lib/api';
import type { RiskAssessment } from '@/lib/types';

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

/**
 * Risk Radar for a pull request or a commit. Loaded after the page renders,
 * like the diff: it may need a GitHub round trip, and the verdict above it
 * should not wait for that.
 */
export async function loadRisk(
  kind: 'pull-request' | 'commit',
  id: number,
): Promise<{ risk: RiskAssessment | null; error: string | null }> {
  try {
    const { risk } = await apiGet<{ risk: RiskAssessment }>(
      kind === 'commit' ? `/commits/${id}/risk` : `/reviews/${id}/risk`,
    );

    return { risk, error: null };
  } catch (error) {
    return {
      risk: null,
      error: error instanceof ApiError ? error.message : 'Could not assess this change.',
    };
  }
}
