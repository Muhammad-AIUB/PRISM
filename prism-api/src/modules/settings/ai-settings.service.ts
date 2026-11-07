import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service';
import { GROQ_MODELS } from '../../ai/providers/groq.provider';
import { AI_TIMEOUT_MS } from '../../ai/providers/http';
import type { ProviderId } from '../../ai/providers/ai-provider';
import { providerFor, SELECTABLE_PROVIDERS } from '../../ai/providers/registry';
import { UserAiSettingsService } from '../../ai/user-ai-settings.service';
import type { User } from '../../database/entities';
import type { ListAiModelsDto, SaveAiSettingsDto } from './dto/ai-settings.dto';

/**
 * The /settings/ai operations (ADR 0012).
 *
 * The key is accepted, used and stored, and never echoed: not in a response,
 * an error, or an audit entry. The provider's own error body is not forwarded
 * either, since it can quote the key back.
 */
@Injectable()
export class AiSettingsService {
  constructor(
    private readonly userAi: UserAiSettingsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async index(user: User) {
    return {
      default: { provider: 'groq' as const, models: [...GROQ_MODELS] },
      own: await this.userAi.describe(user.id),
      providers: SELECTABLE_PROVIDERS,
    };
  }

  async models(user: User, dto: ListAiModelsDto): Promise<{ models: string[] }> {
    return { models: await this.listFor(user, dto) };
  }

  async save(user: User, dto: SaveAiSettingsDto) {
    const models = await this.listFor(user, dto);

    if (!models.includes(dto.model)) {
      this.fail({ model: [`${this.label(dto.provider)} does not offer that model.`] });
    }

    const apiKey = dto.api_key?.trim() || undefined;

    try {
      await this.userAi.save(user.id, {
        provider: dto.provider as ProviderId,
        model: dto.model,
        apiKey,
      });
    } catch {
      this.fail({ api_key: ['Enter your API key.'] });
    }

    await this.auditLog.record(user.id, 'ai_settings_saved', 'Saved a personal AI model', {
      provider: dto.provider,
      model: dto.model,
    });

    return {
      message: 'Your AI model was saved.',
      own: await this.userAi.describe(user.id),
    };
  }

  async clear(user: User): Promise<{ message: string }> {
    await this.userAi.clear(user.id);
    await this.auditLog.record(user.id, 'ai_settings_cleared', 'Removed a personal AI model');

    return { message: "PRism's default model will be used." };
  }

  /** The typed key, else the saved one if it belongs to the same provider. */
  private async keyFor(user: User, dto: ListAiModelsDto): Promise<string> {
    const typed = dto.api_key?.trim();

    if (typed) {
      return typed;
    }

    const saved = await this.userAi.resolve(user.id);

    if (saved && saved.provider === dto.provider) {
      return saved.apiKey;
    }

    return this.fail({ api_key: ['Enter your API key.'] });
  }

  private async listFor(user: User, dto: ListAiModelsDto): Promise<string[]> {
    const apiKey = await this.keyFor(user, dto);
    const label = this.label(dto.provider);

    try {
      return await providerFor(dto.provider as ProviderId).listModels(
        apiKey,
        AbortSignal.timeout(AI_TIMEOUT_MS),
      );
    } catch (error) {
      const status = (error as { status?: number }).status;

      return this.fail({
        api_key: [
          status === 401 || status === 403
            ? `${label} rejected this API key.`
            : `Could not reach ${label}. Try again in a minute.`,
        ],
      });
    }
  }

  private label(provider: string): string {
    return SELECTABLE_PROVIDERS.find((p) => p.id === provider)?.label ?? provider;
  }

  /** The same body shape common/validation/validation-errors.ts produces. */
  private fail(errors: Record<string, string[]>): never {
    throw new UnprocessableEntityException({
      message: Object.values(errors)[0]![0],
      errors,
    });
  }
}
