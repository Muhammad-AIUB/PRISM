'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ChevronUp,
  FileSearch,
  GitBranch,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Shield,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import type { SessionUser } from '@/lib/types';
import ThemeToggle from '@/components/ui/ThemeToggle';

/**
 * Port of the Inertia AuthenticatedLayout.
 *
 * Two things had to change and nothing else did: navigation goes through
 * next/link instead of Inertia's, and the active-item check reads
 * usePathname() rather than Ziggy's route().current(), which does not exist
 * outside Laravel.
 */
interface NavEntry {
  href: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  isActive: boolean;
  indicator?: string;
}

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  onNavigate,
  indicator,
}: {
  href: string;
  icon: NavEntry['icon'];
  label: string;
  active: boolean;
  onNavigate?: () => void;
  indicator?: string;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`nav-item ${active ? 'nav-item-active' : ''}`}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.4 : 2} />
      <span className="flex-1">{label}</span>
      {indicator ? (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{
            backgroundColor: indicator,
            boxShadow: `0 0 0 3px color-mix(in srgb, ${indicator} 25%, transparent)`,
          }}
        />
      ) : (
        active && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: 'var(--accent)' }}
          />
        )
      )}
    </Link>
  );
}

function Avatar({ user, size = 'sm' }: { user: SessionUser | null; size?: 'sm' | 'md' }) {
  const px = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';

  if (user?.github_avatar) {
    return (
      // Plain <img>: these are remote GitHub avatars at a fixed tiny size, so
      // next/image's optimiser would add a round trip for no benefit.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.github_avatar}
        alt={user.name}
        className={`${px} rounded-full ring-1`}
        style={{ ['--tw-ring-color' as string]: 'var(--border)' }}
      />
    );
  }

  return (
    <div
      className={`${px} grid place-items-center rounded-full text-xs font-semibold text-white`}
      style={{ backgroundColor: 'var(--accent)' }}
    >
      {(user?.name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

function HelpLink({ active, onNavigate }: { active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href="/help/how-to-use"
      onClick={onNavigate}
      className="group flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition active:scale-[0.98]"
      style={{
        backgroundColor: active ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.08)',
        color: 'var(--accent)',
        border: '1px solid rgba(99,102,241,0.30)',
      }}
    >
      <HelpCircle className="h-4 w-4 shrink-0" strokeWidth={2.2} />
      <span>Need Help? How to Use</span>
      <span className="pulse-dot ml-auto" aria-hidden />
    </Link>
  );
}

function SidebarContents({
  nav,
  user,
  menuOpen,
  setMenuOpen,
  onNavigate,
  pathname,
  onLogout,
}: {
  nav: NavEntry[];
  user: SessionUser | null;
  menuOpen: boolean;
  setMenuOpen: (fn: (open: boolean) => boolean) => void;
  onNavigate?: () => void;
  pathname: string;
  onLogout: () => void;
}) {
  return (
    <>
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
        {nav.map((item) => (
          <NavItem
            key={item.label}
            href={item.href}
            icon={item.icon}
            label={item.label}
            active={item.isActive}
            indicator={item.indicator}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="px-3 pb-3">
        <HelpLink active={pathname.startsWith('/help')} onNavigate={onNavigate} />
      </div>

      <div className="border-t p-3" style={{ borderColor: 'var(--border)' }}>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="menu-item w-full rounded-md px-2"
            style={{ gap: '0.75rem' }}
          >
            <Avatar user={user} />
            <div className="min-w-0 flex-1 text-left">
              <p
                className="truncate text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                {user?.github_username || user?.name || 'User'}
              </p>
              <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                {user?.email}
              </p>
            </div>
            <ChevronUp
              className="h-4 w-4 transition-transform"
              style={{
                color: 'var(--text-muted)',
                transform: menuOpen ? 'rotate(0deg)' : 'rotate(180deg)',
              }}
            />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(() => false)} />
              <div
                className="anim-fade-in absolute bottom-full left-0 right-0 z-40 mb-2 overflow-hidden rounded-md"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-card), 0 10px 24px -8px rgba(0, 0, 0, 0.25)',
                }}
              >
                <Link href="/profile" className="menu-item" onClick={onNavigate}>
                  <UserIcon className="h-4 w-4" /> Profile
                </Link>
                <ThemeToggle />
                <button type="button" onClick={onLogout} className="menu-item">
                  <LogOut className="h-4 w-4" /> Log out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default function AuthenticatedLayout({
  user,
  header,
  children,
}: {
  user: SessionUser | null;
  header?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer on viewport-up so it does not stay open after a rotation.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) {
        setDrawerOpen(false);
      }
    };

    window.addEventListener('resize', onResize);

    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Lock background scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';

    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const logout = async () => {
    // Goes through the rewrite to prism-api, which clears the session cookie.
    await fetch('/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const nav: NavEntry[] = [
    {
      href: '/dashboard',
      icon: LayoutDashboard,
      label: 'Dashboard',
      isActive: pathname === '/dashboard',
    },
    {
      href: '/repositories',
      icon: GitBranch,
      label: 'Repositories',
      isActive: pathname.startsWith('/repositories'),
    },
    // Points at the dashboard, which lists recent PRs, until a dedicated
    // /reviews index exists — same as the Laravel sidebar.
    {
      href: '/dashboard',
      icon: FileSearch,
      label: 'Reviews',
      isActive: pathname.startsWith('/reviews') || pathname.startsWith('/commits'),
    },
    {
      href: '/settings',
      icon: Settings,
      label: 'Settings',
      isActive: pathname.startsWith('/settings'),
    },
    {
      href: '/security',
      icon: Shield,
      label: 'Security & Privacy',
      isActive: pathname.startsWith('/security'),
      indicator: '#22c55e',
    },
  ];

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      {/* Desktop sidebar (lg+). Fixed so it stays put while content scrolls;
          its own overflow-y means a long nav scrolls within the sidebar. */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col overflow-y-auto border-r lg:flex 2xl:w-[280px]"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
      >
        <SidebarContents
          nav={nav}
          user={user}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          pathname={pathname}
          onLogout={logout}
        />
      </aside>

      {drawerOpen && (
        <div
          role="presentation"
          onClick={closeDrawer}
          className="anim-fade-in fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 transform flex-col border-r transition-transform duration-200 ease-out lg:hidden ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
        aria-hidden={!drawerOpen}
      >
        <button
          type="button"
          onClick={closeDrawer}
          aria-label="Close menu"
          className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-md transition hover:bg-hover"
          style={{ color: 'var(--text-secondary)' }}
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarContents
          nav={nav}
          user={user}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          onNavigate={closeDrawer}
          pathname={pathname}
          onLogout={logout}
        />
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col lg:ml-60 2xl:ml-[280px]">
        {header ? (
          <header
            className="sticky top-0 z-20 border-b backdrop-blur"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--header-bg)' }}
          >
            <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-md transition hover:bg-hover active:scale-95 lg:hidden"
                style={{ color: 'var(--text-primary)' }}
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">{header}</div>
            </div>
          </header>
        ) : (
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="fixed left-4 top-4 z-30 grid h-10 w-10 place-items-center rounded-md backdrop-blur transition hover:bg-hover lg:hidden"
            style={{
              color: 'var(--text-primary)',
              backgroundColor: 'var(--header-bg)',
              border: '1px solid var(--border)',
            }}
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

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
