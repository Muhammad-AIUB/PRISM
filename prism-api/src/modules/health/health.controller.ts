import { Controller, Get, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { HealthResponseDto } from './health.dto';
import { HealthService } from './health.service';

/**
 * GET /health — unauthenticated, unthrottled liveness/readiness probe.
 * Render's health check and any external uptime monitor already point here, so
 * the 200/503 split and the body shape must not drift.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @SkipThrottle()
  async check(@Res({ passthrough: true }) response: Response): Promise<HealthResponseDto> {
    const { body, statusCode } = await this.healthService.check();

    response.status(statusCode);

    return body;
  }
}
