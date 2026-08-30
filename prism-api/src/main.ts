/**
 * Order matters here: the pg type parsers must be registered before any
 * DataSource opens a connection, and reflect-metadata before any decorator
 * runs. Both imports are side-effectful and intentionally sit at the top.
 */
import 'reflect-metadata';
import { registerPgTypeParsers } from './database/pg-types';

registerPgTypeParsers();

// Laravel's app timezone is UTC and every timestamp column is naive. Pin the
// process to UTC so date maths cannot pick up the host's local zone.
process.env.TZ = 'UTC';

import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { LaravelExceptionFilter } from './common/filters/laravel-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    // The GitHub webhook's HMAC is computed over the exact bytes GitHub sent.
    // Without this the body is only available re-serialised, every digest
    // mismatches, and every delivery 401s.
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Render terminates TLS at its edge; without this, req.ip is the proxy and
  // the guest rate limiter would bucket every user together.
  app.set('trust proxy', true);

  app.use(helmet({ contentSecurityPolicy: false }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Emits Laravel's { message } / { message, errors } envelope for every
  // failure, so existing clients keep parsing errors the way they do today.
  app.useGlobalFilters(new LaravelExceptionFilter());

  app.enableShutdownHooks();

  const port = configService.get<number>('app.port') ?? 3000;
  await app.listen(port, '0.0.0.0');

  logger.log(`PRism API listening on :${port} (${configService.get<string>('app.env')})`);
}

void bootstrap();
