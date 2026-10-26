# PRism UI Spec

Status: describes `prism-web` as built at `3ae7b5f` (2026-10-26), plus the rules every
change must meet. Where the code and a rule disagree, the rule wins and the gap is
listed in [§11 Known deviations](#11-known-deviations).

Related: [PRD](PRD.md) · [App flow](Appflow.md) · [TRD](trd.md) · [Schema](schema.md) · [Plan](plan.md)

---

## 1. The bar

The bar is what Apple, Google or GitHub would ship. These rules come from `CLAUDE.md`
and are requirements, not preferences:

| # | Rule |
|---|---|
| U1 | **Type:** Inter (optical-size variable cut) for UI, JetBrains Mono for code, both self-hosted through `@fontsource-variable/*` imported in `layout.tsx`. No Google Fonts `<link>`, no font CDN. |
| U2 | **Minimum text size is 12px** (`text-xs`). Nothing smaller anywhere, badges and counters included. |
| U3 | **Contrast is WCAG AA (4.5:1) for all text**, in both themes, on every surface it can sit on (`--bg-card` and `--bg-hover` included). |
| U4 | **Two accents.** `--accent` is for text, icons, borders and focus rings. `--accent-solid` is for fills that carry white text. Never white text on `--accent`. |
| U5 | **Keyboard:** the global `:focus-visible` ring is never removed, or overridden with `outline: none`, without a visible replacement. |
| U6 | **Touch targets:** at least 44×44px for icon-only buttons, 32px for inline chips. |
| U7 | **Motion** respects `prefers-reduced-motion` (handled globally in `globals.css`). |
| U8 | **Labels hidden on mobile** use `sr-only sm:not-sr-only`, never `hidden`. |
| U9 | **Server actions can reject.** One called from a `useEffect` must `.catch` into a visible state. A result with `ok: false` must be shown. A failure never looks like a success. |
| U10 | **Layout works at 390px** with no horizontal scroll. Collapsing grids use an explicit `grid-cols-1`. |
| U11 | **Colours come from the CSS tokens**, never hard-coded hex in components. |

Every UI change is checked in a real browser, in both themes, at 390px and at desktop
width, with no console errors, before it is committed ([§12](#12-verification-checklist)).

---

## 2. Theming

- **Dark is the default.** `:root` in `src/app/globals.css` holds the dark values;
  `html.light` overrides them. `layout.tsx` renders `<html className="dark">`.
- **The choice is stored** in `localStorage['prism-theme']`. A nonce'd inline
  `THEME_SCRIPT` in `layout.tsx` runs before paint and adds `light` only when the stored
  value is exactly `'light'`. This keeps first paint free of a theme flash.
- **The system preference is ignored.** With nothing stored you get dark. There are no
  `dark:` Tailwind variants and no `prefers-color-scheme` queries.
- `ThemeToggle` (a `.menu-item` row in the user menu) writes the class and the storage
  key. `ThemeSync` re-applies the saved theme after React re-renders `<html>` on the
  client, which happens on the error and not-found paths.
- `color-scheme` is `dark` on `html` and `light` on `html.light`, so native controls and
  scrollbars follow.

---

## 3. Colour tokens

Defined in `src/app/globals.css` (`:root` lines 5-52, `html.light` lines 54-85).
Components read them as `var(--token)`, almost always through inline `style` objects.

| Token | Dark | Light | Role |
|---|---|---|---|
| `--bg-primary` | `#0a0a0f` | `#f8fafc` | Page background |
| `--bg-secondary` | `#13131a` | `#ffffff` | Sidebar, inputs |
| `--bg-card` | `#1a1a24` | `#ffffff` | Cards |
| `--bg-hover` | `#22222e` | `#eef2ff` | Hover and selected rows |
| `--border` | `#2a2a36` | `#e2e8f0` | Default borders, dividers |
| `--border-hover` | `#3a3a48` | `#cbd5e1` | Hovered borders |
| `--text-primary` | `#f1f5f9` | `#0f172a` | Headings, body |
| `--text-secondary` | `#94a3b8` | `#475569` | Supporting text |
| `--text-muted` | `#808b9e` | `#5f6b7f` | Eyebrows, metadata, placeholders |
| `--accent` | `#818cf8` | `#4f46e5` | Links, icons, active borders, focus ring |
| `--accent-hover` | `#a5b4fc` | `#4338ca` | Hovered accent text |
| `--accent-bg` | `rgba(129,140,248,.14)` | `rgba(79,70,229,.08)` | Active nav item, accent chips |
| `--accent-solid` | `#4f46e5` | `#4f46e5` | Fills with white text |
| `--accent-solid-hover` | `#4338ca` | `#4338ca` | Hovered fills |
| `--success` | `#22c55e` | `#157a3a` | Completed, nothing found, low risk, good score |
| `--warning` | `#f59e0b` | `#a8500a` | Pending, worth a look, medium risk, middling score |
| `--danger` | `#f87171` | `#b91c1c` | Failed, blocking, high risk, low score, critical |
| `--info` | `#60a5fa` | `#1d4ed8` | Analyzing, suggestion severity |
| `--shadow-card` | `0 0 0 1px transparent` | two soft slate shadows | Card elevation |
| `--header-bg` | `rgba(10,10,15,.70)` | `rgba(255,255,255,.80)` | Sticky header behind blur |
| `--radius-sm` / `-md` / `-lg` | 6 / 8 / 12px | same | Corners (`-lg` is defined but unused) |

### 3.1 Measured contrast

Computed with the WCAG 2.x relative-luminance formula on 2026-10-26. Every text token
passes AA on every surface in both themes. The tightest pairs are muted text on
`--bg-hover` (4.57 dark, 4.82 light) and light `--success` on `--bg-hover` (4.84);
any change to those tokens needs a re-check.

| Text token on → | primary | secondary | card | hover |
|---|---|---|---|---|
| **Dark** `--text-primary` | 18.03 | 16.88 | 15.75 | 14.35 |
| `--text-secondary` | 7.70 | 7.21 | 6.73 | 6.13 |
| `--text-muted` | 5.74 | 5.37 | 5.02 | 4.57 |
| `--accent` | 6.62 | 6.20 | 5.78 | 5.27 |
| `--success` / `--warning` | 8.67 / 9.20 | 8.11 / 8.61 | 7.57 / 8.03 | 6.90 / 7.32 |
| `--danger` / `--info` | 7.14 / 7.77 | 6.68 / 7.27 | 6.24 / 6.79 | 5.68 / 6.18 |
| **Light** `--text-primary` | 17.06 | 17.85 | 17.85 | 15.97 |
| `--text-secondary` | 7.24 | 7.58 | 7.58 | 6.78 |
| `--text-muted` | 5.15 | 5.39 | 5.39 | 4.82 |
| `--accent` | 6.01 | 6.29 | 6.29 | 5.62 |
| `--success` / `--warning` | 5.18 / 5.26 | 5.42 / 5.50 | 5.42 / 5.50 | 4.84 / 4.92 |
| `--danger` / `--info` | 6.18 / 6.41 | 6.47 / 6.70 | 6.47 / 6.70 | 5.79 / 5.99 |

White on fills: `--accent-solid` 6.29, `--accent-solid-hover` 7.90, light `--danger`
6.47. **White on dark `--accent` is 2.98 and white on dark `--danger` is 2.77**, which
is why rule U4 exists and why a solid red button needs its own fill token (see D4).

### 3.2 Semantic colour map

One status vocabulary runs through the whole app. Use these mappings rather than
choosing colours per screen.

| Concept | Value → token |
|---|---|
| Job status (`StatusPill`, `ReviewStatusPill`) | pending → warning · analyzing → info with `.pulse-dot` · completed → success · failed → danger |
| Verdict (`VerdictPanel`) | blocking → danger · worth_a_look → warning · nothing_found → success · not_reviewed → warning |
| Risk level (`RiskPanel`) | high → danger · medium → warning · low → success |
| Score (`ScorePill`, `ScoreCircle`) | > 70 → success · ≥ 40 → warning · < 40 → danger · null → "—" / "No score" |
| Severity (`SeverityBadge`) | critical → danger · warning → warning · suggestion → info |
| Layer (`LAYER_LABEL`) | security → danger · performance → warning · code_quality → accent |
| Review mode (`ModeBadge`) | pr_only "Pull Requests" → accent · commit_only "Commits" → info · both "Both" → success |

Tinted backgrounds for these are made with `color-mix(in srgb, var(--token) 12%, transparent)`
and borders at 28-32%, so they follow the theme. Raw `rgba()` palette literals do not
(see D9).

---

## 4. Typography

- **Families** (`tailwind.config.ts`): `sans` = `Inter Variable`, `mono` =
  `JetBrains Mono Variable`, each with the Tailwind default stack behind it.
  `layout.tsx` imports `@fontsource-variable/inter/opsz.css` (weights 100-900, `opsz`
  axis) and `@fontsource-variable/jetbrains-mono` (100-800). Only upright faces ship,
  so italics are synthesised.
- **Body:** `font-feature-settings: 'cv02','cv03','cv04','cv11'`,
  `font-optical-sizing: auto`.
- **Mono** is used for code, diffs, SHAs, file paths, token values, scores in pills and
  audit-log action keys. `code`, `pre` and `.font-mono` get it automatically.

| Use | Classes |
|---|---|
| Page H1 | `text-xl sm:text-2xl lg:text-3xl font-semibold` |
| Eyebrow above H1 | `text-xs font-medium uppercase tracking-wider`, colour `--text-muted` |
| Card heading | `text-base` or `text-lg font-semibold` |
| Body | `text-sm` (the default for most UI text) |
| Metadata, badges, helper text | `text-xs` (the floor; never smaller) |
| Hero (login, help, security) | up to `lg:text-5xl` |

Weights in use: `font-medium` and `font-semibold` for nearly everything, `font-bold`
rarely. Headings and body copy are sentence case; many button labels and some page
titles are Title Case ("Connect Repository", "Copy Fix", "Activity Log"). New copy uses
sentence case.

---

## 5. Layout, spacing and breakpoints

- **Breakpoints** are Tailwind 3 defaults: `sm` 640, `md` 768, `lg` 1024, `xl` 1280,
  `2xl` 1536. The sidebar appears at `lg`.
- **Content widths:** main column `max-w-7xl`; single-form pages (Profile, Settings,
  Repository settings, Audit log) `max-w-3xl`; My Data and How to Use `max-w-4xl`;
  Security `max-w-5xl`.
- **Page padding:** `p-4 sm:p-6 lg:p-8`. **Vertical rhythm:** `space-y-4 sm:space-y-6`
  or `space-y-6` between sections.
- **Cards:** `.card` pads 1.25rem; content cards use `p-4 sm:p-6` or `p-5 sm:p-6`.
- **Grids** that collapse on mobile start at `grid-cols-1` (rule U10). Examples:
  repositories `grid-cols-1 md:grid-cols-2 2xl:grid-cols-3`; stat cards
  `grid-cols-2 lg:grid-cols-4`; Design Studio `grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]`.
- **Radius:** `.btn`, `.input` use `--radius-sm`; `.card` uses `--radius-md`; elsewhere
  mostly Tailwind `rounded-md` and `rounded-full`, with some `rounded-lg` and `rounded`.
- **Wide tables** (`ReviewFeedTable` at `md`+) scroll inside their own container, never
  the page.

---

## 6. App shell

### 6.1 Authenticated layout (`components/layouts/AuthenticatedLayout.tsx`)

There is no shared route-group layout. Each authenticated page renders
`<AuthenticatedLayout>` itself and passes its own header content.

**Sidebar** (`lg`+, fixed, `w-60`, `2xl:w-[280px]`, `--bg-secondary`):

1. Brand: gradient tile with the layers mark and `PRism` in `.brand-text`.
2. Navigation, in this order:

   | Label | Href | Icon (lucide) | Active when path… |
   |---|---|---|---|
   | Dashboard | `/dashboard` | LayoutDashboard | is `/dashboard` |
   | Repositories | `/repositories` | GitBranch | starts with `/repositories` |
   | Reviews | `/dashboard` | FileSearch | starts with `/reviews` or `/commits` |
   | Design Studio | `/design` | Network | starts with `/design` |
   | Settings | `/settings` | Settings | starts with `/settings` |
   | Security & Privacy | `/security` | Shield | starts with `/security` |

   "Reviews" has no index page yet, so it points at the dashboard feed.
   Active items use `.nav-item-active`, an `--accent-solid` dot and a heavier icon stroke.
   Security & Privacy always shows a hard-coded green dot instead.
3. Help pill: "Need Help? How to Use" → `/help/how-to-use`, with a `.pulse-dot`.
4. User menu button: avatar (GitHub avatar, or the initial on `--accent-solid`),
   `github_username` (else name), email, chevron. It opens a popover with **Profile**, the **Theme** toggle
   row and **Log out**.

**Below `lg`:** the sticky header shows a hamburger that opens a left drawer (`w-72`,
200ms slide, `bg-black/60` blurred overlay). The drawer closes on overlay click, on any
nav click and when the window grows to `lg`. Body scroll is locked while it is open.

**Header:** sticky, `z-20`, `backdrop-blur`, `--header-bg`, bottom border; inner
`max-w-7xl px-4 py-4 sm:px-6 sm:py-5 lg:px-8`. Pattern: eyebrow, H1, then actions on the
right. Action labels collapse to icons below `sm` with `sr-only sm:not-sr-only`.

**Footer:** "Developed by Muhammad Jubayer" linking to `https://www.mjubayer.dev/`. The
same footer appears on Login, guest Security and Demo.

**Sign-out** posts to `/auth/logout` (rewritten to the API, which revokes the session),
then `router.push('/login')` and `router.refresh()`.

### 6.2 Other shells

- **Guest Security layout:** sticky header with logo, "Trust / Security & Privacy" and a
  "Sign in" button; footer. Used when `/security` is viewed signed out.
- **Demo layout** (`components/demo/DemoLayout.tsx`): sticky `--accent-solid` banner
  ("Demo Mode — you're viewing sample data. Sign in with GitHub to use PRism for real →"),
  a desktop-only sidebar of five items (Dashboard, Repositories, Reviews and Settings lead
  to `/demo` with a "demo" pill; Security & Privacy is the real `/security`), "Sign in
  with GitHub" and the theme toggle. No header and no drawer below `lg` (see D27).
- **Bare pages:** `/login`, `/waking`, the error boundary and 404 render without a shell.

---

## 7. Components

### 7.1 Primitives (`globals.css`, `@layer components`)

| Class | Spec |
|---|---|
| `.btn` | inline-flex, gap .5rem, padding .5rem 1rem (about 36px tall), `--radius-sm`, 14px/500, 150ms transitions, its own accent `:focus-visible` outline, `:disabled` at 55% opacity with `not-allowed`. Buttons that stand alone on touch screens add `min-h-[44px]`. |
| `.btn-primary` | `--accent-solid` fill, white text, hover `--accent-solid-hover`. One per view region. |
| `.btn-secondary` | transparent, `--text-primary`, 1px `--border`; hover `--bg-hover` / `--border-hover`. |
| `.btn-ghost` | transparent, `--text-secondary`; hover `--bg-hover` / `--text-primary`. |
| `.card` | `--bg-card`, 1px `--border`, `--radius-md`, 1.25rem padding, `--shadow-card`; hover border `--border-hover`. |
| `.card-flat` | `.card` without padding or hover. Used for sections that hold their own padded rows. |
| `.input` | full width, `--bg-secondary`, 1px `--border`, `--radius-sm`, .5rem .75rem, 14px. Focus: `--accent` border plus a 3px accent glow. Placeholder `--text-muted`. |
| `.badge` | pill, .125rem .5rem, 12px/500, 1px border, `nowrap`. |
| `.nav-item` / `.nav-item-active` | min-height 44px, 14px/500, 2px left border; active = `--accent-bg`, `--accent` text and border, 600 weight. |
| `.menu-item` | min-height 44px, full width, hover `--bg-hover`. |
| `.tab-item` / `.tab-item-active` | .75rem padding (about 47px tall), 2px bottom border; active = `--accent` text and border. |
| `.pulse-dot` | 8px `--info` dot with a 1.4s ring. Marks "analyzing" and the help pill. |
| `.anim-fade-in` / `.anim-score-in` | 200ms fade-and-rise; 600ms scale-in for the score ring. |

The focus ring (`globals.css` 113-117) applies to `a, button, input, select, textarea,
summary, [tabindex]`: `outline: 2px solid var(--accent); outline-offset: 2px`.

### 7.2 Feedback

- **FlashBanner** (`components/ui/FlashBanner.tsx`): `role="alert"` for errors and
  `role="status"` for success. Success auto-dismisses after 5s; errors stay until
  dismissed. Green or red 10% tint, 30% border, token text, dismiss X.
- **Inline field errors:** red text under the field, from the API's 422 `errors` map.
- **Toast:** "Copied to clipboard", fixed bottom-centre, 2s. Must be a live region (D15).
- **Empty state pattern:** icon in a tinted circle, one-line title, one sentence on what
  to do next, and a primary action when one exists.
- **Loading:** there is no `loading.tsx`; pages render server-side. In-place loading
  uses a spinning `Loader2` or `RefreshCw` with a text label ("Loading branches from
  GitHub…", "Assessing change risk…").

### 7.3 Review display

- **StatusPill / ReviewStatusPill:** dot plus label, colours from §3.2.
  `ReviewStatusPill` shows the raw lowercase word.
- **ScorePill:** mono xs semibold pill, colour from §3.2; null shows "—".
- **ScoreCircle:** 128px SVG ring (r 56, stroke 10), 800ms dash transition; null shows
  "No score". Above the title on mobile, right-aligned from `lg`.
- **VerdictPanel** (`components/review/parts.tsx`): renders nothing when `verdict` or
  `findings` is absent. The API computes both for every review on read, so in practice it
  always renders, including on unfinished commit reviews (D31). It shows the verdict label in its colour, the
  finding count (hidden for `not_reviewed`), up to three findings in API order
  (`n.`, `file:line`, " (removed)" for removed-side lines, a category chip unless
  `other`, the comment), then "{n} more finding(s) in the tabs below." Notes:

  | Verdict | Note |
  |---|---|
  | Blocking | "Something here can be checked against the diff and should stop a merge." |
  | Worth a look | "Nothing that clearly blocks, but read these before merging." |
  | Nothing found | "No issue survived checking against the lines this change actually touched." |
  | Not reviewed | "The AI did not return a review… Re-analyze to try again." Never styled as a pass. |

- **RiskPanel** (`components/review/RiskPanel.tsx`): loads after render through the
  `loadRisk` action and reloads when kind, id or revision changes. Header: Radar icon,
  level label, `score/100`, and "N files · +a −d · T test file(s)". A `role="meter"`
  bar (min width 3%). When `basis` is `current`, a warning line says the assessment is of
  the PR's current head. "Why (n)" toggles signal chips into a detailed list. "Before
  merging" is a checklist with an answered/total counter; ticks are not saved. States:
  loading ("Assessing change risk…"), unavailable ("Change risk unavailable: {error}").
- **IssueCard:** file chip, "Line N" (plus " (removed)"), comment, SeverityBadge.
- **FixCard:** file chip, line chip, layer badge, "Copy Fix", the original issue, a
  "Current Code" block (danger) and a "Suggested Fix" block (success), side by side from
  `lg`, and "Why this is better:".
- **SeverityFilters:** All / Critical / Warning / Suggestion with counts, on issue tabs.
- **DiffViewer:** fetched on demand through `loadDiff`. `<pre>` with
  `max-h-[70vh] overflow-auto text-xs leading-5`. Line colours: headers
  `--text-primary`, `@@` `--accent`, `+` `--success` on a 6% green tint, `-` `--danger`
  on a 6% red tint, context `--text-secondary`. No line numbers or syntax highlighting.
  States: "Loading diff…", "Failed to load diff: {reason}", "Empty diff."

### 7.4 Lists and repository components

- **ReviewFeedTable:** below `md` a stacked list (repo, icon plus `#pr` or short SHA and
  title, status and relative time, score on the right). From `md` a table: Repository
  (optional) | PR title or Commit | Author | Status | Score | Time. On mobile the whole
  item links to the review; from `md` the title cell is the link.
- **RepoCard:** `.card`, min height 180px. GitHub link with external icon, "private"
  badge, two-line description or "No description.", language dot, stars, "Updated
  {relative}". Connected: "Connected" badge, ModeBadge, settings gear, and the whole card
  links to the repository's reviews. Not connected: primary "Connect".
- **ModeSelector:** three option cards (`pr_only` default, `commit_only`, `both`) with a
  title and a one-line subtitle each.
- **BranchPicker:** loads branches, pre-selects the default branch (or `main`/`master`),
  shows search above 5 branches, "X of N selected", Select all · Clear, a scrollable
  toggle list (`max-h-56`) and a "default" badge. States: loading, "No branches found on
  this repo.", `No branches match "q"`.
- **AuthorAvatar:** `https://github.com/{login}.png?size=40`, 24px, lazy.

---

## 8. Screens

Each screen lists its sections top to bottom and every state it can be in. Routes and
transitions are in [Appflow.md](Appflow.md).

### Login `/login`
Full-screen `login-bg` with a dot pattern. Card (`max-w-sm`): logo and "PRism";
"AI-powered code review for everyone"; optional `status` and `error` boxes from the query
string; "Explore Demo (no login required)"; "or" divider; **Continue with GitHub**
(full navigation to `/login/github`, 44px tall); "Free and open source · No password
needed"; the collapsible "Wondering about permissions?" disclosure explaining the `repo`
and `read:user` scopes, linking to `/security`.

### Waking `/waking`
Centred spinner, H1 "Starting the server", and a `role="status"` line explaining that
the server sleeps when idle and the page continues on its own. After 90s: "This is taking
longer than usual." and a "Try again" link. No shell, `noindex`.

### Dashboard `/dashboard`
Header: eyebrow "Overview", H1 "Dashboard", primary "Connect Repository" (label "Connect"
on mobile). Then:
1. Four stat cards: Repos, PRs Reviewed, Commits Reviewed, Average Score ("—" when null).
2. "Score Timeline" line chart (Chart.js, y 0-100, step 25), only when there is data.
3. Feed card: "Pull Requests" / "Commits" tabs with counts and "Showing last N"; starts on
   Commits when there are commits and no PRs. Body is ReviewFeedTable or the empty state
   ("No pull request reviews yet" / "No commit reviews yet", a cross-mode nudge, and
   "Connect Repository").

Refreshes every 8s while any row is pending or analyzing.

### Repositories `/repositories`
Header: eyebrow "Connect", H1 "Repositories", search ("Filter repositories…", filters on
name, description and language, client-side). FlashBanner, then the RepoCard grid.
Errors from GitHub get a specific hint (401 sign in again, 403/429 rate limited, 0 no
response, other status code). "Connect" opens the mode modal: ModeSelector, BranchPicker
for commit modes, Cancel / Connect ("Connecting…").

### Repository reviews `/repositories/[id]`
Header: eyebrow "Repository", H1 full name, ModeBadge, "Open on GitHub" and "Repository
settings" icon buttons (labelled, 44px tall but about 36px wide; see D11), Back. Tabs are links with `aria-current="page"`
and totals (`?kind=prs|commits`). ReviewFeedTable without the repository column, 25 per
page. Pager "Page X of Y" with Previous / Next. Empty: "Nothing on this page" past the
end, otherwise a per-tab empty state. Refreshes every 8s while anything is in flight.

### Repository settings `/repositories/[id]/settings`
`max-w-3xl`. One card: "Review mode", helper ("Changing this will update the GitHub
webhook events PRism subscribes to."), ModeSelector, branches when a commit mode is
chosen, inline "Saved" for 2s, "Save changes".

### PR review `/reviews/[id]`
Header: Back, Export PDF (secondary), Re-analyze (primary, "Analyzing…" while the action
runs).
Then, in order:
1. Re-analyze error banner, when the last attempt failed to start.
2. Summary card: repo › "PR #N", title, author, `head → base`, status, languages,
   ScoreCircle.
3. VerdictPanel. 4. RiskPanel. 5. "AI Summary" with model badge.
6. In-progress card, only while in flight and with no review row yet ("typically takes
   15-30 seconds", auto-refreshes every 5s).
7. Failed card with a pointer to Re-analyze.
8. Tabs, when a review exists and the verdict is not `not_reviewed`: Security,
   Performance, Code Quality, Auto-Fixes (counts) and View Diff, with the severity filter
   on issue tabs. Footer: "Generated by {model}" and "View on GitHub".

### Commit review `/commits/[id]`
Same structure as the PR page, with these differences: header has Back and "View Commit
on GitHub"; the title is the commit message's first line ("(no commit message)" if
empty); Re-analyze appears only inside the failed card; the in-progress card shows
whenever the status is pending or analyzing (the PR page shows it only before a review
row exists); tabs need `status === 'completed'` and have no Diff tab, severity filter or
footer.

### Design Studio `/design`
Header: H1 "Design Studio". Two columns from `lg`:
- **Form:** "What are you building?", example chips, product textarea (max 4000;
  Generate enables at 20 trimmed characters), scale cards (Prototype < 1k users · Startup ~10k daily · Growth
  ~1M daily · Enterprise 10M+, multi-region; `aria-pressed`), up to four ordered
  priorities from seven, optional constraints (max 1500), "Generate design". While it
  runs the hint steps through six progress messages every 3.5s, then stays on the last,
  in an `aria-live` region.
- **Aside "Your designs":** title, "{scale} · {age}" and "baseline" when relevant, a
  44×44 delete button. Empty: "Nothing yet. Designs are kept for 30 days; export the
  ones you want to keep."

### Blueprint `/design/[id]`
Header: Back "Design Studio", Copy Markdown (with "Copied"/"Copy failed" in a live
region), Download .md, New design. Hero card with scale, architecture style, date, title,
summary, model or "PRism baseline" badge, any fallback notice, and the collapsible brief.
Sections in order, each hidden when empty: Components, Main request flow, Failure modes
(read first; impact / mitigation / detection), Data stores and Reliability patterns,
SLOs, Scaling plan, Trade-offs, Security / Observability / Risks, First milestones, and
Production readiness (always shown, "{n}/{N} ready", ticks kept in
`localStorage['prism:design-checklist:{id}']`).

### Settings `/settings`
`max-w-3xl`: FlashBanner; read-only profile card; "Notifications" (Slack webhook URL,
Test, Save); "API Tokens" (generate with a name up to 64 characters, the plaintext shown
once with "Copy your token now — it will never be shown again.", list with Created / Last
used, Revoke behind a confirm).

### Profile `/profile`
Name and email form with field errors and "Saved"; a "Delete account" card that points
GitHub users to Security → My Data (see D30).

### Security & Privacy `/security`
Public. Signed in it uses the app shell, otherwise the guest shell. Sections: hero, what
we access and never access, how the token is protected, browser storage policy, the
code's journey, audit our code, you're in control, permissions requested, why we need
them, compliance, see everything that happened, report an issue.

### My Data `/security/my-data`
`max-w-4xl`: profile; masked GitHub token (first 4 and last 4 characters with asterisks
between, its length and "Encrypted at rest (AES-256)", or "(none)"); five activity counts (repos, reviews, audit events, saved designs, saved
risk assessments; "—" with `aria-label="Unavailable"` when a count could not be read);
saved designs; connected repositories; **Danger Zone**: arm, type `DELETE`, "Permanently
Delete Everything".

### Activity log `/security/audit-log`
`max-w-3xl` vertical timeline. Each entry: coloured icon, label, relative time (absolute
on hover), description, mono action key, a collapsible metadata block. Empty: "No
activity yet". Labels: `login` → Sign in, `repo_connected` → Repository connected,
`repo_disconnected` → Repository disconnected (never written), `settings_updated` →
Settings updated, `review_completed` → Review completed, `review_reanalyzed` → Review
re-analyzed, `data_exported` → Data exported, `design_created` → Design generated,
`account_deleted` → Account deleted. Any other key, including `api_token_created` and
`api_token_revoked`, shows raw.

### How to Use `/help/how-to-use`
`max-w-4xl`: welcome hero, privacy teaser, PR vs commit quick start (segmented control,
three steps each), feature accordion, working without PRs, Slack, tips, FAQ, closing CTA.

### Demo `/demo`, `/demo/review/[id]`
Public sample data inside the demo shell. The review page has two tabs (Issues,
Auto-Fixes) and no verdict, risk or diff.

### Error and 404
Error boundary: eyebrow "Error", "Something went wrong", "Trying again often works.", the
digest in mono, "Try again". 404: "Not found", "This page does not exist, or it belongs to
another account.", "Back to dashboard". The 404 copy is deliberate: a forbidden id and a
missing id look the same.

---

## 9. Accessibility requirements

Beyond rules U2-U8:

- Every icon-only control has an `aria-label`. Every input has a programmatic label.
- Tabs that switch content in place use `role="tablist"`/`tab`/`aria-selected`; tabs
  that navigate use links with `aria-current="page"` (as the repository reviews page does).
- Toggle groups expose state (`aria-pressed`, or `role="radio"` with `aria-checked`).
- Modals, drawers and menus are `role="dialog"` with `aria-modal`, trap focus, close on
  Escape, and return focus to the trigger. Hidden drawers are `inert`, not just
  `aria-hidden`.
- Async results (copy, save, generate, risk loading) are announced through a live region.
- One `<h1>` per page.
- Charts carry a text alternative (the stat cards cover the headline numbers).

---

## 10. Motion

Motion in use: 150ms button transitions; 200ms drawer slide, fade-in and toast; 300ms
height transitions on disclosures and accordions; 600ms score ring scale-in; 800ms score
dash. Looping motion: the `pulse-dot` ring (analyzing status and the help pill),
`animate-pulse` on loading text (risk panel, Design Studio) and loader spins (including
the wake page). All of it is reduced to 0.01ms under `prefers-reduced-motion: reduce` by
the global rule in `globals.css` (120-127). New looping motion is only for something that
is actually in progress.

---

## 11. Known deviations

Found in a code audit on 2026-10-26. Paths are under `prism-web/src/`. Each is a bug
against the rules above, not a design choice.

**Rendering bugs**

| ID | Problem | Where |
|---|---|---|
| D1 | `hover:bg-hover` / `active:bg-hover` generate no CSS: there is no Tailwind colour named `hover`, and `.bg-hover` is unlayered so it takes no variants. Hover states silently do nothing. | `AuthenticatedLayout.tsx:372,399,412`, `ReviewFeedTable.tsx:30,100`, `RepoCard.tsx:140`, `RepositoriesView.tsx:61`, `BranchPicker.tsx:193`, `FlashBanner.tsx:68`, `HowToUseView.tsx:119`, `PermissionsDisclosure.tsx:34`, `app/demo/page.tsx:236` |
| D2 | `@tailwindcss/forms` styles leak: checkboxes are white with a grey border even in dark mode, fill solid `#2563eb` when checked, and take a `#2563eb` focus ring; the BranchPicker search gets a grey border and blue ring. | `RiskPanel.tsx:236-243`, `BlueprintView.tsx:486-491`, `BranchPicker.tsx:139-146` |
| D3 | `divide-y` lists with no border colour fall back to `#e5e7eb` in both themes. | `DesignStudioView.tsx:380`, `MyDataView.tsx:250`, `SecurityIndexView.tsx:427`, `app/demo/page.tsx:150,185` |

**Contrast (U3, U4)**

| ID | Problem | Where |
|---|---|---|
| D4 | White text on a `--danger` fill: 2.77:1 in dark mode. Needs a `--danger-solid` fill token. | `ProfileView.tsx:266-272`, `MyDataView.tsx:370-377` |
| D5 | Demo "High" severity `#fb923c` text on its own 12% tint in light mode: 1.85-2.06:1. | `DemoReviewDetailView.tsx:40` |
| D6 | Chart ticks `#64748b` on the dark card: 3.63:1; tooltip and grid colours do not follow the theme. | `DashboardView.tsx:92-127` |
| D7 | White check on `--accent` in BranchPicker (an icon, but against U4). | `BranchPicker.tsx:196-202` |

**Tokens (U11)**

| ID | Problem | Where |
|---|---|---|
| D8 | Hard-coded colours: chart colours, logo gradient, the green Security dot, the GitHub button, the demo shell, solid red buttons, `.brand-text` (hex); `.input:focus` glow and `.login-bg` (raw `rgba`). GitHub language colours (`RepoCard`, `DemoLayout` `LANG_COLORS`) are a deliberate exception. | `AuthenticatedLayout.tsx:151,327`, `login/page.tsx:46,128-129`, `SecurityIndexView.tsx:141`, `DemoLayout.tsx:158`, `ProfileView.tsx:270`, `MyDataView.tsx:374`, `globals.css:206,300,316-322` |
| D9 | About 100 raw `rgba()` palette literals (`rgba(99,102,241,…)`, `rgba(34,197,94,…)` …) for tints. They ignore the light-theme status values. Use `color-mix` on the token. | ModeSelector, ModeBadge, SeverityFilters, LanguageBadges, FlashBanner, CodeBlock, login boxes |
| D10 | Tailwind's token colour extensions and the `.text-*`/`.bg-*` helper classes are defined but unused; the config comment claiming otherwise is stale. | `tailwind.config.ts:5-10`, `globals.css:358-366` |

**Touch targets (U6)**

| ID | Problem | Where |
|---|---|---|
| D11 | Icon-only buttons under 44px: RepoCard gear 28px, modal close 36px, hamburger and drawer close 40px, FlashBanner dismiss about 24px, repository page header icons about 36px wide. | `RepoCard.tsx:140`, `RepositoriesView.tsx:61`, `AuthenticatedLayout.tsx:372,399,412`, `FlashBanner.tsx:68`, `app/repositories/[repository]/page.tsx:64-81` |
| D12 | Text buttons around 36px on touch layouts: Connect, Copy Fix, Revoke, pager buttons, the How to Use toggle. | `RepoCard.tsx`, `parts.tsx`, `SettingsView.tsx`, `RepositoryReviewsView.tsx:118,124` |

**Accessibility (§9)**

| ID | Problem | Where |
|---|---|---|
| D13 | The connect modal, mobile drawer and user menu have no dialog role, focus trap or Escape; the closed drawer's links stay focusable. | `RepositoriesView.tsx`, `AuthenticatedLayout.tsx:361-366` |
| D14 | Selection state hidden from assistive tech: ModeSelector, BranchPicker rows, dashboard and review tabs, sidebar links (no `aria-current`). | `ModeSelector.tsx`, `BranchPicker.tsx`, `DashboardView.tsx`, `ReviewShowView.tsx`, `AuthenticatedLayout.tsx` |
| D15 | "Copied to clipboard" toast is not a live region. | `parts.tsx:455-470` |
| D16 | Collapsed disclosure and accordion content stays in the tab order. | `PermissionsDisclosure.tsx:56-99`, `HowToUseView.tsx` |
| D17 | Duplicate or mismatched names: the dashboard button reads "Connect Repository Connect" on mobile; ThemeToggle's label omits its visible text. | `app/dashboard/page.tsx:44-45`, `ThemeToggle.tsx:55` |
| D18 | Unlabelled inputs: repository search, API token name; `<label>` without `htmlFor`. | `RepositoriesView.tsx:78`, `RepositorySettingsView.tsx:104`, `SettingsView.tsx:171-178,323`, `MyDataView.tsx:337` |
| D19 | Two `<h1>` on How to Use. | `HowToUseView.tsx:209,217` |

**Copy and behaviour**

| ID | Problem | Where |
|---|---|---|
| D20 | Security page shows a PHP `$casts` sample, a `.jsx` path, "CSRF tokens rotated on every request" and an "IP Whitelist" card; IP allow-listing was removed. | `SecurityIndexView.tsx:279-285,305,319,513` |
| D21 | "The only key we write: `prism-theme`" is false: the blueprint checklist writes `prism:design-checklist:{id}`. | `SecurityIndexView.tsx:303,315-321`, `ThemeToggle.tsx:13`, `BlueprintView.tsx:96` |
| D22 | How to Use says "70+ (green)" but exactly 70 is amber (green is > 70). | `HowToUseView.tsx:430` vs `pills.tsx:38` |
| D23 | Failed-review copy blames malformed AI output; unparseable output completes instead of failing, so failures come from elsewhere (GitHub, timeouts, token decryption). | `ReviewShowView.tsx:316-318`, `CommitShowView.tsx:248-249` |
| D24 | The PR page shows no progress card while an old review row survives (after a `synchronize` push or an `/api/v1` re-analyze); PR tabs ignore status while commit tabs require `completed`; severity counts are cross-layer but the filter is per tab. | `ReviewShowView.tsx:71-87,287` |
| D25 | The connect modal keeps the previous repository's mode and branches, closes on error, and never shows field errors. | `RepositoriesView.tsx:24-25,173-175,248` |
| D26 | Actions called from handlers have no `.catch`. Inside `startTransition` a rejection reaches the error boundary, so the whole page becomes "Something went wrong" instead of an inline error. Logout ignores errors. | `RepositoriesView.tsx:165`, `RepositorySettingsView.tsx:38`, `ProfileView.tsx:46,67`, `SettingsView.tsx:47,68,214,237`, `MyDataView.tsx:91`, `AuthenticatedLayout.tsx:282-287` |
| D27 | Demo has no navigation or theme toggle below `lg`. | `DemoLayout.tsx` |
| D28 | `?error=` is rendered verbatim from the API's exception text, and sign-in drops the page you were on. | `app/login/page.tsx`, API `auth.controller.ts:127-129` |
| D29 | "Reviews" nav item points at `/dashboard`; Design Studio H1 is `text-lg` while other pages use the H1 scale; design delete has no confirmation. | `AuthenticatedLayout.tsx`, `DesignStudioView.tsx:190,393-402` |
| D30 | Profile's delete-account form needs a password no GitHub user has (dead UI), and Settings calls the profile "Read-only" while Profile edits it. | `profile/actions.ts:33-37`, `SettingsView.tsx:271` |
| D31 | A commit review that is pending, analyzing or failed shows the verdict panel reading "Nothing found": the API computes a verdict from the empty findings before anything ran. This is the overclaiming the verdict exists to prevent. | `CommitShowView.tsx:183`, API `reviews-web.service.ts:164` |

[plan.md](plan.md) schedules these.

---

## 12. Verification checklist

Before committing a UI change:

1. `npm run typecheck`, `npm run lint` and `npm test` pass in `prism-web` (Node ≥ 22.12).
2. The page is checked in a real browser in **both themes**.
3. At **390px** there is no horizontal scroll, and labels hidden on mobile still have
   accessible names.
4. Every new text colour is a token, and any new token pair has a measured ratio ≥ 4.5:1
   on card and hover surfaces (update §3.1).
5. Keyboard only: every control is reachable, the focus ring is visible, Escape closes
   overlays.
6. Every server action call has a visible failure state, including a rejected promise.
7. The console has no errors, including CSP violations. A new inline script takes the
   nonce from `x-nonce`; a new image, font or API origin is added to the CSP in
   `src/middleware.ts` on purpose.
