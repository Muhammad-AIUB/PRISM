# Frontend (prism-web)

How the Next.js app is organised, and the standards every page and component must meet. The
rules at the bottom are enforced by review, not by tooling, so they are worth reading before
you touch a view.

## Shape of the app

`prism-web` is a Next.js 15 App Router application on React 19, styled with Tailwind CSS 3 and
CSS custom properties. **All data is fetched on the server.** Server Components fetch and pass
props down; Client Components exist only for state and effects; mutations are Server Actions.

```text
src/
  app/               routes. Server Components fetch and pass data down; actions.ts files hold Server Actions
  components/        client components, grouped by feature (review/, repositories/, design/, ...)
  lib/
    api.ts           the only way to call prism-api; forwards the session cookie and X-Request-Id
    wake.ts          waking a sleeping API (no Next imports; used by middleware, server and browser)
    session.ts       getSessionUser / getOptionalSessionUser (the shared "who am I" for pages)
    types.ts         the API's response shapes
    time.ts          relative-time formatting
    repository-reviews.ts
  middleware.ts      per-request CSP nonce and request id
  test/setup.ts      Vitest setup
```

Pages render `<AuthenticatedLayout>` themselves instead of sitting in a route-group layout, so
each page can supply its own sticky header.

### Routes

| Route | Auth | What it shows |
|---|---|---|
| `/` | public | Redirects to `/dashboard` when signed in, otherwise to `/login` |
| `/login`, `/login/github` | public | Sign-in; the second is the route handler that probes the API, then redirects to `/auth/github` |
| `/waking` | public | The wake page ([below](#waking-a-sleeping-api)) |
| `/dashboard` | session | Totals, recent PR and commit reviews, score timeline |
| `/repositories`, `/repositories/[id]`, `/repositories/[id]/settings` | session | Connect a repository; its reviews (25 per page); its mode and branches |
| `/reviews/[pullRequest]`, `/reviews/[pullRequest]/export` | session | A PR review (verdict, findings, risk, fixes, diff); the PDF |
| `/commits/[commitReview]` | session | A commit review |
| `/design`, `/design/[id]`, `/design/[id]/markdown` | session | Design Studio form and history; a blueprint; the Markdown download |
| `/settings`, `/profile` | session | Slack and API tokens; profile |
| `/security`, `/security/my-data`, `/security/audit-log` | `/security` public, rest session | What PRism stores, your data and deletion, your activity log |
| `/help/how-to-use` | session | In-app guide |
| `/demo`, `/demo/review/[id]` | public | A sample review on hard-coded data |

## Talking to the API

Everything goes through [`src/lib/api.ts`](../prism-web/src/lib/api.ts):

| Function | Use |
|---|---|
| `apiGet` / `apiSend` | Typed JSON calls; throw `ApiError(status, message, errors)` on failure |
| `apiGetAuthed` | Page loads behind auth: **401 redirects to `/login`; 400, 403 and 404 all render the not-found page** |
| `apiRaw` | Raw `Response`, for the diff, the PDF and the Markdown download |

Behaviour built in:

- The session cookie and `X-Request-Id` are forwarded; `cache: 'no-store'` is the default
  because every response is user-specific and must never be served to the next visitor.
- A `GET` that gets a `429` with a short `Retry-After` (up to 5 seconds) is retried once, because
  every call leaves from this server's single address and shares the API's per-IP buckets
  until a request is authenticated. Writes are never retried.
- 400/403/404 fold into one not-found page on purpose. A distinct "forbidden" screen would
  confirm that a review id exists.

A new data need is a new API route plus a typed call here, never a `fetch` in a component and
never an environment variable with `NEXT_PUBLIC_` in it.

## Waking a sleeping API

On Render's free tier a sleeping API answers `prism-web`'s requests with a 429 and
`x-render-routing: hibernate-rate-limited` without waking. `lib/api.ts` recognises that header
(`isHibernating`):

- A **page load** redirects to `/waking?next=<path>`. The wake page's client pings
  `{API origin}/health` directly (`no-cors`) every 10 seconds and polls same-origin `/auth/me`
  every 3 seconds, then returns the visitor to `next`. `safeNext()` only accepts a path on this
  site and never the wake page itself.
- A **Server Action** throws `ApiError(503, 'The server was asleep. Reload this page to wake it, then try again.')`.
  Actions catch what the API call throws and show its message, so a redirect would be swallowed,
  and a write must not be replayed behind the visitor's back.
- `/waking` is the only page whose CSP `connect-src` includes the API origin
  ([ADR 0005](adr/0005-wake-the-api-from-the-browser.md)).

## Security headers

`src/middleware.ts` runs on pages (not static assets, `/auth`, `/api/v1` or `/webhook`) and:

- generates a nonce and sets the CSP ([security.md](security.md#http-hardening));
- assigns or keeps a safe `X-Request-Id`, forwards it to server code, and returns it;
- records the page being rendered in `x-prism-path` so the wake redirect can return to it.

An inline `<script>` you add must read the nonce from the `x-nonce` request header, as
`layout.tsx` does for the theme script, or it will not run. Browsers blank a `nonce` attribute
once read, so the client always sees `nonce=""` there; that hydration mismatch is expected and
suppressed. A new third-party origin for images, fonts or APIs must be added to the policy
deliberately.

## Theming

Two themes, **dark by default**, switched by an `html.light` class and defined as CSS custom
properties in `globals.css`. `tailwind.config.ts` maps token names (`bg-card`, `fg-muted`,
`border-base`, `accent`, `success`, ...) to those variables, so utilities follow the theme.

A tiny inline script in `layout.tsx` applies the saved theme **before first paint**; doing it in
an effect would show the wrong theme for a frame. `prism-theme` (`'light'` or `'dark'`) is the
only thing PRism puts in `localStorage` besides per-design checklist ticks. No tokens, no PII.

| Token group | Names |
|---|---|
| Surfaces | `--bg-primary`, `--bg-secondary`, `--bg-card`, `--bg-hover` |
| Lines | `--border`, `--border-hover` |
| Text | `--text-primary`, `--text-secondary`, `--text-muted` |
| Accents | `--accent`, `--accent-hover`, `--accent-bg` (text, icons, borders, focus rings); `--accent-solid`, `--accent-solid-hover` (fills that carry white text) |
| Status | `--success`, `--warning`, `--danger`, `--info` |
| Shape | `--radius-sm` 6px, `--radius-md` 8px, `--radius-lg` 12px |

Why two accents: no single indigo satisfies both jobs in dark mode. The lighter `--accent` reads
as text on dark surfaces; the deeper `--accent-solid` holds white text as a button fill.

## Standards

These are rules, not preferences. They also appear, abbreviated, in [CLAUDE.md](../CLAUDE.md).

| Area | Rule |
|---|---|
| **Type** | Inter (optical-size variable cut) for UI, JetBrains Mono for code, both self-hosted through `@fontsource-variable/*`. No Google Fonts `<link>` or any font CDN: no render-blocking third-party request, no visitor IPs sent out, and the font cannot fail independently of the app |
| **Minimum size** | 12px (`text-xs`). Never `text-[10px]` or `text-[11px]`, including badges and counters |
| **Contrast** | WCAG AA, 4.5:1, for all text, in both themes, on every surface it can sit on (`--bg-card` and `--bg-hover` included). Check the ratio before changing a token. Never put white text on `--accent` |
| **Keyboard** | The global `:focus-visible` ring in `globals.css` is never removed or overridden with `outline: none` without a visible replacement |
| **Touch targets** | At least 44x44px for icon-only buttons, 32px for inline chips |
| **Motion** | Respects `prefers-reduced-motion`; handled globally in `globals.css` |
| **Hidden labels** | Use `sr-only sm:not-sr-only`, never `hidden`. `hidden` removes the text from screen readers and leaves an unnamed button |
| **Server actions** | They can reject (network drop, a deploy mid-page). One called from `useEffect` must `.catch` into a visible state or the component spins forever. One returning `ok: false` must show it. A failure must never look like a success |
| **Layout** | Works at 390px with no horizontal scroll. A grid that collapses on mobile uses an explicit `grid-cols-1`, because an implicit `auto` column grows to fit `truncate`d text |
| **Colour** | From the tokens. No hard-coded hex in components (GitHub language colours are the one exception) |
| **Honest states** | Say what actually happened. A review nobody produced is "not reviewed", never a green all-clear; an empty repository list says why it is empty |

Several views still deviate from these (dead `hover:` backgrounds, some raw tints, missing
dialog semantics and focus traps, some small touch targets). They are catalogued in
[known-issues.md](known-issues.md#ui-deviations); new code must not add to them.

## Verifying a UI change

`prism-web`'s tests cover logic and a handful of components, not layout. For any visible
change, in a real browser against the local stack ([development.md](development.md)):

1. Both themes (toggle in the header; also clear `prism-theme` and reload).
2. 390px wide: no horizontal scroll, nothing clipped, targets reachable.
3. The console open: no errors or CSP violations.
4. Keyboard only: reach and operate every new control, with a visible focus ring.
5. The empty, loading, error and `ok: false` states, not just the happy path.

## Testing

Vitest with jsdom and Testing Library; tests sit beside the code. Run `npm test` (Node 22.12 or
newer). What is and is not covered is listed in [testing.md](testing.md#untested-areas).
