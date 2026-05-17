<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class LogRequests
{
    /**
     * Tag every request with a UUID and log a structured access line on completion.
     * The UUID is attached to the response as X-Request-Id and shared with the
     * default Log context so any Log:: call inside the request includes it.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $requestId = (string) Str::uuid();
        $start     = microtime(true);

        // Make the request_id available to every Log:: call in this request.
        Log::withContext(['request_id' => $requestId]);
        $request->attributes->set('request_id', $requestId);

        /** @var Response $response */
        $response = $next($request);

        $durationMs = (int) round((microtime(true) - $start) * 1000);

        $response->headers->set('X-Request-Id', $requestId);

        Log::info('http_request', [
            'request_id' => $requestId,
            'user_id'    => optional($request->user())->id,
            'method'     => $request->method(),
            'path'       => $request->path(),
            'status'     => $response->getStatusCode(),
            'duration_ms'=> $durationMs,
            'ip'         => $request->ip(),
        ]);

        return $response;
    }
}
