import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link } from '@inertiajs/react';
import {
    AlertCircle,
    Check,
    Database,
    ExternalLink,
    Eye,
    EyeOff,
    Globe,
    Key,
    Lock,
    Mail,
    Shield,
    Webhook,
    X,
} from 'lucide-react';

// GitHub mark (lucide dropped brand icons)
function GithubIcon({ className }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
            <path d="M12 .5C5.65.5.5 5.66.5 12.04c0 5.1 3.29 9.42 7.86 10.96.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.87-1.55-3.87-1.55-.52-1.34-1.27-1.7-1.27-1.7-1.04-.72.08-.7.08-.7 1.15.08 1.75 1.19 1.75 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.29-5.24-5.74 0-1.27.45-2.31 1.19-3.13-.12-.3-.52-1.49.11-3.11 0 0 .97-.31 3.18 1.2.92-.26 1.91-.39 2.9-.39s1.98.13 2.9.39c2.21-1.51 3.18-1.2 3.18-1.2.63 1.62.23 2.81.11 3.11.74.82 1.19 1.86 1.19 3.13 0 4.47-2.69 5.45-5.25 5.73.41.36.78 1.07.78 2.16 0 1.56-.01 2.82-.01 3.2 0 .31.21.68.8.56 4.56-1.54 7.85-5.86 7.85-10.96C23.5 5.66 18.35.5 12 .5z" />
        </svg>
    );
}

function SectionHeading({ eyebrow, title, subtitle, align = 'center' }) {
    return (
        <div className={align === 'center' ? 'text-center' : ''}>
            {eyebrow && (
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] sm:text-xs" style={{ color: 'var(--accent)' }}>
                    {eyebrow}
                </p>
            )}
            <h2 className="mt-2 text-2xl font-bold tracking-tight lg:text-3xl" style={{ color: 'var(--text-primary)' }}>{title}</h2>
            {subtitle && <p className="mt-2 text-sm leading-relaxed sm:text-base" style={{ color: 'var(--text-secondary)' }}>{subtitle}</p>}
        </div>
    );
}

function YesRow({ children }) {
    return (
        <li className="flex items-start gap-3">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full"
                style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: 'var(--success)' }}>
                <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            <span className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{children}</span>
        </li>
    );
}

function NoRow({ children }) {
    return (
        <li className="flex items-start gap-3">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full"
                style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: 'var(--danger)' }}>
                <X className="h-3 w-3" strokeWidth={3} />
            </span>
            <span className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{children}</span>
        </li>
    );
}

function TimelineStep({ icon, title }) {
    return (
        <li className="flex items-start gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-base"
                style={{ backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
                {icon}
            </span>
            <span className="pt-1 text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>{title}</span>
        </li>
    );
}

function FlowStep({ step, title, sub }) {
    return (
        <div className="flex gap-4">
            <div className="flex flex-col items-center">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold"
                    style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: 'var(--accent)', border: '1px solid rgba(99,102,241,0.30)' }}>
                    {step}
                </span>
                <span className="mt-1 h-full w-px" style={{ backgroundColor: 'var(--border)' }} />
            </div>
            <div className="pb-6">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</p>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>{sub}</p>
            </div>
        </div>
    );
}

