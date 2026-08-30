# prism-web

The Next.js frontend, replacing the Inertia/React pages in `resources/js`.

## The one thing to understand first

The session is an httpOnly cookie that **prism-api** sets. A browser only sends
a cookie back to the origin that set it, so this app and the API have to look
like one origin to the browser, or sign-in appears to work and then every
request is anonymous.

In production a reverse proxy does that: one hostname, with `/auth/*`,
`/api/v1/*` and `/webhook/github` routed to prism-api and everything else here.

Locally there is no proxy, so `next.config.mjs` rewrites those same paths.
The browser only ever talks to `:3001`.

Every API call is made **server-side** (`src/lib/api.ts`), which forwards the
cookie onward. The API origin, the cookie's value and the user's GitHub token
never reach the browser.

## Running it

Start Postgres, Redis and prism-api first — see
`../prism-api/LOCAL-VERIFICATION.md`, and note the warning there about the
repository's `.env` pointing at the production database.

```bash
npm install
npm run build
PRISM_API_ORIGIN=http://127.0.0.1:3999 APP_URL=http://localhost:3001 npm start
```

`npm run dev` for the watch server on the same port.

## Layout

```
src/
  app/            routes; server components fetch and pass data down
  components/     client components — anything with state or effects
  lib/
    api.ts        server-side fetch to prism-api, forwards the session cookie
    session.ts    the replacement for Inertia's shared auth.user prop
    types.ts      the API's response shapes
    time.ts       the relative-time helper the tables use
```

Pages render `<AuthenticatedLayout>` themselves rather than sitting inside a
route-group layout. That mirrors how the Inertia pages worked, and it is what
lets each page supply its own sticky header.

## Styling

`src/app/globals.css` is carried over from the Laravel app unchanged, and
`tailwind.config.ts` keeps the same token names (`bg-card`, `fg-muted`,
`border-base`, `accent`, …). Theme switching is a `light`/`dark` class on
`<html>`, applied by an inline script in the root layout **before first paint**
— doing it in an effect instead shows the wrong theme for a frame.

`prism-theme` is the only thing written to localStorage. No tokens, no PII.
