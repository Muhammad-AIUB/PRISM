<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Throwable;

class HealthController extends Controller
{
    /**
     * Lightweight health probe. Returns 200 if every component responds,
     * otherwise 503 with per-component status so liveness/readiness probes
     * can distinguish a degraded service.
     */
    public function __invoke(): JsonResponse
    {
        $database = $this->checkDatabase();
        $redis    = $this->checkRedis();
        $queue    = $this->checkQueue();

        $overall = ($database === 'connected' && $redis === 'connected')
            ? 'ok'
            : 'degraded';

        return response()->json([
            'status'    => $overall,
            'database'  => $database,
            'redis'     => $redis,
            'queue'     => $queue,
            'timestamp' => Carbon::now()->toIso8601String(),
        ], $overall === 'ok' ? 200 : 503);
    }

    protected function checkDatabase(): string
    {
        try {
            DB::connection()->getPdo();
            return 'connected';
        } catch (Throwable) {
            return 'down';
        }
    }

    protected function checkRedis(): string
    {
        try {
            Redis::connection()->ping();
            return 'connected';
        } catch (Throwable) {
            return 'down';
        }
    }

    /**
     * For the `database` queue driver we treat the worker as "running" when
     * the jobs table is reachable. For `sync` there is no worker. For `redis`
     * we approximate by checking the queue key is accessible.
     */
    protected function checkQueue(): string
    {
        try {
            $conn = config('queue.default');
            return match ($conn) {
                'sync'     => 'sync',
                'database' => DB::table('jobs')->count() >= 0 ? 'running' : 'stopped',
                'redis'    => Redis::connection()->ping() ? 'running' : 'stopped',
                default    => 'unknown',
            };
        } catch (Throwable) {
            return 'stopped';
        }
    }
}
