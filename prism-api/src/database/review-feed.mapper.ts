import { toIso8601String } from '../common/utils/iso8601';
import type { CommitReview, PullRequest } from './entities';

/**
 * One row of a review list: the dashboard feed, and a repository's own list.
 *
 * `kind` is how the page tells a PR row from a commit row. Both lists go
 * through these two functions so they cannot drift apart.
 */
export interface ReviewFeedItem {
  kind: 'pr' | 'commit';
  id: number;
  title: string;
  author: string | null;
  status: string;
  pr_number?: number;
  short_sha?: string;
  branch?: string;
  created_at: string | null;
  repository: { name: string | null; full_name: string | null };
  score: number | null;
  url: string;
}

export function pullRequestFeedItem(pr: PullRequest): ReviewFeedItem {
  return {
    kind: 'pr',
    id: pr.id,
    title: pr.title,
    author: pr.author,
    status: pr.status,
    pr_number: pr.prNumber,
    created_at: toIso8601String(pr.createdAt),
    repository: {
      name: pr.repository?.name ?? null,
      full_name: pr.repository?.fullName ?? null,
    },
    score: pr.review?.overallScore ?? null,
    url: `/reviews/${pr.id}`,
  };
}

export function commitReviewFeedItem(cr: CommitReview): ReviewFeedItem {
  return {
    kind: 'commit',
    id: cr.id,
    // Only the first line of the commit message, as the table is one row tall.
    title: cr.commitMessage ? (cr.commitMessage.split('\n')[0] ?? '') : '(no commit message)',
    author: cr.author,
    status: cr.status,
    short_sha: cr.commitSha.slice(0, 7),
    branch: cr.branch,
    created_at: toIso8601String(cr.createdAt),
    repository: {
      name: cr.repository?.name ?? null,
      full_name: cr.repository?.fullName ?? null,
    },
    score: cr.overallScore,
    url: `/commits/${cr.id}`,
  };
}
