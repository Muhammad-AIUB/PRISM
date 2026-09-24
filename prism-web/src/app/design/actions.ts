'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, apiRaw, apiSend } from '@/lib/api';
import type { Blueprint, DesignBrief } from '@/lib/types';

export interface DesignActionResult {
  ok: boolean;
  message: string;
  id?: string;
  errors?: Record<string, string[]>;
}

/**
 * Generation takes a few seconds to most of a minute, and runs server-side
 * here so the API origin and session cookie never reach the browser.
 */
export async function createDesign(brief: DesignBrief): Promise<DesignActionResult> {
  try {
    const { design } = await apiSend<{ design: Blueprint }>('/design', 'POST', brief);

    revalidatePath('/design');

    return { ok: true, message: 'Design ready.', id: design.id };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        ok: false,
        message:
          error.status === 429
            ? 'You have generated a lot of designs this hour. Try again a little later.'
            : error.message,
        errors: error.errors,
      };
    }

    return { ok: false, message: 'Could not generate a design.' };
  }
}

export async function deleteDesign(id: string): Promise<DesignActionResult> {
  try {
    const body = await apiSend<{ message: string }>(`/design/${id}`, 'DELETE');

    revalidatePath('/design');

    return { ok: true, message: body.message };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof ApiError ? error.message : 'Could not delete the design.',
    };
  }
}

/** For the Copy as Markdown button: the same text the download serves. */
export async function loadDesignMarkdown(id: string): Promise<string | null> {
  const response = await apiRaw(`/design/${id}/markdown`);

  return response.ok ? response.text() : null;
}
