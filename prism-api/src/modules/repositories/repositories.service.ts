import { createHash } from 'node:crypto';
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as OrmRepository } from 'typeorm';
import { AuditLogService } from '../../audit/audit-log.service';
import { JsonCacheService } from '../../cache/json-cache.service';
import { LaravelCryptService } from '../../common/utils/laravel-crypt.service';
import { Repository, User } from '../../database/entities';
import {
  REVIEW_MODES,
  randomString,
  watchedBranchesFor,
  webhookEventsFor,
} from '../../database/repository.helpers';
import { GithubClientService } from '../../github/github-client.service';
import type {
  ConnectRepositoryDto,
  UpdateRepositorySettingsDto,
} from './dto/repository.dto';

/**
 * Port of App\Http\Controllers\RepositoryController.
 *
 * The Laravel version rendered Inertia pages and redirected with flash
 * messages. These return JSON instead — unavoidable, since the whole point is
 * to decouple the frontend — but the prop names, cache keys, TTLs, audit
 * entries and user-facing message strings are all kept, so the Next.js pages
 * can be a direct translation of the .jsx ones.
 */
const CACHE_GITHUB_REPOS_TTL = 300;
const CACHE_CONNECTED_REPOS_TTL = 600;
const CACHE_BRANCHES_TTL = 600;

export interface BranchDto {
  name: string;
  is_default: boolean;
}

@Injectable()
export class RepositoriesService {
  private readonly logger = new Logger(RepositoriesService.name);

  constructor(
    @InjectRepository(Repository)
    private readonly repositories: OrmRepository<Repository>,
    private readonly github: GithubClientService,
    private readonly cache: JsonCacheService,
    private readonly crypt: LaravelCryptService,
    private readonly auditLog: AuditLogService,
    private readonly configService: ConfigService,
  ) {}

  /** GET /repositories — the props the Repositories/Index page renders from. */
  async index(user: User): Promise<{
    repos: unknown[];
    connectedIds: number[];
    connectedRepos: Record<string, unknown>;
    reviewModes: readonly string[];
  }> {
    const token = this.tokenFor(user);

    const repos = await this.cache.remember(`user_repos_${user.id}`, CACHE_GITHUB_REPOS_TTL, () =>
      this.github.listUserRepos(token),
    );

    const connectedIds = await this.cache.remember(
      `user_connected_repos_${user.id}`,
      CACHE_CONNECTED_REPOS_TTL,
      async () => {
        const rows = await this.repositories.find({
          where: { userId: user.id },
          select: { githubRepoId: true },
        });

        return rows.map((row) => row.githubRepoId);
      },
    );

    const connected = await this.repositories.find({
      where: { userId: user.id },
      select: {
        id: true,
        githubRepoId: true,
        fullName: true,
        reviewMode: true,
        reviewBranches: true,
      },
    });

    // Laravel keyBy('github_repo_id') — the page looks rows up by that id.
    const connectedRepos = Object.fromEntries(
      connected.map((row) => [
        String(row.githubRepoId),
        {
          id: row.id,
          github_repo_id: row.githubRepoId,
          full_name: row.fullName,
          review_mode: row.reviewMode,
          review_branches: row.reviewBranches,
        },
      ]),
    );

    return { repos, connectedIds, connectedRepos, reviewModes: REVIEW_MODES };
  }

