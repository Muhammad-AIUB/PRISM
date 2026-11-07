# 0005. Wake a sleeping API from the visitor's browser

Status: Superseded. `prism-api` now runs on a VPS that does not sleep, and the wake page, `lib/wake.ts` and
`/login/github` were removed. Kept as history.
Date: 2026-10-04 (`0ba3cc6`)

## Context

On Render's free tier a web service sleeps after 15 idle minutes. "Continue with GitHub" was showing a
bare "Too Many Requests". That was not PRism's rate limiter: while `prism-api` sleeps, **Render's edge
answers every request `prism-web` makes to it with a 429** and `x-render-routing:
hibernate-rate-limited`, and never starts the service.

It was measured: 25 proxied requests over four minutes left the API asleep, while **one request made
straight to the API from outside Render woke it in 42 seconds**. So the Next.js server cannot wake the
API, and the visitor's browser can.

## Decision

- `lib/api.ts` recognises the hibernation header (`isHibernating`). A **page load** redirects to
  `/waking?next=<path>`; there the browser pings `{API origin}/health` directly (`no-cors`) every 10 s
  and polls same-origin `/auth/me` every 3 s, then returns the visitor to `next` (`safeNext()` accepts
  only a path on this site).
- A **Server Action** cannot be redirected, because actions catch what the API call throws and show its
  message, and a write must not be replayed behind the visitor's back. It throws a 503 `ApiError`:
  "The server was asleep. Reload this page to wake it, then try again."
- Sign-in starts at `/login/github`, a route handler that makes one API call first, instead of the
  `/auth/github` rewrite, whose response nothing in `prism-web` could see.
- `/waking` is the **only** page whose CSP `connect-src` includes the API origin, and the only place the
  API origin reaches the browser. It is not a secret (GitHub's webhooks must reach it), but everything
  else still goes through the server.

## Consequences

- A visitor who arrives after an idle spell waits about 40 seconds on a page that explains why, and is
  returned to where they were going.
- This exception to [ADR 0004](0004-server-side-api-access-on-one-hostname.md) must stay narrow: do not
  add the API origin to any other page's CSP.
- It does **nothing for webhooks**. A delivery that GitHub sends through the web host to a sleeping API
  gets the same 429 and is lost; GitHub does not redeliver on its own
  ([T15](../known-issues.md#t15)).
- A scheduled keep-alive workflow did not solve this either: GitHub ran its `*/10` cron far less often
  than every ten minutes. It has since been removed.

## Alternatives considered

- **Ping from the server.** Disproved by the measurement above.
- **An always-on paid plan.** The honest fix for production; out of scope on the free tier.
- **A longer client-side retry loop on the failing page.** Rejected: the page still has no way to make
  the one request that works.
