import {
  FileSearch,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Layers,
  LayoutDashboard,
  Settings,
  Shield,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import BrandLogo from "@/components/ui/BrandLogo";
import ThemeToggle from "@/components/ui/ThemeToggle";

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
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  PHP: "#4F5D95",
  Python: "#3572A5",
  Go: "#00ADD8",
  Rust: "#dea584",
  Ruby: "#701516",
  Java: "#b07219",
  "C++": "#f34b7d",
  HTML: "#e34c26",
  Vue: "#41b883",
};

export function DemoLanguageDot({
  language,
  size = 10,
}: {
  language: string;
  size?: number;
}) {
  return (
    <span
      className="inline-block rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: LANG_COLORS[language] ?? "#94a3b8",
      }}
    />
  );
}

const MODE_BADGE: Record<
  string,
  {
    icon: ComponentType<{ className?: string }>;
    label: string;
    tone: string;
    color: string;
  }
> = {
  pr_only: {
    icon: GitPullRequest,
    label: "Pull Requests",
    tone: "var(--accent-bg)",
    color: "var(--accent)",
  },
  commit_only: {
    icon: GitCommit,
    label: "Commits",
    tone: "rgba(59,130,246,0.10)",
    color: "var(--info)",
  },
  both: {
    icon: Layers,
    label: "Both",
    tone: "rgba(34,197,94,0.10)",
    color: "var(--success)",
  },
};

export function DemoModeBadge({ mode }: { mode: string }) {
  const badge = MODE_BADGE[mode] ?? MODE_BADGE.pr_only!;
  const Icon = badge.icon;

  return (
    <span
      className="badge"
      style={{
        backgroundColor: badge.tone,
        color: badge.color,
        borderColor: badge.color,
      }}
    >
      <Icon className="h-3 w-3" />
      {badge.label}
    </span>
  );
}

export function DemoScorePill({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) {
    return <span style={{ color: "var(--text-muted)" }}>—</span>;
  }

  const color =
    score >= 85
      ? "var(--success)"
      : score >= 70
        ? "var(--warning)"
        : "var(--danger)";

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
  { key: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { key: "repositories", icon: GitBranch, label: "Repositories" },
  { key: "reviews", icon: FileSearch, label: "Reviews" },
  { key: "settings", icon: Settings, label: "Settings" },
  {
    key: "security",
    icon: Shield,
    label: "Security & Privacy",
    href: "/security",
  },
];

export default function DemoLayout({
  active = "dashboard",
  children,
}: {
  active?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
    >
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-border-base bg-bg-primary px-4 sm:px-8">
        <BrandLogo />
        <div className="flex items-center gap-3">
          <span className="text-sm text-fg-secondary">
            <span className="font-semibold text-fg-primary">Demo</span>
            <span className="hidden sm:inline"> · sample data</span>
          </span>
          <Link href="/login" className="btn btn-primary min-h-[44px] text-sm">
            Sign in<span className="sr-only sm:not-sr-only"> with GitHub</span>
          </Link>
        </div>
      </header>

      <aside className="fixed bottom-0 left-0 top-14 z-30 hidden w-60 flex-col overflow-y-auto border-r border-border-hover bg-bg-tint lg:flex 2xl:w-[280px]">
        <div className="h-3" />

        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.key;
            const href = item.href ?? "/demo";

            return (
              <Link
                key={item.key}
                href={href}
                className={`nav-item ${isActive ? "nav-item-active" : ""}`}
                title={
                  item.href
                    ? undefined
                    : "Demo Mode — sign in to use this for real"
                }
              >
                <Icon
                  className="h-4 w-4 shrink-0"
                  strokeWidth={isActive ? 2.4 : 2}
                />
                <span className="flex-1">{item.label}</span>
                {!item.href && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-xs uppercase tracking-wide"
                    style={{
                      backgroundColor: "var(--bg-hover)",
                      color: "var(--text-muted)",
                    }}
                  >
                    demo
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border-base p-3">
          <div>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col lg:ml-60 2xl:ml-[280px]">
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
        <footer
          className="mt-auto border-t px-6 py-4 text-center text-sm"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          Developed by{" "}
          <a
            href="https://www.mjubayer.dev/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium transition-colors hover:opacity-80"
            style={{ color: "var(--accent)" }}
          >
            Muhammad Jubayer
          </a>
        </footer>
      </div>
    </div>
  );
}
