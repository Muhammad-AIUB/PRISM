export type ComponentStatus = 'connected' | 'down';
export type QueueStatus = 'running' | 'stopped';
export type OverallStatus = 'ok' | 'degraded';

/**
 * Response contract of GET /health, carried over from the PHP HealthController
 * so existing probes keep parsing it. `queue` no longer reports a driver name:
 * there is one queue now, BullMQ on Redis, and it is either reachable or not.
 */
export interface HealthResponseDto {
  status: OverallStatus;
  database: ComponentStatus;
  redis: ComponentStatus;
  queue: QueueStatus;
  timestamp: string;
}
