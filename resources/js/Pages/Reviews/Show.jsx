import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowRight,
    Check,
    ChevronRight,
    Code2,
    Copy,
    Download,
    ExternalLink,
    Info,
    RefreshCw,
    Wand2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const SEV = {
    critical:   { color: 'var(--danger)',  label: 'Critical' },
    warning:    { color: 'var(--warning)', label: 'Warning' },
    suggestion: { color: 'var(--info)',    label: 'Suggestion' },
};

const STATUS = {
    pending:   { color: 'var(--warning)' },
    analyzing: { color: 'var(--info)', pulse: true },
    completed: { color: 'var(--success)' },
    failed:    { color: 'var(--danger)' },
};

const LAYERS = [
    { key: 'security',     label: 'Security' },
    { key: 'performance',  label: 'Performance' },
    { key: 'code_quality', label: 'Code Quality' },
    { key: 'fixes',        label: 'Auto-Fixes' },
    { key: 'diff',         label: 'View Diff' },
];

const LAYER_LABEL = {
    security:     { label: 'security',     color: 'var(--danger)' },
    performance:  { label: 'performance',  color: 'var(--warning)' },
    code_quality: { label: 'code quality', color: 'var(--accent)' },
};

function SeverityBadge({ severity }) {
    const s = SEV[severity] ?? SEV.suggestion;
    return (
        <span
            className="badge"
            style={{
                color: s.color,
                background: `color-mix(in srgb, ${s.color} 12%, transparent)`,
                borderColor: `color-mix(in srgb, ${s.color} 28%, transparent)`,
            }}
        >
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
        </span>
    );
}

function StatusPill({ status }) {
    const s = STATUS[status] ?? { color: 'var(--text-muted)' };
    return (
        <span className="inline-flex items-center gap-2 text-xs font-medium">
            {s.pulse ? (
                <span className="pulse-dot" />
            ) : (
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            )}
            <span style={{ color: 'var(--text-primary)' }}>{status}</span>
        </span>
    );
}

function AuthorAvatar({ login }) {
    if (!login) return null;
    return (
        <img
            src={`https://github.com/${login}.png?size=40`}
            alt={login}
            className="h-6 w-6 rounded-full ring-1"
            style={{ '--tw-ring-color': 'var(--border)' }}
            loading="lazy"
        />
    );
}

function CopyBtn({ text }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            type="button"
            onClick={async () => {
                try {
                    await navigator.clipboard.writeText(text);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                } catch {}
            }}
            className="btn-ghost btn"
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
        >
            {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
        </button>
    );
}

