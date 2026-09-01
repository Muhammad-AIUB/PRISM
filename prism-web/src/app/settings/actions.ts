'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, apiSend } from '@/lib/api';
import type { ApiToken } from '@/lib/types';

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

export async function updateSettings(input: {
  email_notifications: boolean;
  slack_webhook_url: string | null;
}): Promise<ActionResult> {
  try {
    const body = await apiSend<{ message: string }>('/settings', 'POST', input);

    revalidatePath('/settings');

    return { ok: true, message: body.message };
  } catch (error) {
    return toResult(error, 'Could not save your settings.');
  }
}

/**
 * The plaintext token comes back here and nowhere else — only its sha256 is
 * stored — so the caller has to render it immediately.
 */
export async function createApiToken(
  name: string,
): Promise<ActionResult & { token?: ApiToken; plainTextToken?: string }> {
  try {
    const body = await apiSend<{ message: string; token: ApiToken; new_api_token: string }>(
      '/settings/api-tokens',
      'POST',
      { name },
    );

    revalidatePath('/settings');

    return {
      ok: true,
      message: body.message,
      token: body.token,
      plainTextToken: body.new_api_token,
    };
  } catch (error) {
    return toResult(error, 'Could not create the token.');
  }
}

export async function revokeApiToken(id: number): Promise<ActionResult> {
  try {
    const body = await apiSend<{ message: string }>(`/settings/api-tokens/${id}`, 'DELETE');

    revalidatePath('/settings');

    return { ok: true, message: body.message };
  } catch (error) {
    return toResult(error, 'Could not revoke the token.');
  }
}

/**
 * Sends a probe to a candidate webhook without saving it. A URL Slack rejects
 * is not an error here — the request succeeded, Slack just did not like it —
 * so the API answers 200 with an `ok` flag and that is passed straight through.
 */
export async function testSlackWebhook(url: string): Promise<ActionResult> {
  try {
    const body = await apiSend<{ ok: boolean; message: string }>(
      '/settings/test-slack',
      'POST',
      { slack_webhook_url: url },
    );

    return { ok: body.ok, message: body.message };
  } catch (error) {
    return toResult(error, 'Could not reach Slack.');
  }
}
