<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

class VerifyGithubIp
{
    /**
     * Allow only requests coming from GitHub's published webhook CIDR ranges
     * (https://api.github.com/meta → "hooks" array). Localhost is allowed for dev,
     * and the check is fully bypassed outside production so cloudflared tunnels
     * (random Cloudflare IPs) still work locally.
     *
     * The IP list is cached for 24h to avoid hitting GitHub on every request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $ip = $request->ip();

        if ($this->isLocalhost($ip) || ! app()->environment('production')) {
            return $next($request);
        }

        foreach ($this->githubHookCidrs() as $cidr) {
            if ($this->ipInCidr($ip, $cidr)) {
                return $next($request);
            }
        }

        Log::warning('Webhook rejected: IP not in GitHub range', ['ip' => $ip]);
        return response()->json(['message' => 'Forbidden — origin not allowed'], 403);
    }

    protected function isLocalhost(string $ip): bool
    {
        return in_array($ip, ['127.0.0.1', '::1'], true);
    }

    /** @return array<int, string> CIDR ranges */
    protected function githubHookCidrs(): array
    {
        return Cache::remember('github_meta_hooks', 86400, function () {
            try {
                $response = Http::acceptJson()->timeout(5)->get('https://api.github.com/meta');
                return $response->successful() ? ($response->json('hooks') ?? []) : [];
            } catch (\Throwable $e) {
                Log::warning('Failed to fetch GitHub meta', ['error' => $e->getMessage()]);
                return [];
            }
        });
    }

    /** Check whether an IP (v4 or v6) falls inside a CIDR block. */
    protected function ipInCidr(string $ip, string $cidr): bool
    {
        if (! str_contains($cidr, '/')) return $ip === $cidr;

        [$subnet, $bits] = explode('/', $cidr, 2);
        $bits = (int) $bits;

        $ipBin     = @inet_pton($ip);
        $subnetBin = @inet_pton($subnet);
        if ($ipBin === false || $subnetBin === false || strlen($ipBin) !== strlen($subnetBin)) {
            return false;
        }

        $bytes     = intdiv($bits, 8);
        $remainder = $bits % 8;

        if ($bytes > 0 && substr($ipBin, 0, $bytes) !== substr($subnetBin, 0, $bytes)) {
            return false;
        }
        if ($remainder === 0) return true;

        $mask = chr(0xff << (8 - $remainder) & 0xff);
        return (ord($ipBin[$bytes]) & ord($mask)) === (ord($subnetBin[$bytes]) & ord($mask));
    }
}
