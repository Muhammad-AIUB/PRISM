import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */

/**
 * The session cookie is set by prism-api, so the browser only sends it to
 * whatever origin prism-api answers on. In production a reverse proxy puts
 * both services behind ONE hostname — /auth/*, /webhook/github and /api/v1/*
 * go to prism-api, everything else here — which makes them same-origin and
 * the cookie readable by both.
 *
 * Locally there is no proxy, so these rewrites stand in for it: the browser
 * only ever talks to :3001, the cookie is set on :3001, and Next forwards it
 * onward. Without this, sign-in appears to work and then every request is
 * anonymous, which is a confusing way to lose an afternoon.
 */
const apiOrigin = process.env.PRISM_API_ORIGIN ?? 'http://127.0.0.1:3999';

const nextConfig = {
  reactStrictMode: true,

  // Pin tracing to this package. Derived the long way round rather than with
  // import.meta.dirname, which needs Node >= 20.11 — not worth depending on
  // the host's Node version for one path.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),

  async rewrites() {
    return [
      // Covers /auth/github, its callback, /auth/logout and /auth/me. Safe to
      // claim the whole prefix: the app's own sign-in pages live at /login and
      // /register, not under /auth.
      { source: '/auth/:path*', destination: `${apiOrigin}/auth/:path*` },
      { source: '/api/v1/:path*', destination: `${apiOrigin}/api/v1/:path*` },
      { source: '/webhook/:path*', destination: `${apiOrigin}/webhook/:path*` },
    ];
  },

  images: {
    // GitHub avatars are the only remote images the app renders.
    remotePatterns: [{ protocol: 'https', hostname: 'avatars.githubusercontent.com' }],
  },
};

export default nextConfig;
