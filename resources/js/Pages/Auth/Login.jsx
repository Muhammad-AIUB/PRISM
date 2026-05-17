import { Head, Link } from '@inertiajs/react';

// GitHub mark — lucide-react dropped brand icons, so it's inlined here.
function GithubIcon({ className }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
            <path d="M12 .5C5.65.5.5 5.66.5 12.04c0 5.1 3.29 9.42 7.86 10.96.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.87-1.55-3.87-1.55-.52-1.34-1.27-1.7-1.27-1.7-1.04-.72.08-.7.08-.7 1.15.08 1.75 1.19 1.75 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.29-5.24-5.74 0-1.27.45-2.31 1.19-3.13-.12-.3-.52-1.49.11-3.11 0 0 .97-.31 3.18 1.2.92-.26 1.91-.39 2.9-.39s1.98.13 2.9.39c2.21-1.51 3.18-1.2 3.18-1.2.63 1.62.23 2.81.11 3.11.74.82 1.19 1.86 1.19 3.13 0 4.47-2.69 5.45-5.25 5.73.41.36.78 1.07.78 2.16 0 1.56-.01 2.82-.01 3.2 0 .31.21.68.8.56 4.56-1.54 7.85-5.86 7.85-10.96C23.5 5.66 18.35.5 12 .5z" />
        </svg>
    );
}

export default function Login({ status }) {
    return (
        <div className="login-bg relative flex min-h-screen items-center justify-center overflow-hidden p-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
            {/* Dot pattern overlay */}
            <div aria-hidden className="dot-pattern pointer-events-none absolute inset-0 opacity-50" />

            <Head title="Sign in to PRism" />

            <div
                className="relative z-10 w-full max-w-sm rounded-lg p-8"
                style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
                {/* Logo */}
                <div className="flex flex-col items-center text-center">
                    <Link href="/" className="mb-4 flex items-center gap-2">
                        <div
                            className="grid h-10 w-10 place-items-center rounded-md text-white"
                            style={{
                                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                                boxShadow: '0 0 0 1px rgba(99,102,241,0.5), 0 6px 20px -4px rgba(99,102,241,0.55)',
                            }}
                        >
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 7l9-4 9 4-9 4-9-4z" />
                                <path d="M3 17l9 4 9-4" />
                                <path d="M3 12l9 4 9-4" />
                            </svg>
                        </div>
                        <span className="brand-text text-3xl">PRism</span>
                    </Link>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        AI-powered code review for everyone
                    </p>
                </div>

                {status && (
                    <div
                        className="mt-6 rounded-md px-3 py-2 text-center text-sm"
                        style={{ backgroundColor: 'rgba(34,197,94,0.10)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.30)' }}
                    >
                        {status}
                    </div>
                )}

                <a
                    href="/auth/github"
                    className="btn mt-8 w-full text-sm font-semibold"
                    style={{
                        backgroundColor: '#0f0f13',
                        color: '#ffffff',
                        border: '1px solid var(--border-hover)',
                        padding: '0.625rem 1rem',
                    }}
                >
                    <GithubIcon className="h-5 w-5" />
                    Continue with GitHub
                </a>

                <p className="mt-5 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                    Free and open source · No password needed
                </p>
            </div>
        </div>
    );
}
