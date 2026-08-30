import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import type Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { toIso8601String } from '../../common/utils/iso8601';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type {
  ComponentStatus,
  HealthResponseDto,
  OverallStatus,
  QueueStatus,
} from './health.dto';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {}

  async check(): Promise<{ body: HealthResponseDto; statusCode: number }> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    const queue = await this.checkQueue();

    const status: OverallStatus =
      database === 'connected' && redis === 'connected' ? 'ok' : 'degraded';

    return {
      body: {
        status,
        database,
        redis,
        queue,
        // Non-null: Carbon::now() always produces a timestamp.
        timestamp: toIso8601String(new Date()) as string,
      },
      statusCode: status === 'ok' ? 200 : 503,
    };
  }

  private async checkDatabase(): Promise<ComponentStatus> {
    try {
      await this.dataSource.query('SELECT 1');

      return 'connected';
    } catch (error) {
      this.logger.warn(`Database health check failed: ${String(error)}`);

      return 'down';
    }
  }

  private async checkRedis(): Promise<ComponentStatus> {
    try {
      await this.redis.ping();

      return 'connected';
    } catch (error) {
      this.logger.warn(`Redis health check failed: ${String(error)}`);

      return 'down';
    }
  }

  /**
   * Mirrors Laravel's queue probe: for the `database` driver a reachable jobs
   * table means the worker path is intact; `sync` has no worker at all.
   */
  private async checkQueue(): Promise<QueueStatus> {
    try {
      const connection = this.configService.get<string>('queue.connection') ?? 'database';

      switch (connection) {
        case 'sync':
          return 'sync';
        case 'database': {
          await this.dataSource.query('SELECT COUNT(*) FROM jobs');

          return 'running';
        }
        case 'redis': {
          await this.redis.ping();

          return 'running';
        }
        default:
          return 'unknown';
      }
    } catch {
      return 'stopped';
    }
  }
}
