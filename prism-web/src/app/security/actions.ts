'use server';

import { ApiError, apiSend } from '@/lib/api';

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * Irreversible. The API requires `confirm: 'DELETE'` and refuses anything
 * else, so the typed confirmation is enforced on both sides rather than only
 * being a UI gate.
 */
export async function deleteAllMyData(confirm: string): Promise<ActionResult> {
  try {
    const body = await apiSend<{ message: string }>('/security/my-data', 'DELETE', { confirm });

    return { ok: true, message: body.message };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof ApiError ? error.message : 'Could not delete your data.',
    };
  }
}
