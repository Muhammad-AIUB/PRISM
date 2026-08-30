import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface LaravelErrorBody {
  message: string;
  errors?: Record<string, string[]>;
}

/**
 * Laravel's JSON error envelope, reproduced verbatim:
 *   4xx/5xx      → { "message": "..." }
 *   422 validate → { "message": "...", "errors": { "field": ["..."] } }
 *
 * Existing clients (the MCP server, the Inertia frontend) already parse this
 * shape, so it is part of the API contract — not an implementation detail.
 */
@Catch()
export class LaravelExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(LaravelExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body = this.toLaravelBody(exception, status);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(body);
  }

  private toLaravelBody(exception: unknown, status: number): LaravelErrorBody {
    if (!(exception instanceof HttpException)) {
      // Never leak internals; Laravel with APP_DEBUG=false says exactly this.
      return { message: 'Server Error' };
    }

    const payload = exception.getResponse();

    if (typeof payload === 'string') {
      return { message: payload };
    }

    const record = payload as Record<string, unknown>;
    const rawMessage = record['message'];

    // class-validator's ValidationPipe returns message as string[] — fold it
    // into Laravel's 422 shape.
    if (status === HttpStatus.UNPROCESSABLE_ENTITY && Array.isArray(rawMessage)) {
      return {
        message: String(rawMessage[0] ?? 'The given data was invalid.'),
        errors: this.groupValidationMessages(rawMessage as string[]),
      };
    }

    const body: LaravelErrorBody = {
      message: typeof rawMessage === 'string' ? rawMessage : exception.message,
    };

    // Services (and the validation pipe) supply `errors` directly for 422s;
    // passing it through is what keeps field-level form errors working.
    const rawErrors = record['errors'];

    if (rawErrors && typeof rawErrors === 'object' && !Array.isArray(rawErrors)) {
      body.errors = rawErrors as Record<string, string[]>;
    }

    return body;
  }

  /**
   * Best-effort field extraction: class-validator prefixes each message with
   * the property name, which is what Laravel keys `errors` by.
   */
  private groupValidationMessages(messages: string[]): Record<string, string[]> {
    const grouped: Record<string, string[]> = {};

    for (const message of messages) {
      const field = message.split(' ')[0] ?? '_';
      (grouped[field] ??= []).push(message);
    }

    return grouped;
  }
}
