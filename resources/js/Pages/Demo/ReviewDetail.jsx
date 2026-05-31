import { Head, Link } from '@inertiajs/react';
import { ArrowLeft, CheckCircle2, FileCode2, Wand2 } from 'lucide-react';
import { useState } from 'react';
import DemoLayout, { DemoLanguageDot } from './_layout.jsx';

const SEVERITY = {
    critical: { color: 'var(--danger)',  label: 'Critical' },
    high:     { color: '#fb923c',        label: 'High'     }, // orange-400
    medium:   { color: 'var(--warning)', label: 'Medium'   },
    low:      { color: 'var(--info)',    label: 'Low'      },
};

function SeverityBadge({ severity }) {
    const s = SEVERITY[severity] ?? SEVERITY.medium;
    return (
        <span
            className="badge"
            style={{
                color: s.color,
                background: `color-mix(in srgb, ${s.color} 12%, transparent)`,
                borderColor: `color-mix(in srgb, ${s.color} 30%, transparent)`,
            }}
        >
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
        </span>
    );
}

function ScoreGauge({ score }) {
    const value = typeof score === 'number' ? Math.max(0, Math.min(100, score)) : null;
    if (value === null) {
        return <div className="grid h-32 w-32 place-items-center rounded-full text-sm" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>No score</div>;
    }
    let stroke = 'var(--danger)';
    if (value >= 85) stroke = 'var(--success)';
    else if (value >= 70) stroke = 'var(--warning)';

    const r = 56, c = 2 * Math.PI * r;
    const offset = c - (value / 100) * c;
    return (
        <div className="relative h-32 w-32 anim-score-in">
            <svg viewBox="0 0 128 128" className="h-32 w-32 -rotate-90">
                <circle cx="64" cy="64" r={r} stroke="var(--border)" strokeWidth="10" fill="none" />
                <circle cx="64" cy="64" r={r} stroke={stroke} strokeWidth="10" strokeLinecap="round" fill="none"
                    strokeDasharray={c} strokeDashoffset={offset}
                    style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(0.16,1,0.3,1)' }} />
            </svg>
            <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                    <div className="text-3xl font-bold" style={{ color: stroke }}>{value}</div>
                    <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>/ 100</div>
                </div>
            </div>
        </div>
    );
}

function FileLineBadge({ file, line }) {
    return (
        <span
            className="inline-flex items-center gap-1 rounded font-mono text-[11px]"
            style={{
                backgroundColor: 'var(--bg-hover)',
                color: 'var(--text-secondary)',
                padding: '0.125rem 0.5rem',
            }}
        >
            <FileCode2 className="h-3 w-3" />
            {file}
            {line ? <span style={{ color: 'var(--text-muted)' }}>:{line}</span> : null}
        </span>
    );
}

function IssueCard({ issue }) {
    return (
        <li
            className="rounded-md p-4"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
        >
            <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={issue.severity} />
                <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    {issue.type}
                </span>
                <span className="ml-auto">
                    <FileLineBadge file={issue.file} line={issue.line} />
                </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>{issue.message}</p>
        </li>
    );
}

