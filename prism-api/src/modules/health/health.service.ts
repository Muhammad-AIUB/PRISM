import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { REVIEW_QUEUE } from '../review/review.queue';
import { toIso8601String } from '../../common/utils/iso8601';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type {
  ComponentStatus,
  HealthResponseDto,
  OverallStatus,
  QueueStatus,
} from './health.dto';

/** Render's health check gives up well before this; answering beats hanging. */
const HEALTH_PROBE_TIMEOUT_MS = 3000;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectQueue(REVIEW_QUEUE) private readonly reviewQueue: Queue,
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
      await this.withTimeout(this.dataSource.query('SELECT 1'), HEALTH_PROBE_TIMEOUT_MS);

      return 'connected';
    } catch (error) {
      this.logger.warn(`Database health check failed: ${String(error)}`);

      return 'down';
    }
  }

  private async checkRedis(): Promise<ComponentStatus> {
    try {
      await this.withTimeout(this.redis.ping(), HEALTH_PROBE_TIMEOUT_MS);

      return 'connected';
    } catch (error) {
      this.logger.warn(`Redis health check failed: ${String(error)}`);

      return 'down';
    }
  }

  /**
   * Asks BullMQ itself, rather than the old probe's `SELECT COUNT(*) FROM jobs`
   * — that table belonged to the PHP queue, is not in schema.sql, and would
   * have reported a healthy queue on a database with no worker attached.
   *
   * getJobCounts round-trips to Redis over the same connection the worker
   * uses, so a green result means the worker can actually reach its queue.
   *
   * The timeout is not optional. BullMQ requires `maxRetriesPerRequest: null`
   * on its connection, so with Redis down this call retries forever and the
   * whole endpoint hangs instead of answering — which is precisely when a
   * health check needs to answer.
   */
  private async checkQueue(): Promise<QueueStatus> {
    try {
      await this.withTimeout(this.reviewQueue.getJobCounts(), HEALTH_PROBE_TIMEOUT_MS);

      return 'running';
    } catch (error) {
      this.logger.warn(`Queue health check failed: ${String(error)}`);

      return 'stopped';
    }
  }

  /** Bounds a probe so one unreachable dependency cannot stall the response. */
  private async withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        work,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`probe timed out after ${ms}ms`)), ms);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
