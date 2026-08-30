import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as OrmRepository } from 'typeorm';
import { AuditLogService } from '../../audit/audit-log.service';
import { PersonalAccessTokenService, type ApiTokenDto } from '../../auth/personal-access-token.service';
import { User } from '../../database/entities';
import type { UpdateSettingsDto } from './dto/settings.dto';

/**
 * Port of App\Http\Controllers\SettingsController.
 *
 * Laravel flashed the new plaintext token into the session and the Inertia
 * page read it back as `new_api_token`. There is no session here, so the
 * create endpoint returns it in its own response body instead — still exactly
 * once, since nothing stores it.
 */
const SLACK_TEST_MESSAGE = '✅ PRism test notification - your Slack integration is working!';
const SLACK_TIMEOUT_MS = 10_000;

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectRepository(User)
    private readonly users: OrmRepository<User>,
    private readonly apiTokens: PersonalAccessTokenService,
    private readonly auditLog: AuditLogService,
  ) {}

  async index(user: User): Promise<{
    user: {
      name: string;
      email: string;
      github_username: string | null;
      github_avatar: string | null;
      email_notifications: boolean;
      slack_webhook_url: string | null;
    };
    api_tokens: ApiTokenDto[];
  }> {
    return {
      user: {
        name: user.name,
        email: user.email,
        github_username: user.githubUsername,
        github_avatar: user.githubAvatar,
        email_notifications: Boolean(user.emailNotifications),
        slack_webhook_url: user.slackWebhookUrl,
      },
      api_tokens: await this.apiTokens.listFor(user),
    };
  }

  async createApiToken(
    user: User,
    name: string,
  ): Promise<{ message: string; token: ApiTokenDto; new_api_token: string }> {
    const { token, plainTextToken } = await this.apiTokens.create(user, name);

    await this.auditLog.record(user.id, 'api_token_created', `Created API token "${name}"`);

    return {
      message: 'API token created — copy it now, it will not be shown again.',
      token,
      new_api_token: plainTextToken,
    };
  }

  async revokeApiToken(user: User, tokenId: number): Promise<{ message: string }> {
    await this.apiTokens.revoke(user, tokenId);

    await this.auditLog.record(user.id, 'api_token_revoked', 'Revoked an API token', {
      token_id: tokenId,
    });

    return { message: 'API token revoked' };
  }

  /**
   * Only the keys actually sent are written. Laravel's validate() returns the
   * present subset, so posting just a Slack URL must not silently reset the
   * email preference.
   */
  async update(user: User, dto: UpdateSettingsDto): Promise<{ message: string }> {
    const changes: Partial<User> = {};

    if (dto.email_notifications !== undefined) {
      changes.emailNotifications = dto.email_notifications;
    }

    // undefined means absent; null is an explicit "clear the webhook".
    if (dto.slack_webhook_url !== undefined) {
      changes.slackWebhookUrl = dto.slack_webhook_url;
    }

    if (Object.keys(changes).length > 0) {
      await this.users.update(user.id, { ...changes, updatedAt: new Date() });
    }

    await this.auditLog.record(user.id, 'settings_updated', 'Updated notification preferences', {
      email_notifications: dto.email_notifications ?? null,
      has_slack_webhook: Boolean(dto.slack_webhook_url),
    });

    return { message: 'Settings updated successfully' };
  }

  /**
   * Sends a probe to a candidate webhook so the user can check it before
   * saving. Persists nothing — and the DTO's prefix check is what stops this
   * being a general-purpose request forwarder.
   */
  async testSlack(url: string): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: SLACK_TEST_MESSAGE }),
        signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
      });

      if (response.ok) {
        return { ok: true, message: 'Test message sent to Slack!' };
      }

      return { ok: false, message: `Slack returned: ${await response.text()}` };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);

      this.logger.warn(`Slack test failed: ${detail}`);

      return { ok: false, message: `Failed: ${detail}` };
    }
  }
}
