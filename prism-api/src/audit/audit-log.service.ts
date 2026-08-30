import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as OrmRepository } from 'typeorm';
import { AuditLog } from '../database/entities';

/**
 * Port of AuditLog::record(). Two behaviours carried over verbatim:
 *
 *   - a null user id is a no-op, not an error
 *   - a write failure is swallowed and logged; audit logging must never break
 *     the flow it is recording
 *
 * ip_address stays null here. Laravel fills it from request()?->ip(), which is
 * already null inside a queued job, so this matches what the rows look like
 * today for review_completed entries.
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogs: OrmRepository<AuditLog>,
  ) {}

  async record(
    userId: number | null | undefined,
    action: string,
    description = '',
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    if (!userId) {
      return;
    }

    try {
      await this.auditLogs.save(
        this.auditLogs.create({
          userId,
          action,
          description,
          // Laravel writes null rather than an empty object for `[]`.
          metadata: Object.keys(metadata).length > 0 ? metadata : null,
          ipAddress: null,
          createdAt: new Date(),
        }),
      );
    } catch (error) {
      this.logger.warn(
        `AuditLog write failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
