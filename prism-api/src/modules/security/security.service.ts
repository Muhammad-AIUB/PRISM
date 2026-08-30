import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as OrmRepository } from 'typeorm';
import { AuditLogService } from '../../audit/audit-log.service';
import { LaravelCryptService } from '../../common/utils/laravel-crypt.service';
import { toIso8601String } from '../../common/utils/iso8601';
import { formatShortDate } from '../../common/utils/short-date';
import { AuditLog, Repository, Review, User } from '../../database/entities';
import { GithubClientService } from '../../github/github-client.service';

/**
 * Port of SecurityController, AuditController and DataController.
 *
 * These three are the app's transparency surface: what PRism holds about you,
 * what it has done on your behalf, and the button that erases all of it.
 */
const AUDIT_LOG_LIMIT = 200;

@Injectable()
export class SecurityService {
  constructor(
    @InjectRepository(User)
    private readonly users: OrmRepository<User>,
    @InjectRepository(Repository)
    private readonly repositories: OrmRepository<Repository>,
    @InjectRepository(Review)
    private readonly reviews: OrmRepository<Review>,
    @InjectRepository(AuditLog)
    private readonly auditLogs: OrmRepository<AuditLog>,
    private readonly github: GithubClientService,
    private readonly crypt: LaravelCryptService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** GET /security — public. `user` is null for anonymous visitors. */
  index(user: User | undefined): Record<string, unknown> {
    return {
      user: user
        ? { github_username: user.githubUsername, github_avatar: user.githubAvatar }
        : null,
      is_authenticated: Boolean(user),
      github_app_url: 'https://github.com/settings/applications',
      github_repo_url: 'https://github.com/Muhammad-AIUB/PRISM',
    };
  }

  /** GET /security/audit-log */
  async auditLogIndex(user: User): Promise<{ logs: Record<string, unknown>[] }> {
    const logs = await this.auditLogs.find({
      where: { userId: user.id },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: AUDIT_LOG_LIMIT,
    });

    return {
      logs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        description: log.description,
        metadata: log.metadata,
        ip_address: log.ipAddress,
        created_at: toIso8601String(log.createdAt),
      })),
    };
  }

  /** GET /security/my-data */
  async myData(user: User): Promise<Record<string, unknown>> {
    // The cast-decrypted value, as Laravel's $user->github_token was — the
    // preview is of the real token, not of the ciphertext.
    const token = this.crypt.decrypt(user.githubToken) ?? '';

    const [repositories, connectedRepos, totalReviews, auditEvents] = await Promise.all([
      this.repositories.find({ where: { userId: user.id } }),
      this.repositories.count({ where: { userId: user.id } }),
      this.reviews
        .createQueryBuilder('review')
        .innerJoin('review.pullRequest', 'pr')
        .innerJoin('pr.repository', 'repo')
        .where('repo.user_id = :userId', { userId: user.id })
        .getCount(),
      this.auditLogs.count({ where: { userId: user.id } }),
    ]);

    return {
      profile: {
        name: user.name,
        email: user.email,
        github_username: user.githubUsername,
        github_avatar: user.githubAvatar,
        created_at: formatShortDate(user.createdAt),
      },
      // Enough to recognise the token, never enough to use it.
      token_preview: {
        first_4: token.slice(0, 4),
        last_4: token.length >= 4 ? token.slice(-4) : token,
        length: token.length,
      },
      stats: {
        connected_repos: connectedRepos,
        total_reviews: totalReviews,
        audit_events: auditEvents,
      },
      repositories: repositories.map((repo) => ({
        full_name: repo.fullName,
        created_at: formatShortDate(repo.createdAt),
        is_active: Boolean(repo.isActive),
        review_mode: repo.reviewMode,
      })),
    };
  }

  /**
   * DELETE /security/my-data — irreversible.
   *
   * Order matters and is Laravel's: uninstall the GitHub webhooks FIRST, while
   * the token and the hook ids still exist. Delete the user first and they are
   * gone, leaving GitHub delivering to a repository nothing recognises.
   */
  async deleteEverything(user: User): Promise<{ message: string }> {
    const token = this.crypt.decrypt(user.githubToken) ?? '';
    const repositories = await this.repositories.find({ where: { userId: user.id } });

    for (const repo of repositories) {
      if (!repo.webhookId) {
        continue;
      }

      await this.github.deleteWebhook(token, repo.fullName, repo.webhookId);
    }

    // Recorded while the user still exists; the row cascades away with them.
    await this.auditLog.record(user.id, 'account_deleted', 'User-initiated full data deletion');

    await this.users.delete(user.id);

    return { message: 'All your data has been permanently deleted.' };
  }
}
