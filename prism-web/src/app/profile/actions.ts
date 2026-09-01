'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, apiSend } from '@/lib/api';

export interface ActionResult {
  ok: boolean;
  message: string;
  errors?: Record<string, string[]>;
}

export async function updateProfile(input: {
  name: string;
  email: string;
}): Promise<ActionResult> {
  try {
    await apiSend<{ user: unknown }>('/profile', 'PATCH', input);

    revalidatePath('/profile');
    // The sidebar shows the name and email, so every page's shell is stale.
    revalidatePath('/', 'layout');

    return { ok: true, message: 'Saved.' };
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, message: error.message, errors: error.errors };
    }

    return { ok: false, message: 'Could not save your profile.' };
  }
}

/**
 * Requires the current password, which GitHub-OAuth users do not have — the
 * same limitation as in Laravel. Those users delete their account from
 * Security → My Data instead.
 */
export async function deleteAccount(password: string): Promise<ActionResult> {
  try {
    await apiSend<void>('/profile', 'DELETE', { password });

    return { ok: true, message: 'Your account has been deleted.' };
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, message: error.message, errors: error.errors };
    }

    return { ok: false, message: 'Could not delete your account.' };
  }
}
