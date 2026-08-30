import { Injectable, Logger } from '@nestjs/common';

/**
 * The GitHub calls both Laravel jobs make. Two diff fetches (different
 * endpoints for PRs and commits) and two comment posts (likewise).
 *
 * The diff fetches throw on a non-2xx so BullMQ retries the job, matching
 * Laravel's RuntimeException. The comment posts deliberately do NOT check the
 * response: Laravel fires them and moves on, so a repo where the token lost
 * write access still completes the review instead of failing it.
 */
const API_ROOT = 'https://api.github.com';
const DIFF_ACCEPT = 'application/vnd.github.v3.diff';
const REQUEST_TIMEOUT_MS = 30_000;

@Injectable()
export class GithubClientService {
  private readonly logger = new Logger(GithubClientService.name);

  /** GET /repos/{full_name}/pulls/{pr_number} as a unified diff. */
  async fetchPullRequestDiff(token: string, fullName: string, prNumber: number): Promise<string> {
    const response = await this.request(
      `${API_ROOT}/repos/${fullName}/pulls/${prNumber}`,
      token,
      DIFF_ACCEPT,
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch diff: ${response.status}`);
    }

    return response.body;
  }

  /** GET /repos/{full_name}/commits/{sha} as a unified diff. */
  async fetchCommitDiff(token: string, fullName: string, sha: string): Promise<string> {
    const response = await this.request(
      `${API_ROOT}/repos/${fullName}/commits/${sha}`,
      token,
      DIFF_ACCEPT,
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch commit diff: ${response.status}`);
    }

    return response.body;
  }

  /** PR summaries go on the issue timeline, not the review API. */
  async postPullRequestComment(
    token: string,
    fullName: string,
    prNumber: number,
    body: string,
  ): Promise<void> {
    await this.postComment(
      `${API_ROOT}/repos/${fullName}/issues/${prNumber}/comments`,
      token,
      body,
    );
  }

  /** Commits have their own comments endpoint. */
  async postCommitComment(
    token: string,
    fullName: string,
    sha: string,
    body: string,
  ): Promise<void> {
    await this.postComment(
      `${API_ROOT}/repos/${fullName}/commits/${sha}/comments`,
      token,
      body,
    );
  }

  private async postComment(url: string, token: string, body: string): Promise<void> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'PRism',
        },
        body: JSON.stringify({ body }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        this.logger.warn(`GitHub comment post returned ${response.status} for ${url}`);
      }
    } catch (error) {
      // Never fail the review over a comment we could not post.
      this.logger.warn(
        `GitHub comment post failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async request(
    url: string,
    token: string,
    accept: string,
  ): Promise<{ ok: boolean; status: number; body: string }> {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: accept,
        'User-Agent': 'PRism',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    return { ok: response.ok, status: response.status, body: await response.text() };
  }
}