function CodeBlock({ label, code, variant }) {
    const accentColor = variant === 'bad' ? 'var(--danger)' : 'var(--success)';
    const bgTint      = variant === 'bad' ? 'rgba(239,68,68,0.07)'  : 'rgba(34,197,94,0.07)';
    const borderTint  = variant === 'bad' ? 'rgba(239,68,68,0.30)'  : 'rgba(34,197,94,0.30)';
    return (
        <div className="rounded-md overflow-hidden" style={{ border: `1px solid ${borderTint}` }}>
            <div
                className="flex items-center px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{ backgroundColor: bgTint, color: accentColor, borderBottom: `1px solid ${borderTint}` }}
            >
                <span className="flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
                    {label}
                </span>
            </div>
            <pre
                className="overflow-x-auto whitespace-pre p-3 text-xs leading-relaxed font-mono"
                style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            >{code || <em style={{ color: 'var(--text-muted)' }}>// (empty)</em>}</pre>
        </div>
    );
}

function FixCard({ issue }) {
    return (
        <li
            className="rounded-md p-4"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
        >
            <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={issue.severity} />
                <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    {issue.type}
                </span>
                <span className="ml-auto"><FileLineBadge file={issue.file} line={issue.line} /></span>
            </div>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>{issue.message}</p>
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <CodeBlock label="Current Code"  code={issue.before} variant="bad" />
                <CodeBlock label="Suggested Fix" code={issue.after}  variant="good" />
            </div>
        </li>
    );
}

export default function DemoReviewDetail({ review }) {
    const [tab, setTab] = useState('issues');
    const issues = review.issues ?? [];

    return (
        <DemoLayout active="reviews">
            <Head title={`Demo · ${review.pr_title}`} />

            <div className="mb-4">
                <Link
                    href="/demo"
                    className="btn btn-ghost min-h-[40px] transition active:scale-95"
                    style={{ padding: '0.375rem 0.625rem' }}
                >
                    <ArrowLeft className="h-4 w-4" /> Back to demo dashboard
                </Link>
            </div>

            <div className="space-y-6">
                {/* Header card */}
                <div className="card-flat p-4 sm:p-6">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 flex-1 order-2 lg:order-1">
                            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{review.repo}</p>
                            <h1 className="mt-1 break-words text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
                                {review.pr_title}
                            </h1>
                            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                <span className="inline-flex items-center gap-1.5">
                                    <DemoLanguageDot language={review.language} />
                                    {review.language}
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--success)' }} />
                                    <span style={{ color: 'var(--text-primary)' }}>{review.status}</span>
                                </span>
                                <span style={{ color: 'var(--text-muted)' }}>{review.created_at}</span>
                            </div>
                        </div>
                        <div className="order-1 flex justify-center lg:order-2 lg:shrink-0">
                            <ScoreGauge score={review.score} />
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="card-flat overflow-hidden">
                    <div className="border-b" style={{ borderColor: 'var(--border)' }}>
                        <nav className="-mx-px flex gap-1 overflow-x-auto px-3" aria-label="Review tabs">
                            <button
                                type="button"
                                onClick={() => setTab('issues')}
                                className={`tab-item shrink-0 ${tab === 'issues' ? 'tab-item-active' : ''}`}
                            >
                                Issues
                                <span
                                    className="rounded-full px-1.5 text-[10px]"
                                    style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                                >
                                    {issues.length}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setTab('fixes')}
                                className={`tab-item shrink-0 ${tab === 'fixes' ? 'tab-item-active' : ''}`}
                            >
                                Auto-Fixes
                                <span
                                    className="rounded-full px-1.5 text-[10px]"
                                    style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                                >
                                    {issues.length}
                                </span>
                            </button>
                        </nav>
                    </div>

                    <div className="p-5">
                        {issues.length === 0 ? (
                            <div className="py-10 text-center">
                                <div
                                    className="mx-auto grid h-14 w-14 place-items-center rounded-full"
                                    style={{ backgroundColor: 'rgba(34,197,94,0.10)', color: 'var(--success)' }}
                                >
                                    <CheckCircle2 className="h-7 w-7" />
                                </div>
                                <p className="mt-4 text-base font-medium" style={{ color: 'var(--text-primary)' }}>
                                    No issues found — clean code! ✅
                                </p>
                                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                                    PRism couldn't find anything worth flagging on this PR.
                                </p>
                            </div>
                        ) : tab === 'issues' ? (
                            <ul className="space-y-3">
                                {issues.map((issue, idx) => <IssueCard key={idx} issue={issue} />)}
                            </ul>
                        ) : (
                            <ul className="space-y-4">
                                {issues.map((issue, idx) => <FixCard key={idx} issue={issue} />)}
                            </ul>
                        )}
                    </div>

                    {issues.length > 0 && (
                        <div
                            className="border-t px-5 py-3 text-xs"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                        >
                            <span className="inline-flex items-center gap-1.5">
                                <Wand2 className="h-3.5 w-3.5" />
                                In production, the Copy Fix button puts the suggested code straight onto your clipboard.
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </DemoLayout>
    );
}