function ComplianceCard({ icon: Icon, title, body }) {
    return (
        <div className="card p-5">
            <div className="grid h-9 w-9 place-items-center rounded-md"
                style={{ color: 'var(--accent)', backgroundColor: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.30)' }}>
                <Icon className="h-4 w-4" />
            </div>
            <h3 className="mt-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{body}</p>
        </div>
    );
}

export default function Index({ github_app_url, github_repo_url }) {
    return (
        <AuthenticatedLayout
            header={
                <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wider sm:text-xs" style={{ color: 'var(--text-muted)' }}>Trust</p>
                    <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">Security &amp; Privacy</h1>
                </div>
            }
        >
            <Head title="Security & Privacy" />

            <div className="mx-auto max-w-5xl space-y-16 sm:space-y-20">
                {/* ── Hero ────────────────────────────────────────────── */}
                <section className="relative text-center">
                    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10"
                        style={{ background: 'radial-gradient(60% 50% at 50% 0%, rgba(99,102,241,0.18) 0%, rgba(10,10,15,0) 70%)' }} />
                    <div className="mx-auto grid h-20 w-20 place-items-center rounded-full"
                        style={{
                            background: 'linear-gradient(135deg, rgba(99,102,241,0.20), rgba(168,85,247,0.15))',
                            border: '1px solid rgba(99,102,241,0.35)',
                            boxShadow: '0 0 40px -8px rgba(99,102,241,0.55)',
                        }}>
                        <Shield className="h-10 w-10" style={{ color: 'var(--accent)' }} />
                    </div>
                    <h2 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl" style={{ color: 'var(--text-primary)' }}>
                        Your Code is Safe with PRism
                    </h2>
                    <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed sm:text-base" style={{ color: 'var(--text-secondary)' }}>
                        Full transparency about what we access, store, and protect.
                    </p>
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                        {[
                            { icon: '🔐', label: 'AES-256 Encrypted' },
                            { icon: '🔓', label: 'Open Source' },
                            { icon: '✅', label: 'Self-Hostable' },
                        ].map((b) => (
                            <span key={b.label} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
                                style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                                <span>{b.icon}</span>{b.label}
                            </span>
                        ))}
                    </div>
                </section>

                {/* ── 1. What we access ───────────────────────────────── */}
                <section>
                    <SectionHeading eyebrow="Transparency" title="What We Access — Honestly" />
                    <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="card p-5 sm:p-6">
                            <div className="flex items-center gap-2">
                                <Eye className="h-5 w-5" style={{ color: 'var(--success)' }} />
                                <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>We Access</h3>
                            </div>
                            <ul className="mt-4 space-y-2.5">
                                <YesRow>Your GitHub profile (name, email, avatar)</YesRow>
                                <YesRow>Your repository list (for the connect picker)</YesRow>
                                <YesRow>Pull request diffs (only when a PR is opened or updated)</YesRow>
                                <YesRow>Commit diffs (only if commit-review mode is enabled)</YesRow>
                            </ul>
                        </div>
                        <div className="card p-5 sm:p-6">
                            <div className="flex items-center gap-2">
                                <EyeOff className="h-5 w-5" style={{ color: 'var(--danger)' }} />
                                <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>We Never Access</h3>
                            </div>
                            <ul className="mt-4 space-y-2.5">
                                <NoRow>Your source code is NEVER stored</NoRow>
                                <NoRow>We don't read your commit history</NoRow>
                                <NoRow>We never push code to your repos</NoRow>
                                <NoRow>We don't access private messages</NoRow>
                                <NoRow>No access to other apps you've connected</NoRow>
                            </ul>
                        </div>
                    </div>
                </section>

                {/* ── 2. Token security ───────────────────────────────── */}
                <section>
                    <SectionHeading eyebrow="Token security" title="How Your Token Is Protected" />
                    <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-5">
                        <div className="card p-5 sm:p-6 lg:col-span-3">
                            <ul className="space-y-4">
                                <TimelineStep icon="🔐" title="AES-256 encrypted using Laravel Crypt before storage" />
                                <TimelineStep icon="🛡️" title="Database itself is password-protected and TLS-encrypted (Neon)" />
                                <TimelineStep icon="🚫" title="Token NEVER appears in logs or error reports" />
                                <TimelineStep icon="🚫" title="Token NEVER sent to the AI provider (OpenRouter)" />
                                <TimelineStep icon="⚡" title="Decrypted in-memory only when calling the GitHub API" />
                                <TimelineStep icon="🔄" title="You can revoke access from GitHub anytime" />
                            </ul>
                        </div>
                        <div className="card p-5 sm:p-6 lg:col-span-2">
                            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                                How we store your token
                            </p>
                            <pre className="mt-3 overflow-x-auto rounded-md p-3 text-[11px] leading-relaxed"
                                style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
{`// User Model
protected $casts = [
    'github_token' => 'encrypted', // AES-256-CBC
];

// In DB it looks like:
// eyJpdiI6IjlBdmtuTGFEcWZxc...`}
                            </pre>
                        </div>
                    </div>
                </section>

                {/* ── 2.5 Browser storage policy ──────────────────────── */}
                <section>
                    <div className="card p-5 sm:p-7">
                        <div className="flex items-center gap-3">
                            <Database className="h-6 w-6" style={{ color: 'var(--accent)' }} />
                            <SectionHeading title="Browser Storage Policy" align="left" />
                        </div>
                        <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                            PRism is deliberate about what it puts in your browser. We audit every <code className="rounded font-mono px-1" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)' }}>localStorage</code> write to keep sensitive data off the client.
                        </p>
                        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <ul className="space-y-2.5">
                                <YesRow>Only UI preferences stored in browser (theme, layout)</YesRow>
                                <YesRow>Session uses HTTP-only secure cookies (XSS-safe)</YesRow>
                                <YesRow>CSRF tokens rotated on every request</YesRow>
                            </ul>
                            <ul className="space-y-2.5">
                                <NoRow>NO authentication tokens in localStorage</NoRow>
                                <NoRow>NO personal data in localStorage</NoRow>
                                <NoRow>NO API keys, ever, in the client</NoRow>
                            </ul>
                        </div>
                        <div className="mt-5">
                            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                                The only key we write
                            </p>
                            <pre className="mt-2 overflow-x-auto rounded-md p-3 text-[11px] leading-relaxed"
                                style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
{`// resources/js/Components/ThemeToggle.jsx
// Safe: UI preference only, no PII or auth data.
localStorage.setItem('prism-theme', theme);   // 'light' | 'dark'`}
                            </pre>
                        </div>
                    </div>
                </section>

                {/* ── 3. Code journey ─────────────────────────────────── */}
                <section>
                    <SectionHeading eyebrow="Data flow" title="Your Code's Journey Through PRism" />
                    <div className="card mt-8 p-5 sm:p-6">
                        <div className="relative">
                            <FlowStep step="1" title="You open a PR on GitHub"               sub="Webhook triggered (HMAC verified)" />
                            <FlowStep step="2" title="PRism fetches ONLY the diff"            sub="Not your full codebase" />
                            <FlowStep step="3" title="Diff is sent to OpenRouter for review"  sub="Free AI provider, no data retention by them" />
                            <FlowStep step="4" title="AI returns review as structured JSON"   sub="Only the analysis, not your code" />
                            <FlowStep step="5" title="Review stored in PRism database"        sub="Original code is NOT stored" />
                            <FlowStep step="6" title="Diff cached for 1 hour, then auto-deleted" sub="For re-analysis only" />
                        </div>
                    </div>
                </section>

                {/* ── 4. Open source ──────────────────────────────────── */}
                <section>
                    <div className="card p-5 sm:p-7">
                        <div className="flex items-center gap-3">
                            <GithubIcon className="h-8 w-8" />
                            <SectionHeading title="Audit Our Code Yourself" align="left" />
                        </div>
                        <p className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            PRism is 100% open source. Every line of code that handles your data is publicly viewable on GitHub.
                        </p>
                        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <a href={github_repo_url} target="_blank" rel="noopener noreferrer"
                                className="btn btn-primary min-h-[44px] transition active:scale-95">
                                <GithubIcon className="h-4 w-4" /> View Source on GitHub
                            </a>
                            <a href={`${github_repo_url}/issues/new`} target="_blank" rel="noopener noreferrer"
                                className="btn btn-secondary min-h-[44px] transition active:scale-95">
                                <AlertCircle className="h-4 w-4" /> Report Security Issue
                            </a>
                            <a href={`${github_repo_url}#readme`} target="_blank" rel="noopener noreferrer"
                                className="btn btn-secondary min-h-[44px] transition active:scale-95">
                                <Globe className="h-4 w-4" /> Self-Host Guide
                            </a>
                        </div>
                    </div>
                </section>

                {/* ── 5. Revoke access ────────────────────────────────── */}
                <section>
                    <SectionHeading eyebrow="Your control" title="You're in Control" />
                    <div className="card mt-8 p-5 sm:p-7">
                        <ol className="space-y-2.5 pl-5 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)', listStyle: 'decimal' }}>
                            <li>Go to <code className="rounded font-mono px-1" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)' }}>github.com/settings/applications</code></li>
                            <li>Find <strong style={{ color: 'var(--text-primary)' }}>"PRism"</strong> in your authorized apps</li>
                            <li>Click <strong style={{ color: 'var(--text-primary)' }}>"Revoke access"</strong></li>
                            <li>Your data is automatically deleted from PRism</li>
                        </ol>
                        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                            <a href={github_app_url} target="_blank" rel="noopener noreferrer"
                                className="btn btn-primary min-h-[44px] transition active:scale-95">
                                Open GitHub Settings <ExternalLink className="h-4 w-4" />
                            </a>
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                Or delete all your PRism data right now:
                            </span>
                            <Link href="/security/my-data" className="btn min-h-[44px] transition active:scale-95"
                                style={{ backgroundColor: 'rgba(239,68,68,0.10)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.30)' }}>
                                Delete My Data
                            </Link>
                        </div>
                    </div>
                </section>

                {/* ── 6. OAuth scopes ─────────────────────────────────── */}
                <section>
                    <SectionHeading eyebrow="Permissions" title="What Permissions We Request" />
                    <div className="card-flat mt-8 overflow-hidden">
                        <div className="hidden md:block">
                            <table className="min-w-full">
                                <thead style={{ backgroundColor: 'var(--bg-secondary)' }}>
                                    <tr className="text-left text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                                        <th className="px-5 py-3 font-medium">Scope</th>
                                        <th className="px-5 py-3 font-medium">What it does</th>
                                        <th className="px-5 py-3 font-medium">Why we need it</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-t" style={{ borderColor: 'var(--border)' }}>
                                        <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--accent)' }}>repo</td>
                                        <td className="px-5 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>Read repositories and install webhooks</td>
                                        <td className="px-5 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>To install the webhook for PR/push events and fetch diffs</td>
                                    </tr>
                                    <tr className="border-t" style={{ borderColor: 'var(--border)' }}>
                                        <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--accent)' }}>read:user</td>
                                        <td className="px-5 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>Read your profile info</td>
                                        <td className="px-5 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>To show your name and avatar in PRism</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        {/* Mobile cards */}
                        <ul className="divide-y md:hidden" style={{ borderColor: 'var(--border)' }}>
                            {[
                                { scope: 'repo',      what: 'Read repositories and install webhooks', why: 'To install the webhook for PR/push events and fetch diffs' },
                                { scope: 'read:user', what: 'Read your profile info',                  why: 'To show your name and avatar in PRism' },
                            ].map((row) => (
                                <li key={row.scope} className="p-4">
                                    <p className="font-mono text-xs" style={{ color: 'var(--accent)' }}>{row.scope}</p>
                                    <p className="mt-1 text-sm" style={{ color: 'var(--text-primary)' }}>{row.what}</p>
                                    <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{row.why}</p>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <p className="mt-3 text-xs italic" style={{ color: 'var(--text-muted)' }}>
                        We do NOT request: <code className="font-mono">delete_repo</code>, <code className="font-mono">admin:org</code>,{' '}
                        <code className="font-mono">admin:repo_hook</code>, <code className="font-mono">admin:public_key</code>,{' '}
                        <code className="font-mono">gist</code>, <code className="font-mono">notifications</code>.
                    </p>
                </section>

                {/* ── 7. Compliance grid ──────────────────────────────── */}
                <section>
                    <SectionHeading eyebrow="Hardening" title="Compliance &amp; Standards" />
                    <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
                        <ComplianceCard icon={Lock}    title="HMAC Verification" body="All incoming webhooks verified with SHA-256 HMAC signatures to prevent spoofing." />
                        <ComplianceCard icon={Webhook} title="IP Whitelist"      body="The webhook endpoint only accepts requests from GitHub's official IP ranges." />
                        <ComplianceCard icon={Key}     title="Rate Limiting"     body="All API endpoints are rate-limited (60-100 req/min) to prevent abuse." />
                    </div>
                </section>

                {/* ── 8. Audit log + activity ─────────────────────────── */}
                <section>
                    <div className="card p-5 sm:p-7">
                        <div className="flex items-center gap-3">
                            <Database className="h-6 w-6" style={{ color: 'var(--accent)' }} />
                            <SectionHeading title="See Everything That Happened" align="left" />
                        </div>
                        <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                            Every meaningful action on your account is logged with a timestamp, action type, and IP address. You can review the full activity log anytime.
                        </p>
                        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                            <Link href="/security/my-data" className="btn btn-primary min-h-[44px] transition active:scale-95">
                                View My Data
                            </Link>
                            <Link href="/security/audit-log" className="btn btn-secondary min-h-[44px] transition active:scale-95">
                                View Activity Log
                            </Link>
                        </div>
                    </div>
                </section>

                {/* ── 9. Contact ──────────────────────────────────────── */}
                <section className="text-center">
                    <div className="card p-6 sm:p-8">
                        <Mail className="mx-auto h-8 w-8" style={{ color: 'var(--accent)' }} />
                        <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl" style={{ color: 'var(--text-primary)' }}>
                            Found a security issue?
                        </h2>
                        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                            Please report responsibly via GitHub Issues.
                        </p>
                        <a href={`${github_repo_url}/issues/new`} target="_blank" rel="noopener noreferrer"
                            className="btn btn-primary mt-5 inline-flex min-h-[44px] transition active:scale-95">
                            <AlertCircle className="h-4 w-4" /> Report Issue
                        </a>
                    </div>
                </section>
            </div>
        </AuthenticatedLayout>
    );
}
