import { randomBytes } from 'node:crypto';
import type { Repository } from './entities';

export const REVIEW_MODES = ['pr_only', 'commit_only', 'both'] as const;

export type ReviewModeValue = (typeof REVIEW_MODES)[number];

/**
 * Port of Repository::webhookEvents(). This decides which GitHub events the
 * installed hook subscribes to, so it is what actually makes commit_only or
 * both work — the webhook handler's own gating is the second half.
 */
export function webhookEventsFor(reviewMode: string): string[] {
  switch (reviewMode) {
    case 'commit_only':
      return ['push'];
    case 'both':
      return ['pull_request', 'push'];
    default:
      return ['pull_request'];
  }
}

/**
 * Port of Repository::watchedBranches(). An empty or absent list means main
 * and master, NOT "watch everything" — a push to any other branch is ignored.
 */
export function watchedBranchesFor(
  reviewBranches: Repository['reviewBranches'] | undefined,
): string[] {
  if (!Array.isArray(reviewBranches) || reviewBranches.length === 0) {
    return ['main', 'master'];
  }

  return reviewBranches.map((branch) => String(branch)).filter((branch) => branch !== '');
}

/**
 * Port of Str::random(), which base64-encodes random bytes and keeps only the
 * alphanumeric characters. The alphabet matters: this value is copied into
 * GitHub's webhook `config.secret`, and it is compared byte-for-byte when
 * verifying deliveries.
 */
export function randomString(length = 40): string {
  let result = '';

  while (result.length < length) {
    result += randomBytes(Math.ceil(length * 2))
      .toString('base64')
      .replace(/[^A-Za-z0-9]/g, '');
  }

  return result.slice(0, length);
}