function ScoreCircle({ score }) {
    const value = typeof score === 'number' ? Math.max(0, Math.min(100, score)) : null;
    if (value === null) {
        return (
            <div
                className="grid h-32 w-32 place-items-center rounded-full text-sm"
                style={{
                    backgroundColor: 'var(--bg-hover)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                }}
            >
                No score
            </div>
        );
    }

    let stroke = 'var(--danger)';
    if (value > 70) stroke = 'var(--success)';
    else if (value >= 40) stroke = 'var(--warning)';

    const r = 56;
    const c = 2 * Math.PI * r;
    const offset = c - (value / 100) * c;

    return (
        <div className="relative h-32 w-32 anim-score-in">
            <svg viewBox="0 0 128 128" className="h-32 w-32 -rotate-90">
                <circle cx="64" cy="64" r={r} stroke="var(--border)" strokeWidth="10" fill="none" />
                <circle
                    cx="64" cy="64" r={r}
                    stroke={stroke} strokeWidth="10" strokeLinecap="round" fill="none"
                    strokeDasharray={c}
                    strokeDashoffset={offset}
                    style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(0.16,1,0.3,1)' }}
                />
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

function LanguageBadges({ languages = [] }) {
    if (!languages || languages.length === 0) return null;
    return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Languages:</span>
            {languages.map((lang) => (
                <span
                    key={lang}
                    className="badge"
                    style={{
                        backgroundColor: 'rgba(99,102,241,0.10)',
                        color: 'var(--accent)',
                        borderColor: 'rgba(99,102,241,0.30)',
                    }}
                >
                    {lang}
                </span>
            ))}
        </span>
    );
}

function CodeBlock({ label, code, variant }) {
    // variant: 'bad' (red tint) | 'good' (green tint)
    const accentColor = variant === 'bad' ? 'var(--danger)' : 'var(--success)';
    const bgTint      = variant === 'bad' ? 'rgba(239,68,68,0.07)' : 'rgba(34,197,94,0.07)';
    const borderTint  = variant === 'bad' ? 'rgba(239,68,68,0.30)' : 'rgba(34,197,94,0.30)';

    return (
        <div className="rounded-md overflow-hidden" style={{ border: `1px solid ${borderTint}` }}>
            <div
                className="flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
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

function FixCard({ fix, onCopy }) {
    const layerInfo = LAYER_LABEL[fix.layer] ?? LAYER_LABEL.code_quality;
    return (
        <div className="rounded-md p-4" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            {/* Header row */}
            <div className="flex flex-wrap items-center gap-2">
                {(fix.file || fix.line) && (
                    <span
                        className="inline-flex items-center gap-1 rounded font-mono text-[11px]"
                        style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)', padding: '0.125rem 0.5rem' }}
                    >
                        {fix.file || 'unknown'}
                    </span>
                )}
                {fix.line ? (
                    <span
                        className="inline-flex items-center gap-1 rounded font-mono text-[11px] font-semibold"
                        style={{
                            backgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                            color: 'var(--accent)',
                            border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
                            padding: '0.125rem 0.5rem',
                        }}
                        title="Apply this fix at this line"
                    >
                        Line {fix.line}
                    </span>
                ) : null}
                <span
                    className="badge"
                    style={{
                        color: layerInfo.color,
                        background: `color-mix(in srgb, ${layerInfo.color} 12%, transparent)`,
                        borderColor: `color-mix(in srgb, ${layerInfo.color} 28%, transparent)`,
                    }}
                >
                    {layerInfo.label}
                </span>
                <div className="ml-auto">
                    <button
                        type="button"
                        onClick={() => onCopy(fix.suggested_code)}
                        className="btn btn-secondary min-h-[36px] transition active:scale-95"
                        style={{ padding: '0.25rem 0.625rem', fontSize: '0.75rem' }}
                    >
                        <Copy className="h-3.5 w-3.5" />
                        Copy Fix
                    </button>
                </div>
            </div>

            {/* Original issue summary */}
            {fix.original_issue && (
                <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                    {fix.original_issue}
                </p>
            )}

            {/* Side-by-side on lg+, stacked under */}
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <CodeBlock label="Current Code"  code={fix.problematic_code} variant="bad" />
                <CodeBlock label="Suggested Fix" code={fix.suggested_code}   variant="good" />
            </div>

            {/* Explanation */}
            {fix.explanation && (
                <div
                    className="mt-3 rounded p-3 text-xs leading-relaxed"
                    style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Why this is better:</span>{' '}
                    {fix.explanation}
                </div>
            )}
        </div>
    );
}

function FixesTab({ fixes }) {
    const [copyToast, setCopyToast] = useState(false);

    const copy = async (text) => {
        try {
            await navigator.clipboard.writeText(text ?? '');
            setCopyToast(true);
            setTimeout(() => setCopyToast(false), 2000);
        } catch {}
    };

    if (!fixes || fixes.length === 0) {
        return (
            <div className="text-center py-10">
                <div
                    className="mx-auto grid h-14 w-14 place-items-center rounded-full"
                    style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}
                >
                    <Wand2 className="h-6 w-6" />
                </div>
                <p className="mt-4 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    No auto-fixes generated.
                </p>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    The AI didn't propose concrete fixes for this review. Run Re-analyze to try again.
                </p>
            </div>
        );
    }

    return (
        <div className="relative">
            <ul className="space-y-4">
                {fixes.map((fix, idx) => (
                    <li key={idx}>
                        <FixCard fix={fix} onCopy={copy} />
                    </li>
                ))}
            </ul>

            {/* Copy toast */}
            <div
                className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md px-4 py-2 text-sm transition-all duration-200"
                style={{
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--success)',
                    border: '1px solid rgba(34,197,94,0.35)',
                    opacity: copyToast ? 1 : 0,
                    transform: `translate(-50%, ${copyToast ? '0' : '8px'})`,
                    pointerEvents: copyToast ? 'auto' : 'none',
                    boxShadow: '0 12px 32px -8px rgba(0,0,0,0.5)',
                }}
            >
                <span className="inline-flex items-center gap-2">
                    <Check className="h-4 w-4" /> Copied to clipboard
                </span>
            </div>
        </div>
    );
}

function IssueCard({ issue }) {
    return (
        <div
            className="rounded-md p-4 transition"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    {(issue.file || issue.line) && (
                        <div className="mb-2 flex flex-wrap items-center gap-1.5">
                            {issue.file && (
                                <span
                                    className="inline-flex items-center gap-1 rounded font-mono text-[11px]"
                                    style={{
                                        backgroundColor: 'var(--bg-hover)',
                                        color: 'var(--text-secondary)',
                                        padding: '0.125rem 0.5rem',
                                    }}
                                >
                                    {issue.file}
                                </span>
                            )}
                            {issue.line ? (
                                <span
                                    className="inline-flex items-center gap-1 rounded font-mono text-[11px] font-semibold"
                                    style={{
                                        backgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                                        color: 'var(--accent)',
                                        border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
                                        padding: '0.125rem 0.5rem',
                                    }}
                                >
                                    Line {issue.line}
                                </span>
                            ) : null}
                        </div>
                    )}
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>{issue.comment}</p>
                </div>
                <SeverityBadge severity={issue.severity} />
            </div>
        </div>
    );
}

function SeverityFilters({ counts, active, onChange }) {
    const items = [
        { key: 'all',        label: 'All',        count: counts.all,        color: null },
        { key: 'critical',   label: 'Critical',   count: counts.critical,   color: 'var(--danger)' },
        { key: 'warning',    label: 'Warning',    count: counts.warning,    color: 'var(--warning)' },
        { key: 'suggestion', label: 'Suggestion', count: counts.suggestion, color: 'var(--info)' },
    ];
    return (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 sm:flex-wrap">
            {items.map(({ key, label, count, color }) => {
                const isActive = active === key;
                return (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onChange(key)}
                        className="btn shrink-0 transition active:scale-95"
                        style={{
                            padding: '0.375rem 0.75rem',
                            fontSize: '0.75rem',
                            backgroundColor: isActive ? 'rgba(99,102,241,0.15)' : 'var(--bg-card)',
                            color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                            border: `1px solid ${isActive ? 'rgba(99,102,241,0.40)' : 'var(--border)'}`,
                        }}
                    >
                        {color && <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />}
                        {label}
                        <span
                            className="ml-1 rounded-full px-1.5 py-px text-[10px]"
                            style={{
                                backgroundColor: 'var(--bg-primary)',
                                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                            }}
                        >{count}</span>
                    </button>
                );
            })}
        </div>
    );
}

function DiffViewer({ pullRequestId }) {
    const [state, setState] = useState({ loading: true, diff: '', error: null });

    useEffect(() => {
        let cancelled = false;
        fetch(`/reviews/${pullRequestId}/diff`, { headers: { Accept: 'text/plain' } })
            .then(async (r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const t = await r.text();
                if (!cancelled) setState({ loading: false, diff: t, error: null });
            })
            .catch((e) => !cancelled && setState({ loading: false, diff: '', error: e.message }));
        return () => { cancelled = true; };
    }, [pullRequestId]);

    if (state.loading) return <div className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Loading diff…</div>;
    if (state.error) return (
        <div className="rounded-md p-4 text-sm"
            style={{ backgroundColor: 'rgba(239,68,68,0.10)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.30)' }}>
            Failed to load diff: {state.error}
        </div>
    );
    if (!state.diff) return <div className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Empty diff.</div>;

    const lines = state.diff.split('\n');
    return (
        <pre
            className="max-h-[70vh] overflow-auto rounded-md p-3 text-xs leading-5"
            style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}
        >
            {lines.map((line, i) => {
                let color = 'var(--text-secondary)';
                let bg = 'transparent';
                if (line.startsWith('+++') || line.startsWith('---')) { color = 'var(--text-primary)'; }
                else if (line.startsWith('@@')) { color = 'var(--accent)'; }
                else if (line.startsWith('+'))  { color = 'var(--success)'; bg = 'rgba(34,197,94,0.06)'; }
                else if (line.startsWith('-'))  { color = 'var(--danger)';  bg = 'rgba(239,68,68,0.06)'; }
                return (
                    <div key={i} className="whitespace-pre font-mono" style={{ color, backgroundColor: bg }}>
                        {line || ' '}
                    </div>
                );
            })}
        </pre>
    );
}