  /**
   * POST /repositories — create the row, then install the webhook.
   *
   * If GitHub rejects the hook the row is deleted again. That ordering is
   * Laravel's and it matters: a repository that exists locally with no webhook
   * would sit in the UI looking connected while never receiving an event.
   */
  async connect(
    user: User,
    dto: ConnectRepositoryDto,
  ): Promise<{ ok: true; message: string; repository: Repository } | { ok: false; message: string }> {
    const reviewMode = dto.review_mode ?? 'pr_only';
    const reviewBranches = dto.review_branches ?? ['main', 'master'];
    const webhookSecret = randomString(40);

    const now = new Date();
    const repository = await this.repositories.save(
      this.repositories.create({
        userId: user.id,
        name: dto.name,
        fullName: dto.full_name,
        githubRepoId: dto.github_repo_id,
        webhookSecret,
        isActive: true,
        reviewMode: reviewMode as Repository['reviewMode'],
        reviewBranches,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const events = webhookEventsFor(reviewMode);

    this.logger.log(
      `Installing webhook ${JSON.stringify({ repo: dto.full_name, events })}`,
    );

    const hook = await this.github.createWebhook(this.tokenFor(user), dto.full_name, {
      url: `${(this.configService.get<string>('app.url') ?? '').replace(/\/+$/, '')}/webhook/github`,
      secret: webhookSecret,
      events,
    });

    if (!hook.ok) {
      await this.repositories.delete(repository.id);
      await this.invalidateUserCaches(user.id);

      return {
        ok: false,
        message: `Failed to install webhook: ${hook.message ?? 'Unknown error'}`,
      };
    }

    await this.repositories.update(repository.id, { webhookId: hook.id });
    await this.invalidateUserCaches(user.id);

    await this.auditLog.record(
      user.id,
      'repo_connected',
      `Connected repository: ${dto.full_name}`,
      { review_mode: reviewMode },
    );

    return {
      ok: true,
      message: `Connected ${dto.full_name} successfully.`,
      repository: { ...repository, webhookId: hook.id },
    };
  }

  /** GET /repositories/:id/settings */
  async settings(user: User, id: number): Promise<{
    repository: {
      id: number;
      name: string;
      full_name: string;
      review_mode: string;
      review_branches: string[];
    };
    reviewModes: readonly string[];
  }> {
    const repository = await this.findOwned(user, id);

    return {
      repository: {
        id: repository.id,
        name: repository.name,
        full_name: repository.fullName,
        review_mode: repository.reviewMode,
        // The page shows the EFFECTIVE list, so an empty column renders as
        // main/master rather than as nothing being watched.
        review_branches: watchedBranchesFor(repository.reviewBranches),
      },
      reviewModes: REVIEW_MODES,
    };
  }

  /** POST /repositories/:id/settings */
  async updateSettings(
    user: User,
    id: number,
    dto: UpdateRepositorySettingsDto,
  ): Promise<{ message: string }> {
    const repository = await this.findOwned(user, id);
    const reviewBranches = dto.review_branches ?? ['main', 'master'];

    await this.repositories.update(repository.id, {
      reviewMode: dto.review_mode as Repository['reviewMode'],
      reviewBranches,
      updatedAt: new Date(),
    });

    // Keep GitHub's event subscriptions in step with the new mode. A failure
    // here is logged, not thrown: the local settings are already saved and
    // Laravel did not roll them back either.
    if (repository.webhookId) {
      await this.github.updateWebhookEvents(
        this.tokenFor(user),
        repository.fullName,
        repository.webhookId,
        webhookEventsFor(dto.review_mode),
      );
    }

    await this.auditLog.record(
      user.id,
      'settings_updated',
      `Updated review settings for ${repository.fullName}`,
      { review_mode: dto.review_mode, branches: watchedBranchesFor(reviewBranches) },
    );

    return { message: 'Repository settings updated.' };
  }

  /**
   * GET /repositories/branches?full_name=owner/repo
   *
   * Already JSON in Laravel, so this one is a straight translation. Any GitHub
   * failure yields an empty list — the connect modal degrades to a free-text
   * branch entry rather than erroring.
   */
  async branches(user: User, fullName: string): Promise<{ branches: BranchDto[] }> {
    const token = this.tokenFor(user);
    const digest = createHash('sha1').update(fullName).digest('hex');

    const branches = await this.cache.remember<BranchDto[]>(
      `repo_branches_${user.id}_${digest}`,
      CACHE_BRANCHES_TTL,
      async () => {
        const list = await this.github.listBranches(token, fullName);

        if (!Array.isArray(list)) {
          return [];
        }

        const info = await this.github.getRepo(token, fullName);
        const defaultBranch = info?.default_branch ?? null;

        return list.map((branch) => ({
          name: branch.name,
          is_default: branch.name === defaultBranch,
        }));
      },
    );

    return { branches };
  }

  async invalidateUserCaches(userId: number): Promise<void> {
    await this.cache.forget(`user_repos_${userId}`, `user_connected_repos_${userId}`);
  }

  private async findOwned(user: User, id: number): Promise<Repository> {
    const repository = await this.repositories.findOne({ where: { id } });

    if (!repository) {
      throw new NotFoundException('No query results for model [App\\Models\\Repository] ' + id);
    }

    // Laravel: abort_unless($repository->user_id === Auth::id(), 403)
    if (repository.userId !== user.id) {
      throw new ForbiddenException();
    }

    return repository;
  }

  private tokenFor(user: User): string {
    return this.crypt.decrypt(user.githubToken) ?? '';
  }
}
