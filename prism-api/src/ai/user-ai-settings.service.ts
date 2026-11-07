import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CryptService } from '../common/utils/crypt.service';
import { toIso8601String } from '../common/utils/iso8601';
import { UserAiSettings } from '../database/entities';
import type { ProviderId } from './providers/ai-provider';

export interface OwnModel {
  provider: ProviderId;
  model: string;
  apiKey: string;
}

export interface OwnModelSummary {
  provider: ProviderId;
  model: string;
  key_hint: string;
  updated_at: string | null;
}

const KNOWN_PROVIDERS: readonly string[] = ['openai', 'google', 'openrouter', 'anthropic'];

/**
 * The only reader and writer of user_ai_settings.api_key (ADR 0012).
 *
 * The key is encrypted at rest, described to the outside only by its last four
 * characters, and never logged. A key that cannot be decrypted (APP_KEY was
 * rotated) counts as "no key", so the pipeline falls back to Groq.
 */
@Injectable()
export class UserAiSettingsService {
  private readonly logger = new Logger(UserAiSettingsService.name);

  constructor(
    @InjectRepository(UserAiSettings) private readonly settings: Repository<UserAiSettings>,
    private readonly crypt: CryptService,
  ) {}

  /** The plaintext key for the pipeline, or null when there is none or it is unreadable. */
  async resolve(userId: number): Promise<OwnModel | null> {
    const row = await this.settings.findOne({ where: { userId } });

    if (!row || !KNOWN_PROVIDERS.includes(row.provider)) {
      return null;
    }

    let apiKey: string | null = null;

    try {
      apiKey = this.crypt.decrypt(row.apiKey);
    } catch {
      apiKey = null;
    }

    if (!apiKey) {
      // Never the value, not even the hint.
      this.logger.warn(`saved AI key unreadable for user ${userId}`);

      return null;
    }

    return { provider: row.provider as ProviderId, model: row.model, apiKey };
  }

  async describe(userId: number): Promise<OwnModelSummary | null> {
    const row = await this.settings.findOne({ where: { userId } });

    if (!row || !KNOWN_PROVIDERS.includes(row.provider)) {
      return null;
    }

    return {
      provider: row.provider as ProviderId,
      model: row.model,
      key_hint: row.keyHint,
      updated_at: toIso8601String(row.updatedAt),
    };
  }

  async save(
    userId: number,
    input: { provider: ProviderId; model: string; apiKey?: string },
  ): Promise<void> {
    const existing = await this.settings.findOne({ where: { userId } });
    const now = new Date();

    let cipher: string;
    let hint: string;

    if (input.apiKey) {
      cipher = this.crypt.encrypt(input.apiKey);
      hint = input.apiKey.slice(-4);
    } else if (existing && existing.provider === input.provider) {
      cipher = existing.apiKey;
      hint = existing.keyHint;
    } else {
      throw new Error('An API key is required.');
    }

    await this.settings.save({
      userId,
      provider: input.provider,
      model: input.model,
      apiKey: cipher,
      keyHint: hint,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  async clear(userId: number): Promise<void> {
    await this.settings.delete({ userId });
  }
}
