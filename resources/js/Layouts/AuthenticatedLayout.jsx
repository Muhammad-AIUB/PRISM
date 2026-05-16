import ThemeToggle from '@/Components/ThemeToggle';
import { Link, router, usePage } from '@inertiajs/react';
import { useState } from 'react';

function NavLink({ href, active, children }) {
    return (
        <Link
            href={href}
            className={`relative inline-flex items-center px-3 py-2 text-sm font-medium transition ${
                active
                    ? 'text-ink-text'
                    : 'text-ink-dim hover:text-ink-text'
            }`}
        >
            {children}
            {active && (
                <span className="absolute inset-x-2 -bottom-px h-px bg-brand-500" />
            )}
        </Link>
    );
}

function Avatar({ user }) {
    if (user?.github_avatar) {
        return (
            <img
                src={user.github_avatar}
                alt={user.name}
                className="h-7 w-7 rounded-full ring-1 ring-ink-border"
            />
        );
    }
    const initial = (user?.name || '?').charAt(0).toUpperCase();
    return (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
            {initial}
        </div>
    );
}

export default function AuthenticatedLayout({ header, children }) {
    const { auth } = usePage().props;
    const user = auth?.user;
    const current = typeof route === 'function' ? route().current() : '';
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <div className="min-h-screen bg-ink-bg text-ink-text">
            <nav className="sticky top-0 z-40 border-b border-ink-border bg-ink-bg/80 backdrop-blur supports-[backdrop-filter]:bg-ink-bg/60">
                <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-8">
                        <Link href="/dashboard" className="flex items-center gap-2">
                            <div className="grid h-7 w-7 place-items-center rounded-md bg-brand-500 text-white shadow-glow">
                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 7l9-4 9 4-9 4-9-4z" />
                                    <path d="M3 17l9 4 9-4" />
                                    <path d="M3 12l9 4 9-4" />
                                </svg>
                            </div>
                            <span className="text-base font-semibold tracking-tight">PRism</span>
                        </Link>
                        <div className="hidden gap-1 sm:flex">
                            <NavLink href="/dashboard" active={current === 'dashboard'}>Dashboard</NavLink>
                            <NavLink href="/repositories" active={current?.startsWith?.('repositories')}>Repositories</NavLink>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <ThemeToggle />

                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setMenuOpen((s) => !s)}
                                className="flex items-center gap-2 rounded-btn p-1 pr-2 text-sm text-ink-dim hover:bg-ink-card hover:text-ink-text"
                            >
                                <Avatar user={user} />
                                <span className="hidden sm:inline">{user?.github_username || user?.name}</span>
                                <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
                            </button>
                            {menuOpen && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                                    <div className="absolute right-0 z-40 mt-2 w-48 overflow-hidden rounded-card bg-ink-card ring-1 ring-ink-border shadow-card animate-fade-in">
                                        <div className="border-b border-ink-border px-3 py-2 text-xs text-ink-dim">
                                            Signed in as<br/>
                                            <span className="font-medium text-ink-text">{user?.github_username || user?.name}</span>
                                        </div>
                                        <Link href="/profile" className="block px-3 py-2 text-sm text-ink-text hover:bg-ink-muted">Profile</Link>
                                        <button
                                            type="button"
                                            onClick={() => router.post('/logout')}
                                            className="block w-full px-3 py-2 text-left text-sm text-ink-text hover:bg-ink-muted"
                                        >
                                            Log out
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </nav>

            {header && (
                <header className="border-b border-ink-border">
                    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{header}</div>
                </header>
            )}

            <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
        </div>
    );
}
