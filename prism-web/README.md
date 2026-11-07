# prism-web

The PRism frontend: a Next.js 15 App Router application on React 19. **Every API call is made on the
server**, so the API origin, the session cookie and the user's GitHub token never reach client
JavaScript.

For the reasoning see [docs/architecture.md](../docs/architecture.md) and
[docs/frontend.md](../docs/frontend.md). This page is the map of the package.

## The one thing to understand first

The session is an `httpOnly` cookie that **prism-api** sets, and a browser returns a cookie only to the
origin that set it. So this app and the API must look like one origin to the browser, or sign-in appears
to work and then every request is anonymous.

`next.config.mjs` rewrites `/auth/*`, `/api/v1/*` and `/webhook/*` to the API in every environment. Locally
the browser talks only to `:3001`. In production the same job can be done by a reverse proxy.

## Quick start

Needs **Node 22.12 or newer** (the Vitest 5 and jsdom 30 toolchain requires it) and a running `prism-api`
on port 3999. Start Postgres, Redis and the API first: [docs/development.md](../docs/development.md).

```bash
npm ci
npm run dev        # http://localhost:3001
```

No environment is needed locally: `PRISM_API_ORIGIN` defaults to `http://127.0.0.1:3999`. See
[`.env.example`](.env.example) and [docs/configuration.md](../docs/configuration.md).

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | `next dev -p 3001` |
| `npm run build` / `npm start` | Production build and server. `next start` honours `$PORT` |
| `npm run typecheck` | `tsc --noEmit`. Must pass before a commit |
| `npm run lint` | ESLint (`next/core-web-vitals`, `next/typescript`), `--max-warnings 0`. Must pass |
| `npm test` | Vitest with jsdom and Testing Library. Must pass |

## Layout

```text
src/
  app/             routes; Server Components fetch and pass data down; actions.ts hold Server Actions
  components/      client components by feature (review/, repositories/, design/, security/, ...)
  lib/
    api.ts         the only way to call prism-api; forwards the cookie and X-Request-Id
    session.ts     getSessionUser / getOptionalSessionUser
    types.ts       the API's response shapes
  middleware.ts    per-request CSP nonce and request id
```

## Rules that live here

- **Data comes from `lib/api.ts` only.** No `fetch` in a component, no `NEXT_PUBLIC_` variable.
  `apiGetAuthed()` folds 400, 403 and 404 into the not-found page on purpose.
- **CSP:** an inline `<script>` must use the nonce from the `x-nonce` request header; a new third-party
  origin must be added to `middleware.ts` deliberately. The browser never connects to the API origin.
- **Fonts are self-hosted** (`@fontsource-variable/*`). Never add a font CDN.
- **UI standards:** 12 px minimum text, WCAG AA contrast in both themes, tokens not hex, visible focus,
  44 px touch targets, 390 px with no horizontal scroll, and a visible failure state for every Server
  Action. Full list in [docs/frontend.md](../docs/frontend.md#standards).
- **Theme** is a `light`/`dark` class on `<html>`, applied by an inline script before first paint.
  `prism-theme` is the only thing written to `localStorage` (plus per-design checklist ticks).

Verify a visible change in a real browser: both themes, 390 px, console open, keyboard only.
