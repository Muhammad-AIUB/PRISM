# 0004. Call the API only from the server, and serve both services on one hostname

Status: Accepted
Date: 2026-08-30 (the Next.js frontend was stood up in `9f2b282`)

## Context

PRism has a NestJS API and a Next.js frontend. The browser needs to be signed in, and the user's GitHub
token and the session credentials are the most sensitive things the system handles. A typical
single-page-app split would have the browser call the API directly, which means the API origin is
public to the page, CORS must be configured, and the credential has to be readable by or attached from
client JavaScript.

The session is an `httpOnly` cookie set by the API. A browser returns a cookie only to the origin that
set it.

## Decision

1. **Every API call is made on the server**, from a React Server Component or a Server Action, through
   `prism-web/src/lib/api.ts`. That function reads the cookie from the incoming request and forwards
   it, plus an `X-Request-Id`. The API origin, the session token and the GitHub token never reach client
   JavaScript, so `PRISM_API_ORIGIN` has no `NEXT_PUBLIC_` prefix.
2. **Both services answer on one hostname.** `next.config.mjs` rewrites `/auth/:path*`, `/api/v1/:path*`
   and `/webhook/:path*` to the API in every environment. A reverse proxy routing the same paths would
   be equivalent.
3. The API has no CORS configuration and serves no pages (CSP `default-src 'none'`).

## Consequences

- A whole class of browser-side token theft does not exist, and the API surface the browser can reach is
  just three path prefixes.
- If the one-hostname property breaks (a different host for the callback, a mismatched
  `SESSION_COOKIE_NAME`), sign-in *appears* to work and every later request is anonymous. This is the
  most confusing failure in the system; [operations.md](../operations.md#sign-in-succeeds-but-every-page-is-anonymous)
  has the checklist.
- Every page waits on server-to-server calls, and every call leaves from `prism-web`'s single address,
  so all anonymous traffic shares the API's per-IP rate-limit buckets. The global rate limiter verifies
  the session cookie and keys signed-in traffic per user for this reason, and `api.ts` retries a `GET`
  that lands on a nearly-reset 429.
- The webhook reaches the API through the web host's rewrite, which interacts badly with a sleeping API
  ([ADR 0005](0005-wake-the-api-from-the-browser.md), [T15](../known-issues.md#t15)).
- `apiGetAuthed()` folds 400, 403 and 404 into one not-found page so that a "forbidden" screen cannot
  confirm a review id exists.

## Alternatives considered

- **Browser calls the API directly with a bearer token.** Rejected: exposes the token to JavaScript and
  needs CORS.
- **Separate hostnames with a cross-site cookie (`SameSite=None`).** Rejected: fragile across browsers'
  third-party cookie policies and widens the CSRF surface.
- **Do everything in Next.js route handlers and drop the NestJS API.** Rejected: the API is also the
  public contract for the MCP server and receives GitHub webhooks, and it hosts the long-running worker.
