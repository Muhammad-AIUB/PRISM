import { NextResponse, type NextRequest } from 'next/server';

/** Upstream ids are kept only in a shape that is safe to log (matches prism-api). */
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Per request: a request id, and a strict Content-Security-Policy.
 *
 * The request id is forwarded by src/lib/api.ts on every API call this render
 * makes, so prism-api's logs for all of them share one X-Request-Id, and the
 * same id is returned to the browser to quote in a bug report.
 *
 * The Content-Security-Policy:
 *
 * Scripts run only if they carry this request's nonce ('strict-dynamic' lets
 * the scripts Next loads load their own chunks). Next reads the nonce from the
 * request's CSP header and applies it to every script it renders; the one
 * inline script of our own, the theme bootstrap in layout.tsx, reads it from
 * `x-nonce`. An injected <script> - the payload of almost every XSS - has no
 * nonce and does not run.
 *
 * Styles allow 'unsafe-inline' because the components set inline `style`
 * attributes throughout. That is the accepted trade: CSS cannot execute code,
 * and the script policy is what stops XSS.
 */
export function middleware(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const dev = process.env.NODE_ENV !== 'production';

  const policy = [
    "default-src 'self'",
    // React's dev tooling needs eval; production never gets it.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    // GitHub avatars: github.com/{login}.png redirects to avatars.githubusercontent.com.
    "img-src 'self' data: blob: https://github.com https://avatars.githubusercontent.com",
    "font-src 'self'",
    `connect-src 'self'${dev ? ' ws:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  const incoming = request.headers.get('x-request-id');
  const requestId = incoming && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set('x-request-id', requestId);

  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set('Content-Security-Policy', policy);
  response.headers.set('X-Request-Id', requestId);

  return response;
}

export const config = {
  matcher: [
    {
      // Pages only. Static assets need no nonce, and /auth, /api/v1 and
      // /webhook are proxied to prism-api, which sets its own headers.
      source: '/((?!_next/static|_next/image|favicon|og-image|auth/|api/v1/|webhook/).*)',
      // Prefetches are not rendered, so they need no policy of their own.
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
