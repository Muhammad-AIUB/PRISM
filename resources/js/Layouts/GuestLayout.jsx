import { Link } from '@inertiajs/react';

export default function GuestLayout({ children }) {
    return (
        <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-ink-bg px-4 text-ink-text">
            {/* Subtle radial glow */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10"
                style={{
                    background:
                        'radial-gradient(60% 50% at 50% 0%, rgba(99,102,241,0.18) 0%, rgba(15,15,19,0) 70%)',
                }}
            />

            <Link href="/" className="mb-6 flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-md bg-brand-500 text-white shadow-glow">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 7l9-4 9 4-9 4-9-4z" />
                        <path d="M3 17l9 4 9-4" />
                        <path d="M3 12l9 4 9-4" />
                    </svg>
                </div>
                <span className="text-lg font-semibold tracking-tight">PRism</span>
            </Link>

            <div className="w-full max-w-md rounded-card bg-ink-card p-6 shadow-card ring-1 ring-ink-border sm:p-8">
                {children}
            </div>

            <p className="mt-6 text-xs text-ink-faint">AI-powered code review for your pull requests</p>
        </div>
    );
}
