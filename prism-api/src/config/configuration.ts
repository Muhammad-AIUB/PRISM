import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  url: process.env.APP_URL ?? '',
  key: process.env.APP_KEY ?? '',
  apiRateLimit: Number(process.env.API_RATE_LIMIT ?? 100),
}));

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DB_URL ?? '',
  sslmode: process.env.DB_SSLMODE ?? 'prefer',
}));

export const redisConfig = registerAs('redis', () => ({
  url: process.env.REDIS_URL ?? '',
  prefix: process.env.REDIS_PREFIX ?? 'prism:',
}));

export const queueConfig = registerAs('queue', () => ({
  connection: process.env.QUEUE_CONNECTION ?? 'database',
  /**
   * BullMQ's own key namespace. Kept distinct from REDIS_PREFIX so queue keys
   * can never collide with Laravel's cache or session entries in the shared
   * instance.
   */
  prefix: process.env.QUEUE_PREFIX ?? 'prism-bull',
}));

export const aiConfig = registerAs('ai', () => ({
  groqKey: process.env.GROQ_API_KEY ?? '',
  openRouterKey: process.env.OPENROUTER_API_KEY ?? '',
}));

export const mailConfig = registerAs('mail', () => ({
  resendKey: process.env.RESEND_API_KEY ?? '',
  fromAddress: process.env.MAIL_FROM_ADDRESS ?? '',
  fromName: process.env.MAIL_FROM_NAME ?? '',
}));
