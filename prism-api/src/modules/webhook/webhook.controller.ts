import {
  Controller,
  Headers,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { WebhookService } from './webhook.service';

/**
 * POST /webhook/github
 *
 * Unauthenticated by design — the HMAC signature is the boundary. The response
 * must come back fast: GitHub gives up after 10 seconds, so nothing here does
 * more than verify, upsert one row and enqueue.
 *
 * Status codes are set explicitly rather than thrown, so the exception filter
 * cannot reshape a body GitHub is going to display.
 */
/**
 * Laravel puts this route behind `throttle:webhook` — 60/min per IP, not the
 * api limiter's 100/min. Overriding the limit here gives the same ceiling, and
 * the throttler's storage key is per-handler, so this gets its own bucket
 * rather than sharing one with the API routes.
 */
@Controller('webhook')
@Throttle({ api: { limit: 60, ttl: 60_000 } })
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post('github')
  async handle(
    @Req() request: RawBodyRequest<Request>,
    @Res({ passthrough: true }) response: Response,
    @Headers('x-hub-signature-256') signature?: string,
    @Headers('x-github-delivery') deliveryId?: string,
    @Headers('x-github-event') event?: string,
  ): Promise<Record<string, unknown>> {
    // rawBody is populated because main.ts creates the app with rawBody: true.
    // Falling back to an empty buffer keeps the signature check failing closed.
    const rawBody = request.rawBody ?? Buffer.alloc(0);

    const result = await this.webhookService.handle(rawBody, {
      signature,
      deliveryId,
      event,
    });

    response.status(result.status ?? HttpStatus.OK);

    return result.body;
  }
}
