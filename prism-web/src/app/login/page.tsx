import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Gauge,
  GitPullRequest,
  KeyRound,
  PencilRuler,
  Radar,
  ScanSearch,
  type LucideIcon,
} from 'lucide-react';
import PermissionsDisclosure from '@/components/auth/PermissionsDisclosure';

export const metadata: Metadata = { title: 'Sign in to PRism' };

function GithubIcon({ className }: { className?: string }) {
  // lucide-react dropped brand icons, so the GitHub mark is inlined.
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.66.5 12.04c0 5.1 3.29 9.42 7.86 10.96.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.87-1.55-3.87-1.55-.52-1.34-1.27-1.7-1.27-1.7-1.04-.72.08-.7.08-.7 1.15.08 1.75 1.19 1.75 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.29-5.24-5.74 0-1.27.45-2.31 1.19-3.13-.12-.3-.52-1.49.11-3.11 0 0 .97-.31 3.18 1.2.92-.26 1.91-.39 2.9-.39s1.98.13 2.9.39c2.21-1.51 3.18-1.2 3.18-1.2.63 1.62.23 2.81.11 3.11.74.82 1.19 1.86 1.19 3.13 0 4.47-2.69 5.45-5.25 5.73.41.36.78 1.07.78 2.16 0 1.56-.01 2.82-.01 3.2 0 .31.21.68.8.56 4.56-1.54 7.85-5.86 7.85-10.96C23.5 5.66 18.35.5 12 .5z" />
    </svg>
  );
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 rounded-md">
      <span className="grid h-10 w-10 place-items-center rounded-md bg-accent-solid text-white">
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 7l9-4 9 4-9 4-9-4z" />
          <path d="M3 17l9 4 9-4" />
          <path d="M3 12l9 4 9-4" />
        </svg>
      </span>
      <span className="brand-text text-3xl">PRism</span>
    </Link>
  );
}

// Every line here describes something that ships; see README.md and the docs
// it links. Do not add a claim without checking it there.
const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: GitPullRequest,
    title: 'Reviews every pull request and push',
    body: 'On the branches you choose. Large changes are reviewed in batches so every reviewable file is read, and the result is posted as a comment on GitHub.',
  },
  {
    icon: ScanSearch,
    title: 'Findings you can check',
    body: 'Each finding is matched to a line that really changed, and a finding that cannot be matched is dropped instead of shown at a guessed line.',
  },
  {
    icon: Gauge,
    title: 'A verdict, then a score',
    body: 'Blocking, worth a look, nothing found, or not reviewed when no model answered. A review nobody produced is never shown as an all-clear.',
  },
  {
    icon: Radar,
    title: 'Risk Radar',
    body: 'A 0-100 change-risk score from where the change lands (auth, migrations, secrets, tests, CI), with a before-merging checklist. It needs no AI.',
  },
  {
    icon: PencilRuler,
    title: 'Design Studio',
    body: 'Describe what you are building and get a system design sized to the load, exportable as Markdown.',
  },
  {
    icon: KeyRound,
    title: 'Bring your own AI key',
    body: 'Optional. Add your own provider key in Settings; it is stored encrypted and only its last 4 characters are ever shown.',
  },
];

/**
 * Two columns from `lg` up: what PRism does on the left, sign-in on the right.
 * Below `lg` the sign-in comes first (`order-1`) so it is visible without
 * scrolling at 390px. The OAuth failure message arrives as `?error=` from the
 * API callback redirect.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const { error, status } = await searchParams;

  return (
    <div className="min-h-screen bg-bg-primary lg:grid lg:grid-cols-2">
      <main
        id="main"
        className="login-bg relative order-1 flex min-h-screen flex-col items-center justify-center overflow-hidden p-4 sm:p-8 lg:order-2"
      >
        <div aria-hidden className="dot-pattern pointer-events-none absolute inset-0 opacity-50" />

        <div className="relative z-10 w-full max-w-sm rounded-lg border border-border-base bg-bg-card p-6 sm:p-8">
          <div className="flex flex-col items-center text-center">
            <div className="mb-4">
              <Logo />
            </div>
            <h1 className="text-lg font-semibold text-fg-primary">Sign in to PRism</h1>
            <p className="mt-1 text-sm text-fg-secondary">
              AI code review for your GitHub pull requests and commits
            </p>
          </div>

          {status && (
            <div
              role="status"
              className="mt-6 rounded-md border px-3 py-2 text-center text-sm"
              style={{
                backgroundColor: 'rgba(34,197,94,0.10)',
                color: 'var(--success)',
                borderColor: 'rgba(34,197,94,0.30)',
              }}
            >
              {status}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mt-6 rounded-md border px-3 py-2 text-sm"
              style={{
                backgroundColor: 'rgba(239,68,68,0.10)',
                color: 'var(--danger)',
                borderColor: 'rgba(239,68,68,0.30)',
              }}
            >
              {error}
            </div>
          )}

          {/* A plain anchor, not next/link: this leaves the app for GitHub and
              must be a full navigation. /auth/github is proxied to prism-api by
              the rewrite in next.config.mjs. */}
          <a
            href="/auth/github"
            className="btn btn-primary mt-8 min-h-[44px] w-full text-sm font-semibold transition active:scale-95"
          >
            <GithubIcon className="h-5 w-5" />
            Continue with GitHub
          </a>

          <p className="mt-3 text-center text-xs text-fg-muted">
            Free and open source · No password needed
          </p>

          <div className="my-4 flex items-center gap-3 text-xs text-fg-muted">
            <span className="h-px flex-1 bg-[var(--border)]" />
            <span>or</span>
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>

          {/* Evaluation without authorising anything. */}
          <Link
            href="/demo"
            className="btn btn-secondary min-h-[44px] w-full text-sm font-medium"
          >
            Explore the demo (no login required)
          </Link>

          <PermissionsDisclosure />
        </div>

        <footer className="relative z-10 mt-8 text-center text-sm text-fg-muted">
          Developed by{' '}
          <a
            href="https://www.mjubayer.dev/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent transition-colors hover:opacity-80"
          >
            Muhammad Jubayer
          </a>
        </footer>
      </main>

      <section
        aria-labelledby="what-prism-does"
        className="order-2 border-t border-border-base bg-bg-secondary px-4 py-10 sm:px-8 lg:order-1 lg:flex lg:min-h-screen lg:flex-col lg:justify-center lg:border-r lg:border-t-0 lg:px-12 xl:px-16"
      >
        <div className="mx-auto w-full max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">
            An AI code reviewer for GitHub
          </p>
          <h2
            id="what-prism-does"
            className="mt-3 text-3xl font-bold tracking-tight text-fg-primary xl:text-4xl"
          >
            Reviews that show their work.
          </h2>
          <p className="mt-3 text-base text-fg-secondary">
            Every finding points at a line that really changed, and every review opens with a
            verdict you can check rather than a score you have to trust.
          </p>

          <ul className="mt-8 grid grid-cols-1 gap-5">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border-base bg-[var(--accent-bg)] text-accent">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-fg-primary">{title}</h3>
                  <p className="mt-0.5 text-sm text-fg-secondary">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
