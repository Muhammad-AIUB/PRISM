import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { currentContext } from './request-context';

/**
 * Nest's console logger, plus the request or job id on every line.
 *
 * In production it writes one JSON object per line (Nest's own json mode), so
 * a log drain can filter by level, context or requestId without regexes. In
 * development it keeps the coloured text format, with the id after the
 * context: `[ReviewProcessor] [job 42]`.
 */
export class AppLogger extends ConsoleLogger {
  protected override getJsonLogObject(
    message: unknown,
    options: {
      context: string;
      logLevel: LogLevel;
      writeStreamType?: 'stdout' | 'stderr';
      errorStack?: unknown;
    },
  ): ReturnType<ConsoleLogger['getJsonLogObject']> & RequestContextFields {
    const { requestId, jobId } = currentContext();

    return {
      ...super.getJsonLogObject(message, options),
      ...(requestId ? { requestId } : {}),
      ...(jobId ? { jobId } : {}),
    };
  }

  protected override formatContext(context: string): string {
    const { requestId, jobId } = currentContext();
    const tag = requestId ? `[${requestId}] ` : jobId ? `[job ${jobId}] ` : '';

    return super.formatContext(context) + this.colorize(tag, 'verbose');
  }
}

interface RequestContextFields {
  requestId?: string;
  jobId?: string;
}
