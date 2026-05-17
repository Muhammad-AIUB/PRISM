import ThemeToggle from '@/Components/ThemeToggle';
import { Link, router, usePage } from '@inertiajs/react';
import {
    ChevronUp,
    FileSearch,
    GitBranch,
    LayoutDashboard,
    LogOut,
    Settings,
    User as UserIcon,
} from 'lucide-react';
import { useState } from 'react';

function NavItem({ href, icon: Icon, label, active }) {
    return (
        <Link
            href={href}
            className="group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition"
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

export default function AuthenticatedLayout({ header, children }) {
    const { auth } = usePage().props;
    const user = auth?.user;
    const current = typeof route === 'function' ? route().current() : '';
    const [menuOpen, setMenuOpen] = useState(false);

    const nav = [
        { href: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard',    isActive: current === 'dashboard' },
        { href: '/repositories', icon: GitBranch,       label: 'Repositories', isActive: current?.startsWith?.('repositories') },
        // Reviews page in the sidebar links to the dashboard (which shows recent PRs)
        // until a dedicated index page is added; staying within Phase-1 (no new features).
        { href: '/dashboard',    icon: FileSearch,      label: 'Reviews',      isActive: current?.startsWith?.('reviews') },
        { href: '/profile',      icon: Settings,        label: 'Settings',     isActive: current?.startsWith?.('profile') },
    ];

    return (
        <div className="flex min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            {/* ── Sidebar ─────────────────────────────────────────────── */}
            <aside
                className="hidden w-60 shrink-0 flex-col border-r md:flex"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
            >
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

                {/* Nav */}
                <nav className="flex-1 space-y-1 px-3">
                    {nav.map((item) => (
                        <NavItem key={item.href} href={item.href} icon={item.icon} label={item.label} active={item.isActive} />
                    ))}
                </nav>

                {/* User card */}
                <div className="border-t p-3" style={{ borderColor: 'var(--border)' }}>
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setMenuOpen((s) => !s)}
                            className="flex w-full items-center gap-3 rounded-md px-2 py-2 transition hover:bg-hover"
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
                                        className="flex items-center gap-2 px-3 py-2 text-sm transition hover:bg-hover"
                                        style={{ color: 'var(--text-primary)' }}
                                    >
                                        <UserIcon className="h-4 w-4" /> Profile
                                    </Link>
                                    <div className="flex items-center gap-2 px-3 py-2 text-sm transition hover:bg-hover" style={{ color: 'var(--text-primary)' }}>
                                        <span className="flex flex-1 items-center gap-2">Theme</span>
                                        <ThemeToggle />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => router.post('/logout')}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-hover"
                                        style={{ color: 'var(--text-primary)' }}
                                    >
                                        <LogOut className="h-4 w-4" /> Log out
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </aside>

            {/* ── Main column ─────────────────────────────────────────── */}
            <div className="flex min-w-0 flex-1 flex-col">
                {header && (
                    <header
                        className="sticky top-0 z-20 border-b backdrop-blur"
                        style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(10,10,15,0.7)' }}
                    >
                        <div className="mx-auto max-w-6xl px-6 py-5">{header}</div>
                    </header>
                )}

                <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
            </div>
        </div>
    );
}
