import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { runWithContext } from './request-context';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/**
 * Upstream ids are accepted only in a shape that is safe to log: an
 * unchecked header could forge log lines or carry a newline into them.
 */
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

const accessLog = new Logger('HTTP');

/**
 * Gives every request an id, returns it in X-Request-Id, and logs one line
 * when the response finishes.
 *
 * An incoming X-Request-Id is kept, so one id follows a page render from
 * prism-web through to the API call it made. Anything else gets a fresh one.
 *
 * The access line logs the path, never the query string: /auth/github/callback
 * carries a single-use OAuth code there.
 */
export function requestIdMiddleware(request: Request, response: Response, next: NextFunction): void {
  const incoming = request.header(REQUEST_ID_HEADER);
  const requestId = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  const started = process.hrtime.bigint();

  response.setHeader(REQUEST_ID_HEADER, requestId);

  runWithContext({ requestId }, () => {
    response.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;

      accessLog.log(`${request.method} ${request.path} ${response.statusCode} ${ms.toFixed(1)}ms`);
    });

    next();
  });
}
