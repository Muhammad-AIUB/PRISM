export type ComponentStatus = 'connected' | 'down';
export type QueueStatus = 'sync' | 'running' | 'stopped' | 'unknown';
export type OverallStatus = 'ok' | 'degraded';

/**
 * Response contract of GET /health, copied from Laravel's HealthController.
 * Key order matters for nothing functionally, but is preserved for diffability
 * against the current production response.
 */
export interface HealthResponseDto {
  status: OverallStatus;
  database: ComponentStatus;
  redis: ComponentStatus;
  queue: QueueStatus;
  timestamp: string;
}
