import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as OrmRepository } from 'typeorm';
import { CommitReview, PullRequest, Repository } from '../../database/entities';
import { ReviewQueueService } from '../review/review-queue.service';

/**
 * Port of App\Http\Controllers\WebhookController.
 *
 * GitHub records the status and body of every delivery and shows them in the
 * repository's webhook UI, so both are part of the contract. Every branch here
 * returns exactly what Laravel returned.
 *
 * The signature check is the real security boundary: IP allow-listing was
 * removed because Render's edge proxy masks GitHub's source address (see the
 * comment on the Laravel route).
 */
export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

const NULL_SHA = '0'.repeat(40);

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(Repository)
    private readonly repositories: OrmRepository<Repository>,
    @InjectRepository(PullRequest)
    private readonly pullRequests: OrmRepository<PullRequest>,
    @InjectRepository(CommitReview)
    private readonly commitReviews: OrmRepository<CommitReview>,
    private readonly queue: ReviewQueueService,
  ) {}

  async handle(
    rawBody: Buffer,
    headers: { signature?: string; deliveryId?: string; event?: string },
  ): Promise<WebhookResult> {
    const payload = rawBody.toString('utf8');
    const data = this.parse(payload);

    this.logger.log(
      `webhook_received ${JSON.stringify({
        delivery_id: headers.deliveryId ?? null,
        event: headers.event ?? null,
        action: this.get(data, 'action') ?? null,
        repo_id: this.get(this.get(data, 'repository'), 'id') ?? null,
      })}`,
    );

    const githubRepoId = this.get(this.get(data, 'repository'), 'id');

    if (!githubRepoId) {
      return { status: 400, body: { message: 'Missing repository id' } };
    }

    const repository = await this.repositories.findOne({
      where: { githubRepoId: Number(githubRepoId) },
    });

    if (!repository) {
      return { status: 404, body: { message: 'Repository not connected' } };
    }

    if (!this.signatureIsValid(payload, repository.webhookSecret, headers.signature)) {
      this.logger.warn(`Invalid GitHub webhook signature (repo=${repository.fullName})`);

      return { status: 401, body: { message: 'Invalid signature' } };
    }

    switch (headers.event) {
      case 'pull_request':
        return this.handlePullRequest(repository, data);
      case 'push':
        return this.handlePush(repository, data);
      case 'ping':
        return { status: 200, body: { message: 'pong' } };
      default:
        return { status: 200, body: { message: `Ignored event: ${headers.event ?? ''}` } };
    }
  }

  private async handlePullRequest(
    repository: Repository,
    data: Record<string, unknown>,
  ): Promise<WebhookResult> {
    const action = this.get(data, 'action');

    if (action !== 'opened' && action !== 'synchronize') {
      return { status: 200, body: { message: `Ignored action: ${String(action ?? '')}` } };
    }

    const pr = (this.get(data, 'pull_request') ?? {}) as Record<string, unknown>;
    const githubPrId = Number(this.get(pr, 'id'));

    const values = {
      prNumber: Number(this.get(pr, 'number')),
      title: String(this.get(pr, 'title') ?? ''),
      author: String(this.get(this.get(pr, 'user'), 'login') ?? ''),
      baseBranch: String(this.get(this.get(pr, 'base'), 'ref') ?? ''),
      headBranch: String(this.get(this.get(pr, 'head'), 'ref') ?? ''),
      status: 'pending' as const,
      diffUrl: (this.get(pr, 'diff_url') as string | undefined) ?? null,
    };

    // Eloquent updateOrCreate: an existing row IS updated, so a re-opened or
    // re-titled PR picks up the new metadata.
    const existing = await this.pullRequests.findOne({
      where: { repositoryId: repository.id, githubPrId },
    });

    let pullRequestId: number;

    if (existing) {
      await this.pullRequests.update(existing.id, { ...values, updatedAt: new Date() });
      pullRequestId = existing.id;
    } else {
      const now = new Date();
      const created = await this.pullRequests.save(
        this.pullRequests.create({
          ...values,
          repositoryId: repository.id,
          githubPrId,
          createdAt: now,
          updatedAt: now,
        }),
      );
      pullRequestId = created.id;
    }

    await this.queue.enqueuePullRequestReview(pullRequestId);

    return { status: 200, body: { message: 'Review queued', pr_id: pullRequestId } };
  }

  /**
   * Push: one review for the head commit of the push. The gate order below is
   * Laravel's and it is observable — a push to an unwatched branch on a
   * pr_only repository reports "PR-only mode", not "Branch not watched".
   */
  private async handlePush(
    repository: Repository,
    data: Record<string, unknown>,
  ): Promise<WebhookResult> {
    const ref = String(this.get(data, 'ref') ?? '');
    const branch = ref.replace(/^refs\/heads\//, '');

    if (repository.reviewMode === 'pr_only') {
      return { status: 200, body: { message: 'Repository set to PR-only mode' } };
    }

    if (!this.watchedBranches(repository).includes(branch)) {
      return { status: 200, body: { message: `Branch not watched: ${branch}` } };
    }

    if (this.get(data, 'deleted') === true) {
      return { status: 200, body: { message: 'Branch deleted, skipping' } };
    }

    const headSha = this.get(data, 'after');

    if (!headSha || headSha === NULL_SHA) {
      return { status: 200, body: { message: 'No head commit' } };
    }

    const commits = this.get(data, 'commits');
    const headCommit =
      (Array.isArray(commits)
        ? (commits as Record<string, unknown>[]).find((c) => this.get(c, 'id') === headSha)
        : undefined) ?? (this.get(data, 'head_commit') as Record<string, unknown> | undefined);

    const commitSha = String(headSha);

    // Eloquent firstOrCreate: an existing row is NOT updated — a re-push of the
    // same SHA keeps the original message and author.
    let review = await this.commitReviews.findOne({
      where: { repositoryId: repository.id, commitSha },
    });

    if (!review) {
      const now = new Date();
      const author =
        this.get(this.get(headCommit, 'author'), 'username') ??
        this.get(this.get(headCommit, 'author'), 'name') ??
        this.get(this.get(data, 'pusher'), 'name');

      review = await this.commitReviews.save(
        this.commitReviews.create({
          repositoryId: repository.id,
          commitSha,
          branch,
          commitMessage: (this.get(headCommit, 'message') as string | undefined) ?? null,
          author: author === undefined || author === null ? null : String(author),
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        }),
      );
    }

    await this.queue.enqueueCommitReview(review.id);

    return { status: 200, body: { message: 'Commit review queued', review_id: review.id } };
  }

  /** Port of Repository::watchedBranches(). */
  private watchedBranches(repository: Repository): string[] {
    const branches = repository.reviewBranches;

    if (!Array.isArray(branches) || branches.length === 0) {
      return ['main', 'master'];
    }

    return branches.map((branch) => String(branch)).filter((branch) => branch !== '');
  }

  /**
   * HMAC-SHA256 over the RAW request body. A re-serialised body produces a
   * different digest, which is why the controller reads req.rawBody.
   */
  private signatureIsValid(
    payload: string,
    secret: string,
    signature: string | undefined,
  ): boolean {
    if (typeof signature !== 'string') {
      return false;
    }

    const expected = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);

    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** json_decode(..., true) ?: [] — a malformed body is an empty object. */
  private parse(payload: string): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(payload);

      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  /** Laravel's data_get() for one level. */
  private get(source: unknown, key: string): unknown {
    if (typeof source !== 'object' || source === null) {
      return undefined;
    }

    return (source as Record<string, unknown>)[key];
  }
}
