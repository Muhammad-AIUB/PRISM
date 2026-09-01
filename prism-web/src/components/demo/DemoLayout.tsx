import {
  FileSearch,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Layers,
  LayoutDashboard,
  Settings,
  Shield,
} from 'lucide-react';
import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import ThemeToggle from '@/components/ui/ThemeToggle';

/**
 * Port of Components/Demo.jsx.
 *
 * Visually matches AuthenticatedLayout but needs no signed-in user. Nav items
 * point back at /demo, since the real screens behind them require an account —
 * except Security, which is public.
 *
 * Note the scoring thresholds here (85 / 70) differ from the real app's
 * (70 / 40). That is the demo's own scale and is left alone.
 */
const LANG_COLORS: Record<string, string> = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  PHP: '#4F5D95',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#dea584',
  Ruby: '#701516',
  Java: '#b07219',
  'C++': '#f34b7d',
  HTML: '#e34c26',
  Vue: '#41b883',
};

export function DemoLanguageDot({ language, size = 10 }: { language: string; size?: number }) {
  return (
    <span
      className="inline-block rounded-full"
      style={{ width: size, height: size, backgroundColor: LANG_COLORS[language] ?? '#94a3b8' }}
    />
  );
}

const MODE_BADGE: Record<
  string,
  { icon: ComponentType<{ className?: string }>; label: string; tone: string; color: string }
> = {
  pr_only: {
    icon: GitPullRequest,
    label: 'Pull Requests',
    tone: 'rgba(99,102,241,0.10)',
    color: 'var(--accent)',
  },
  commit_only: {
    icon: GitCommit,
    label: 'Commits',
    tone: 'rgba(59,130,246,0.10)',
    color: 'var(--info)',
  },
  both: { icon: Layers, label: 'Both', tone: 'rgba(34,197,94,0.10)', color: 'var(--success)' },
};

export function DemoModeBadge({ mode }: { mode: string }) {
  const badge = MODE_BADGE[mode] ?? MODE_BADGE.pr_only!;
  const Icon = badge.icon;

  return (
    <span
      className="badge"
      style={{ backgroundColor: badge.tone, color: badge.color, borderColor: badge.color }}
    >
      <Icon className="h-3 w-3" />
      {badge.label}
    </span>
  );
}

export function DemoScorePill({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) {
    return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  }

  const color =
    score >= 85 ? 'var(--success)' : score >= 70 ? 'var(--warning)' : 'var(--danger)';

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 font-mono text-xs font-semibold"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
      }}
    >
      {score}
    </span>
  );
}

const NAV: {
  key: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  href?: string;
}[] = [
  { key: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { key: 'repositories', icon: GitBranch, label: 'Repositories' },
  { key: 'reviews', icon: FileSearch, label: 'Reviews' },
  { key: 'settings', icon: Settings, label: 'Settings' },
  { key: 'security', icon: Shield, label: 'Security & Privacy', href: '/security' },
];

export default function DemoLayout({
  active = 'dashboard',
  children,
}: {
  active?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      <div
        className="sticky top-0 z-40 px-4 py-2.5 text-center text-sm text-white"
        style={{ backgroundColor: 'var(--accent)' }}
      >
        <span className="font-semibold">🎭 Demo Mode</span>
        <span className="mx-1 opacity-90">—</span>
        <span className="opacity-90">you&apos;re viewing sample data.</span>
        <Link
          href="/login"
          className="ml-2 font-semibold underline underline-offset-2 hover:opacity-90"
        >
          Sign in with GitHub to use PRism for real →
        </Link>
      </div>

      <aside
        className="fixed left-0 z-30 hidden w-60 flex-col overflow-y-auto border-r lg:flex 2xl:w-[280px]"
        style={{
          // Sits below the demo banner rather than under it.
          top: '44px',
          bottom: '0',
          borderColor: 'var(--border)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div
            className="grid h-8 w-8 place-items-center rounded-md text-white"
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              boxShadow:
                '0 0 0 1px rgba(99,102,241,0.4), 0 4px 12px -2px rgba(99,102,241,0.45)',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 7l9-4 9 4-9 4-9-4z" />
              <path d="M3 17l9 4 9-4" />
              <path d="M3 12l9 4 9-4" />
            </svg>
          </div>
          <span className="brand-text text-lg">PRism</span>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.key;
            const href = item.href ?? '/demo';

            return (
              <Link
                key={item.key}
                href={href}
                className={`nav-item ${isActive ? 'nav-item-active' : ''}`}
                title={item.href ? undefined : 'Demo Mode — sign in to use this for real'}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={isActive ? 2.4 : 2} />
                <span className="flex-1">{item.label}</span>
                {!item.href && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                    style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}
                  >
                    demo
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-3" style={{ borderColor: 'var(--border)' }}>
          <Link
            href="/login"
            className="btn btn-primary min-h-[44px] w-full transition active:scale-95"
          >
            Sign in with GitHub
          </Link>
          <div className="mt-2">
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col lg:ml-60 2xl:ml-[280px]">
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        <footer
          className="mt-auto border-t px-6 py-4 text-center text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          Developed by{' '}
          <a
            href="https://www.mjubayer.dev/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium transition-colors hover:opacity-80"
            style={{ color: 'var(--accent)' }}
          >
            Muhammad Jubayer
          </a>
        </footer>
      </div>
    </div>
  );
}
