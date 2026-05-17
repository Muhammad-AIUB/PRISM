import ThemeToggle from '@/Components/ThemeToggle';
import { Link, router, usePage } from '@inertiajs/react';
import {
    ChevronUp,
    FileSearch,
    GitBranch,
    LayoutDashboard,
    LogOut,
    Menu,
    Settings,
    User as UserIcon,
    X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

function NavItem({ href, icon: Icon, label, active, onNavigate }) {
    return (
        <Link
            href={href}
            onClick={onNavigate}
            className="group flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm transition active:scale-[0.98]"
            style={{
                backgroundColor: active ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
            }}
        >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.4 : 2} />
            <span className={active ? 'font-semibold' : 'font-medium'}>{label}</span>
            {active && (
                <span
                    className="ml-auto h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: 'var(--accent)' }}
                />
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

function SidebarContents({ nav, user, menuOpen, setMenuOpen, onNavigate }) {
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
                        onNavigate={onNavigate}
                    />
                ))}
            </nav>

            <div className="border-t p-3" style={{ borderColor: 'var(--border)' }}>
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setMenuOpen((s) => !s)}
                        className="flex min-h-[44px] w-full items-center gap-3 rounded-md px-2 py-2 transition hover:bg-hover active:scale-[0.98]"
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
                                style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
                            >
                                <Link
                                    href="/profile"
                                    className="flex min-h-[44px] items-center gap-2 px-3 py-2 text-sm transition hover:bg-hover"
                                    style={{ color: 'var(--text-primary)' }}
                                >
                                    <UserIcon className="h-4 w-4" /> Profile
                                </Link>
                                <div className="flex min-h-[44px] items-center gap-2 px-3 py-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                                    <span className="flex flex-1 items-center gap-2">Theme</span>
                                    <ThemeToggle />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => router.post('/logout')}
                                    className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-hover active:scale-[0.98]"
                                    style={{ color: 'var(--text-primary)' }}
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
        { href: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard',    isActive: current === 'dashboard' },
        { href: '/repositories', icon: GitBranch,       label: 'Repositories', isActive: current?.startsWith?.('repositories') },
        // Reviews shortcut points at the dashboard (which lists recent PRs) until
        // a dedicated /reviews index exists.
        { href: '/dashboard',    icon: FileSearch,      label: 'Reviews',      isActive: current?.startsWith?.('reviews') },
        { href: '/settings',     icon: Settings,        label: 'Settings',     isActive: current?.startsWith?.('settings') },
    ];

    const closeDrawer = () => setDrawerOpen(false);

    return (
        <div className="flex min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            {/* ── Desktop sidebar (lg+) ──────────────────────────────── */}
            <aside
                className="hidden w-60 shrink-0 flex-col border-r 2xl:w-[280px] lg:flex"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
            >
                <SidebarContents nav={nav} user={user} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
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
                />
            </aside>

            {/* ── Main column ─────────────────────────────────────────── */}
            <div className="flex min-w-0 flex-1 flex-col">
                {header ? (
                    <header
                        className="sticky top-0 z-20 border-b backdrop-blur"
                        style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(10,10,15,0.7)' }}
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
                        style={{ color: 'var(--text-primary)', backgroundColor: 'rgba(10,10,15,0.7)', border: '1px solid var(--border)' }}
                    >
                        <Menu className="h-5 w-5" />
                    </button>
                )}

                <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
            </div>
        </div>
    );
}