export default function Show({ pullRequest, review }) {
    const [activeTab, setActiveTab] = useState('security');
    const [severity, setSeverity] = useState('all');
    const [reanalyzing, setReanalyzing] = useState(false);

    const issuesByLayer = useMemo(() => ({
        security:     review?.security_issues     ?? [],
        performance:  review?.performance_issues  ?? [],
        code_quality: review?.code_quality_issues ?? [],
    }), [review]);

    // suggested_fixes is now stored as { fixes: [...] } — flat list for the Auto-Fixes tab.
    const fixes = useMemo(() => {
        const raw = review?.suggested_fixes;
        if (Array.isArray(raw)) return raw;
        if (Array.isArray(raw?.fixes)) return raw.fixes;
        return [];
    }, [review]);

    const filterIssues = (list) =>
        severity === 'all' ? list : list.filter((i) => (i.severity || 'suggestion') === severity);

    const countAcross = (sev) => {
        let n = 0;
        for (const list of Object.values(issuesByLayer)) {
            for (const i of list) if (sev === 'all' || (i.severity || 'suggestion') === sev) n++;
        }
        return n;
    };

    const counts = {
        all:        countAcross('all'),
        critical:   countAcross('critical'),
        warning:    countAcross('warning'),
        suggestion: countAcross('suggestion'),
    };

    const reanalyze = () => {
        setReanalyzing(true);
        router.post(`/reviews/${pullRequest.id}/re-analyze`, {}, {
            preserveScroll: true,
            onFinish: () => setReanalyzing(false),
        });
    };

    // Auto-poll while review is in flight so the user doesn't have to refresh.
    const inFlight = pullRequest.status === 'pending' || pullRequest.status === 'analyzing';
    useEffect(() => {
        if (!inFlight) return;
        const id = setInterval(() => {
            router.reload({
                only: ['pullRequest', 'review', 'flash'],
                preserveScroll: true,
                preserveState: true,
            });
        }, 5000);
        return () => clearInterval(id);
    }, [inFlight]);

    const githubPrUrl = pullRequest.diff_url?.replace('.diff', '') || (pullRequest.repository?.full_name
        ? `https://github.com/${pullRequest.repository.full_name}/pull/${pullRequest.pr_number}`
        : null);

    return (
        <AuthenticatedLayout
            header={
                <div className="flex items-center justify-between gap-2">
                    <Link
                        href="/dashboard"
                        className="btn btn-ghost min-h-[44px] transition active:scale-95"
                        style={{ padding: '0.375rem 0.625rem' }}
                        aria-label="Back to dashboard"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        <span className="hidden sm:inline">Back</span>
                    </Link>
                    <div className="flex items-center gap-2">
                        <a
                            href={`/reviews/${pullRequest.id}/export`}
                            className="btn btn-secondary min-h-[44px] transition active:scale-95"
                            aria-label="Export PDF"
                        >
                            <Download className="h-4 w-4" />
                            <span className="hidden sm:inline">Export PDF</span>
                        </a>
                        <button
                            type="button"
                            onClick={reanalyze}
                            disabled={reanalyzing}
                            className="btn btn-primary min-h-[44px] transition active:scale-95"
                        >
                            <RefreshCw className={`h-4 w-4 ${reanalyzing ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline">{reanalyzing ? 'Analyzing…' : 'Re-analyze'}</span>
                        </button>
                    </div>
                </div>
            }
        >
            <Head title={`Review · ${pullRequest.title}`} />

            <div className="space-y-6">
                {/* ── Header card ─────────────────────────────────────── */}
                <div className="card-flat p-4 sm:p-6">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 flex-1 order-2 lg:order-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                                {githubPrUrl ? (
                                    <a href={githubPrUrl} target="_blank" rel="noreferrer"
                                        className="inline-flex max-w-full items-center gap-1 truncate font-mono hover:opacity-80"
                                        style={{ color: 'var(--text-secondary)' }}>
                                        <span className="truncate">{pullRequest.repository?.full_name}</span>
                                        <ExternalLink className="h-3 w-3 shrink-0" />
                                    </a>
                                ) : (
                                    <span className="truncate font-mono">{pullRequest.repository?.full_name}</span>
                                )}
                                <ChevronRight className="h-3 w-3" />
                                <span>PR #{pullRequest.pr_number}</span>
                            </div>
                            <h1 className="mt-1 break-words text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">{pullRequest.title}</h1>
                            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                                <span className="inline-flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                                    by <AuthorAvatar login={pullRequest.author} /><span style={{ color: 'var(--text-primary)' }}>{pullRequest.author}</span>
                                </span>
                                <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    <code className="rounded font-mono"
                                        style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)', padding: '0.125rem 0.375rem' }}>
                                        {pullRequest.head_branch}
                                    </code>
                                    <ArrowRight className="h-3 w-3" style={{ color: 'var(--text-muted)' }} />
                                    <code className="rounded font-mono"
                                        style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)', padding: '0.125rem 0.375rem' }}>
                                        {pullRequest.base_branch}
                                    </code>
                                </span>
                                <StatusPill status={pullRequest.status} />
                            </div>
                            {pullRequest.detected_languages?.length > 0 && (
                                <div className="mt-3">
                                    <LanguageBadges languages={pullRequest.detected_languages} />
                                </div>
                            )}
                        </div>
                        <div className="order-1 flex justify-center lg:order-2 lg:shrink-0">
                            <ScoreCircle score={review?.overall_score ?? null} />
                        </div>
                    </div>
                </div>

                {/* ── Summary card ────────────────────────────────────── */}
                {review?.summary && (
                    <div className="card">
                        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                            AI Summary
                        </h2>
                        <p className="whitespace-pre-line text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                            {review.summary}
                        </p>
                        {review.ai_model_used && (
                            <div className="mt-3">
                                <span
                                    className="badge"
                                    style={{
                                        backgroundColor: 'var(--bg-hover)',
                                        color: 'var(--text-secondary)',
                                        borderColor: 'var(--border)',
                                    }}
                                >
                                    {review.ai_model_used}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {!review && inFlight && (
                    <div
                        className="card flex items-start gap-3 text-sm"
                        style={{ color: 'var(--warning)', borderColor: 'rgba(245,158,11,0.30)' }}
                    >
                        <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />
                        <div>
                            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                Review in progress — typically takes 15-30 seconds
                            </p>
                            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                This page auto-refreshes every 5 seconds. No need to do anything — results will appear here when the AI finishes.
                            </p>
                        </div>
                    </div>
                )}

                {pullRequest.status === 'failed' && (
                    <div
                        className="card flex items-start gap-3 text-sm"
                        style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.30)' }}
                    >
                        <Info className="mt-0.5 h-5 w-5 shrink-0" />
                        <div>
                            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                Review failed
                            </p>
                            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                The AI model returned malformed output. This is a known limitation of the free OpenRouter model — use the <strong>Re-analyze</strong> button at the top right to retry. Retries usually succeed.
                            </p>
                        </div>
                    </div>
                )}

                {/* ── Tabs ────────────────────────────────────────────── */}
                {review && (
                    <div className="card-flat overflow-hidden">
                        <div className="border-b" style={{ borderColor: 'var(--border)' }}>
                            <nav className="-mx-px flex gap-1 overflow-x-auto px-3" aria-label="Review tabs" style={{ scrollbarWidth: 'thin' }}>
                                {LAYERS.map((tab) => {
                                    let count = null;
                                    if (tab.key === 'fixes')      count = fixes.length;
                                    else if (tab.key !== 'diff')  count = issuesByLayer[tab.key].length;
                                    const isActive = activeTab === tab.key;
                                    return (
                                        <button
                                            key={tab.key}
                                            type="button"
                                            onClick={() => setActiveTab(tab.key)}
                                            className={`tab-item shrink-0 ${isActive ? 'tab-item-active' : ''}`}
                                        >
                                            {tab.label}
                                            {count !== null && (
                                                <span
                                                    className="rounded-full px-1.5 text-[10px]"
                                                    style={{
                                                        backgroundColor: 'var(--bg-hover)',
                                                        color: 'var(--text-secondary)',
                                                    }}
                                                >{count}</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </nav>
                        </div>

                        {activeTab !== 'diff' && activeTab !== 'fixes' && (
                            <div className="border-b px-5 py-3"
                                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                                <SeverityFilters counts={counts} active={severity} onChange={setSeverity} />
                            </div>
                        )}

                        <div className="p-5">
                            {activeTab === 'diff' ? (
                                <DiffViewer pullRequestId={pullRequest.id} />
                            ) : activeTab === 'fixes' ? (
                                <FixesTab fixes={fixes} />
                            ) : (() => {
                                const filtered = filterIssues(issuesByLayer[activeTab]);
                                if (filtered.length === 0) {
                                    return (
                                        <div
                                            className="rounded-md p-4 text-sm"
                                            style={{
                                                backgroundColor: 'rgba(34,197,94,0.10)',
                                                color: 'var(--success)',
                                                border: '1px solid rgba(34,197,94,0.30)',
                                            }}
                                        >
                                            ✓ No {severity === 'all' ? '' : severity + ' '}issues found in this category.
                                        </div>
                                    );
                                }
                                return (
                                    <ul className="space-y-3">
                                        {filtered.map((issue, idx) => (
                                            <li key={`${activeTab}-${idx}`}><IssueCard issue={issue} /></li>
                                        ))}
                                    </ul>
                                );
                            })()}
                        </div>

                        {/* Footer */}
                        <div
                            className="flex items-center justify-between border-t px-5 py-3 text-xs"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                        >
                            <span>
                                {review.ai_model_used ? <>Generated by <code className="font-mono" style={{ color: 'var(--text-secondary)' }}>{review.ai_model_used}</code></> : 'Generated by PRism'}
                            </span>
                            {githubPrUrl && (
                                <a
                                    href={githubPrUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 hover:opacity-80"
                                    style={{ color: 'var(--accent)' }}
                                >
                                    View on GitHub <ExternalLink className="h-3 w-3" />
                                </a>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
