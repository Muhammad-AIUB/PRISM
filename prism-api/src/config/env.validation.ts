import { plainToInstance } from 'class-transformer';
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
   * Optional on purpose: Laravel skips the whole Groq chain when the key is
   * absent and degrades to OpenRouter. Making it required here would change
   * that behaviour from "quietly slower" to "will not boot".
   */
  @IsString()
  @IsOptional()
  GROQ_API_KEY?: string;

  /** The last line of the fallback chain — without it there is no AI at all. */
  @IsString()
  @IsNotEmpty()
  OPENROUTER_API_KEY!: string;

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

  @IsInt()
  @Min(1)
  SESSION_TTL_DAYS = 30;

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

  return config;
}
