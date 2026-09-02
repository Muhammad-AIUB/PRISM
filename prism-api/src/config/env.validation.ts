import { Type, plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Fail fast on boot rather than 500 on the first request. Every value the app
 * cannot invent a safe default for is required here.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  /**
   * Render always injects PORT as a string. Relying on class-transformer's
   * implicit conversion here silently failed validation and the service would
   * not boot at all, so every numeric field converts explicitly.
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @IsNotEmpty()
  APP_URL!: string;

  /** Laravel APP_KEY ("base64:…") — needed to read encrypted columns. */
  @IsString()
  @IsNotEmpty()
  APP_KEY!: string;

  @IsString()
  @IsNotEmpty()
  DB_URL!: string;

  @IsString()
  @IsOptional()
  DB_SSLMODE?: string;

  @IsString()
  @IsNotEmpty()
  REDIS_URL!: string;

  @IsString()
  @IsOptional()
  REDIS_PREFIX?: string;

  @IsString()
  @IsOptional()
  QUEUE_CONNECTION?: string;

  @IsString()
  @IsOptional()
  QUEUE_PREFIX?: string;

  /**
   * Optional on purpose: an absent key skips the whole Groq chain and degrades
   * to OpenRouter. Requiring it would turn "quietly slower" into "will not
   * boot".
   */
  @IsString()
  @IsOptional()
  GROQ_API_KEY?: string;

  /**
   * Optional, like GROQ_API_KEY. Either one alone is enough to review code —
   * see the combined check in validateEnv, which is what actually guards
   * against booting with no AI provider at all.
   */
  @IsString()
  @IsOptional()
  OPENROUTER_API_KEY?: string;

  @IsString()
  @IsOptional()
  RESEND_API_KEY?: string;

  @IsString()
  @IsOptional()
  MAIL_FROM_ADDRESS?: string;

  @IsString()
  @IsOptional()
  MAIL_FROM_NAME?: string;

  @IsString()
  @IsOptional()
  FRONTEND_URL?: string;

  // ── GitHub OAuth (same app registration as Laravel uses) ──
  @IsString()
  @IsNotEmpty()
  GITHUB_CLIENT_ID!: string;

  @IsString()
  @IsNotEmpty()
  GITHUB_CLIENT_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  GITHUB_REDIRECT_URI!: string;

  /**
   * Signs the browser session JWT. Unrelated to APP_KEY: rotating this logs
   * everyone out, rotating APP_KEY would make every stored github_token
   * unreadable, so they must not share a value.
   */
  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  JWT_SECRET!: string;

  @IsString()
  @IsOptional()
  SESSION_COOKIE_NAME?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  SESSION_TTL_DAYS = 30;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  API_RATE_LIMIT = 100;
}

export function validateEnv(raw: Record<string, unknown>): EnvironmentVariables {
  const config = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });

  const errors = validateSync(config, { skipMissingProperties: false });

  if (errors.length > 0) {
    const detail = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${detail}`);
  }

  /**
   * Either provider alone is enough — Groq is tried first, OpenRouter is the
   * fallback — but with neither there is no way to review anything, and every
   * job would fail one at a time at runtime instead of loudly at boot.
   *
   * Checked here rather than per-field because the requirement is on the pair,
   * and no single field decorator can express it.
   */
  if (!config.GROQ_API_KEY && !config.OPENROUTER_API_KEY) {
    throw new Error(
      'Invalid environment configuration:\n' +
        '  - No AI provider configured. Set GROQ_API_KEY or OPENROUTER_API_KEY (either alone works).',
    );
  }

  return config;
}
