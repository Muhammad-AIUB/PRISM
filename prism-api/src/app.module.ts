import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { AuthModule } from './auth/auth.module';
import { LaravelThrottlerGuard } from './common/guards/laravel-throttler.guard';
import { CryptModule } from './common/utils/crypt.module';
import {
  aiConfig,
  appConfig,
  databaseConfig,
  mailConfig,
  queueConfig,
  redisConfig,
} from './config/configuration';
import { validateEnv } from './config/env.validation';
import {
  AuditLog,
  CommitReview,
  PersonalAccessToken,
  PullRequest,
  Repository,
  Review,
  ReviewComment,
  User,
} from './database/entities';
import { HealthModule } from './modules/health/health.module';
import { ReviewsModule } from './modules/api-v1/reviews/reviews.module';
import { ReviewModule } from './modules/review/review.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfig, databaseConfig, redisConfig, queueConfig, aiConfig, mailConfig],
      validate: validateEnv,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        url: configService.get<string>('database.url'),
        ssl:
          configService.get<string>('database.sslmode') === 'disable'
            ? false
            : { rejectUnauthorized: false },

        entities: [
          AuditLog,
          CommitReview,
          PersonalAccessToken,
          PullRequest,
          Repository,
          Review,
          ReviewComment,
          User,
        ],

        /**
         * NEVER true. Laravel's migrations own this schema; letting TypeORM
         * reconcile it would drop the CHECK constraints behind Laravel's
         * enum() columns and rewrite indexes out from under the running app.
         */
        synchronize: false,
        migrationsRun: false,

        // Laravel columns are snake_case; entities stay camelCase.
        namingStrategy: new SnakeNamingStrategy(),

        logging: configService.get<string>('app.env') === 'development',
        // Free-tier Postgres has a low connection ceiling and Laravel is
        // holding some of it during the parallel-run window.
        extra: { max: 5 },
      }),
    }),

    /**
     * BullMQ gets its own Redis connection rather than reusing REDIS_CLIENT:
     * workers require `maxRetriesPerRequest: null`, and BullMQ manages its own
     * key namespace via `prefix` (an ioredis keyPrefix would break it).
     *
     * The instance must be configured with maxmemory-policy `noeviction` —
     * under an eviction policy BullMQ's job keys can be dropped silently and
     * reviews simply never run.
     */
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('redis.url'),
          maxRetriesPerRequest: null,
        },
        prefix: configService.get<string>('queue.prefix') ?? 'prism-bull',
      }),
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            name: 'api',
            ttl: 60_000,
            limit: configService.get<number>('app.apiRateLimit') ?? 100,
          },
        ],
      }),
    }),

    RedisModule,
    CryptModule,
    AuthModule,
    HealthModule,
    ReviewsModule,
    ReviewModule,
    WebhookModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: LaravelThrottlerGuard }],
})
export class AppModule {}
