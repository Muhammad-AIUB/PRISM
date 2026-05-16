import GuestLayout from '@/Layouts/GuestLayout';
import { Head } from '@inertiajs/react';

export default function Login({ status }) {
    return (
        <GuestLayout>
            <Head title="Sign in to PRism" />

            <div className="space-y-2 text-center">
                <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
                <p className="text-sm text-ink-dim">Sign in with GitHub to start reviewing pull requests.</p>
            </div>

            {status && (
                <div className="mt-4 rounded-btn bg-ok/10 px-3 py-2 text-center text-sm text-ok ring-1 ring-ok/30">
                    {status}
                </div>
            )}

            <a
                href="/auth/github"
                className="mt-8 flex w-full items-center justify-center gap-3 rounded-btn bg-white px-4 py-2.5 text-sm font-semibold text-[#0f0f13] transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                    <path d="M12 .5C5.65.5.5 5.66.5 12.04c0 5.1 3.29 9.42 7.86 10.96.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.87-1.55-3.87-1.55-.52-1.34-1.27-1.7-1.27-1.7-1.04-.72.08-.7.08-.7 1.15.08 1.75 1.19 1.75 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.29-5.24-5.74 0-1.27.45-2.31 1.19-3.13-.12-.3-.52-1.49.11-3.11 0 0 .97-.31 3.18 1.2.92-.26 1.91-.39 2.9-.39s1.98.13 2.9.39c2.21-1.51 3.18-1.2 3.18-1.2.63 1.62.23 2.81.11 3.11.74.82 1.19 1.86 1.19 3.13 0 4.47-2.69 5.45-5.25 5.73.41.36.78 1.07.78 2.16 0 1.56-.01 2.82-.01 3.2 0 .31.21.68.8.56 4.56-1.54 7.85-5.86 7.85-10.96C23.5 5.66 18.35.5 12 .5z" />
                </svg>
                Continue with GitHub
            </a>

            <p className="mt-6 text-center text-xs text-ink-faint">
                By signing in you authorize PRism to install pull-request webhooks on the repositories you choose.
            </p>
        </GuestLayout>
    );
}
