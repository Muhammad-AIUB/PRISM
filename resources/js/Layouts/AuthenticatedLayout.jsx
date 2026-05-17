import ThemeToggle from '@/Components/ThemeToggle';
import { Link, router, usePage } from '@inertiajs/react';
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
import { useEffect, useState } from 'react';

function NavItem({ href, icon: Icon, label, active, onNavigate, indicator }) {
    return (
        <Link
            href={href}
            onClick={onNavigate}
            className={`nav-item ${active ? 'nav-item-active' : ''}`}
        >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.4 : 2} />
            <span className="flex-1">{label}</span>
            {indicator
                ? <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                        backgroundColor: indicator,
                        boxShadow: `0 0 0 3px color-mix(in srgb, ${indicator} 25%, transparent)`,
                    }}
                />
                : active && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
                )}
        </Link>
    );
}

function Avatar({ user, size = 'sm' }) {
    const px = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
    if (user?.github_avatar) {
        return (
            <img
                src={user.github_avatar}
                alt={user.name}
                className={`${px} rounded-full ring-1`}
                style={{ '--tw-ring-color': 'var(--border)' }}
            />
        );
    }
    const initial = (user?.name || '?').charAt(0).toUpperCase();
    return (
        <div
            className={`${px} grid place-items-center rounded-full text-xs font-semibold text-white`}
            style={{ backgroundColor: 'var(--accent)' }}
        >
            {initial}
        </div>
    );
}

function HelpLink({ active, onNavigate }) {
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
            {/* Attention-getting pulse dot */}
            <span className="pulse-dot ml-auto" aria-hidden />
        </Link>
    );
}

function SidebarContents({ nav, user, menuOpen, setMenuOpen, onNavigate, current }) {
    return (
        <>
            {/* Logo */}
            <div className="flex items-center gap-2.5 px-5 py-5">
                <div
                    className="grid h-8 w-8 place-items-center rounded-md text-white"
                    style={{
                        background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                        boxShadow: '0 0 0 1px rgba(99,102,241,0.4), 0 4px 12px -2px rgba(99,102,241,0.45)',
                    }}
                >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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

            {/* Help link — accent-tinted, with attention pulse, sits above user card */}
            <div className="px-3 pb-3">
                <HelpLink
                    active={current?.startsWith?.('help')}
                    onNavigate={onNavigate}
                />
            </div>

            <div className="border-t p-3" style={{ borderColor: 'var(--border)' }}>
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setMenuOpen((s) => !s)}
                        className="menu-item w-full rounded-md px-2"
                        style={{ gap: '0.75rem' }}
                    >
                        <Avatar user={user} />
                        <div className="min-w-0 flex-1 text-left">
                            <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                {user?.github_username || user?.name || 'User'}
                            </p>
                            <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
                        </div>
                        <ChevronUp
                            className="h-4 w-4 transition-transform"
                            style={{ color: 'var(--text-muted)', transform: menuOpen ? 'rotate(0deg)' : 'rotate(180deg)' }}
                        />
                    </button>
                    {menuOpen && (
                        <>
                            <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                            <div
                                className="absolute bottom-full left-0 right-0 z-40 mb-2 overflow-hidden rounded-md anim-fade-in"
                                style={{
                                    backgroundColor: 'var(--bg-card)',
                                    border: '1px solid var(--border)',
                                    boxShadow: 'var(--shadow-card), 0 10px 24px -8px rgba(0, 0, 0, 0.25)',
                                }}
                            >
                                <Link href="/profile" className="menu-item">
                                    <UserIcon className="h-4 w-4" /> Profile
                                </Link>
                                <div className="menu-item" style={{ cursor: 'default' }}>
                                    <span className="flex flex-1 items-center gap-2">Theme</span>
                                    <ThemeToggle />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => router.post('/logout')}
                                    className="menu-item"
                                >
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

export default function AuthenticatedLayout({ header, children }) {
    const { auth } = usePage().props;
    const user = auth?.user;
    const current = typeof route === 'function' ? route().current() : '';
    const [menuOpen, setMenuOpen] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);

    // Close the drawer on viewport-up so it doesn't stay open after rotation.
    useEffect(() => {
        const onResize = () => { if (window.innerWidth >= 1024) setDrawerOpen(false); };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Lock background scroll while the mobile drawer is open.
    useEffect(() => {
        document.body.style.overflow = drawerOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [drawerOpen]);

    const nav = [
        { href: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard',         isActive: current === 'dashboard' },
        { href: '/repositories', icon: GitBranch,       label: 'Repositories',      isActive: current?.startsWith?.('repositories') },
        // Reviews shortcut points at the dashboard (which lists recent PRs) until
        // a dedicated /reviews index exists.
        { href: '/dashboard',    icon: FileSearch,      label: 'Reviews',           isActive: current?.startsWith?.('reviews') },
        { href: '/settings',     icon: Settings,        label: 'Settings',          isActive: current?.startsWith?.('settings') },
        { href: '/security',     icon: Shield,          label: 'Security & Privacy', isActive: current?.startsWith?.('security') || current?.startsWith?.('data'), indicator: '#22c55e' },
    ];

    const closeDrawer = () => setDrawerOpen(false);

    return (
        <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            {/* ── Desktop sidebar (lg+) ──────────────────────────────────
              Fixed position so it stays put while main content scrolls.
              Internal overflow-y-auto means long nav lists scroll WITHIN the
              sidebar rather than pushing the page. */}
            <aside
                className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-60 2xl:w-[280px] flex-col overflow-y-auto border-r"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
            >
                <SidebarContents nav={nav} user={user} menuOpen={menuOpen} setMenuOpen={setMenuOpen} current={current} />
            </aside>

            {/* ── Mobile drawer + backdrop (< lg) ────────────────────── */}
            {drawerOpen && (
                <div
                    role="presentation"
                    onClick={closeDrawer}
                    className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden anim-fade-in"
                />
            )}
            <aside
                className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r transform transition-transform duration-200 ease-out lg:hidden ${
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
                    current={current}
                />
            </aside>

            {/* ── Main column ───────────────────────────────────────────
              ml shift on lg+ matches the fixed sidebar width so content
              doesn't underlap. Below lg the sidebar is a drawer so no shift. */}
            <div className="flex min-h-screen min-w-0 flex-col lg:ml-60 2xl:ml-[280px]">
                {header ? (
                    <header
                        className="sticky top-0 z-20 border-b backdrop-blur"
                        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--header-bg)' }}
                    >
                        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
                            {/* Hamburger — visible only below lg */}
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
                    /* Floating hamburger when no header is provided */
                    <button
                        type="button"
                        onClick={() => setDrawerOpen(true)}
                        aria-label="Open menu"
                        className="fixed left-4 top-4 z-30 grid h-10 w-10 place-items-center rounded-md backdrop-blur transition hover:bg-hover lg:hidden"
                        style={{ color: 'var(--text-primary)', backgroundColor: 'var(--header-bg)', border: '1px solid var(--border)' }}
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
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                    >
                        Muhammad Jubayer
                    </a>
                </footer>
            </div>
        </div>
    );
}
