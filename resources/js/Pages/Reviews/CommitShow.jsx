import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowLeft,
    Check,
    ChevronRight,
    Copy,
    ExternalLink,
    GitCommit,
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
];

const LAYER_LABEL = {
    security:     { label: 'security',     color: 'var(--danger)' },
    performance:  { label: 'performance',  color: 'var(--warning)' },
    code_quality: { label: 'code quality', color: 'var(--accent)' },
};

function SeverityBadge({ severity }) {
    const s = SEV[severity] ?? SEV.suggestion;
    return (
        <span className="badge" style={{
            color: s.color,
            background: `color-mix(in srgb, ${s.color} 12%, transparent)`,
            borderColor: `color-mix(in srgb, ${s.color} 28%, transparent)`,
        }}>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
        </span>
    );
}

function StatusPill({ status }) {
    const s = STATUS[status] ?? { color: 'var(--text-muted)' };
    return (
        <span className="inline-flex items-center gap-2 text-xs font-medium">
            {s.pulse
                ? <span className="pulse-dot" />
                : <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />}
            <span style={{ color: 'var(--text-primary)' }}>{status}</span>
        </span>
    );
}

function LanguageBadges({ languages = [] }) {
    if (!languages.length) return null;
    return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Languages:</span>
            {languages.map((lang) => (
                <span key={lang} className="badge" style={{
                    backgroundColor: 'rgba(99,102,241,0.10)',
                    color: 'var(--accent)',
                    borderColor: 'rgba(99,102,241,0.30)',
                }}>{lang}</span>
            ))}
        </span>
    );
}

function ScoreCircle({ score }) {
    const value = typeof score === 'number' ? Math.max(0, Math.min(100, score)) : null;
    if (value === null) {
        return (
            <div className="grid h-32 w-32 place-items-center rounded-full text-sm"
                style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                No score
            </div>
        );
    }
    let stroke = 'var(--danger)';
    if (value > 70) stroke = 'var(--success)';
    else if (value >= 40) stroke = 'var(--warning)';

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

function IssueCard({ issue }) {
    return (
        <div className="rounded-md p-4 transition" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    {(issue.file || issue.line) && (
                        <div className="mb-2 flex flex-wrap items-center gap-1.5">
                            {issue.file && (
                                <span className="inline-flex items-center gap-1 rounded font-mono text-[11px]"
                                    style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)', padding: '0.125rem 0.5rem' }}>
                                    {issue.file}
                                </span>
                            )}
                            {issue.line ? (
                                <span className="inline-flex items-center gap-1 rounded font-mono text-[11px] font-semibold"
                                    style={{
                                        backgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                                        color: 'var(--accent)',
                                        border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
                                        padding: '0.125rem 0.5rem',
                                    }}>
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

function CodeBlock({ label, code, variant }) {
    const accentColor = variant === 'bad' ? 'var(--danger)' : 'var(--success)';
    const bgTint      = variant === 'bad' ? 'rgba(239,68,68,0.07)' : 'rgba(34,197,94,0.07)';
    const borderTint  = variant === 'bad' ? 'rgba(239,68,68,0.30)' : 'rgba(34,197,94,0.30)';
    return (
        <div className="rounded-md overflow-hidden" style={{ border: `1px solid ${borderTint}` }}>
            <div className="flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{ backgroundColor: bgTint, color: accentColor, borderBottom: `1px solid ${borderTint}` }}>
                <span className="flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
                    {label}
                </span>
            </div>
            <pre className="overflow-x-auto whitespace-pre p-3 text-xs leading-relaxed font-mono"
                style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                {code || <em style={{ color: 'var(--text-muted)' }}>// (empty)</em>}
            </pre>
        </div>
    );
}

function FixCard({ fix, onCopy }) {
    const layerInfo = LAYER_LABEL[fix.layer] ?? LAYER_LABEL.code_quality;
    return (
        <div className="rounded-md p-4" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div className="flex flex-wrap items-center gap-2">
                {fix.file && (
                    <span className="inline-flex items-center gap-1 rounded font-mono text-[11px]"
                        style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)', padding: '0.125rem 0.5rem' }}>
                        {fix.file}
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
                <span className="badge" style={{
                    color: layerInfo.color,
                    background: `color-mix(in srgb, ${layerInfo.color} 12%, transparent)`,
                    borderColor: `color-mix(in srgb, ${layerInfo.color} 28%, transparent)`,
                }}>{layerInfo.label}</span>
                <div className="ml-auto">
                    <button type="button" onClick={() => onCopy(fix.suggested_code)}
                        className="btn btn-secondary min-h-[36px] transition active:scale-95"
                        style={{ padding: '0.25rem 0.625rem', fontSize: '0.75rem' }}>
                        <Copy className="h-3.5 w-3.5" /> Copy Fix
                    </button>
                </div>
            </div>
            {fix.original_issue && (
                <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>{fix.original_issue}</p>
            )}
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <CodeBlock label="Current Code"  code={fix.problematic_code} variant="bad" />
                <CodeBlock label="Suggested Fix" code={fix.suggested_code}   variant="good" />
            </div>
            {fix.explanation && (
                <div className="mt-3 rounded p-3 text-xs leading-relaxed"
                    style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
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
        try { await navigator.clipboard.writeText(text ?? ''); setCopyToast(true); setTimeout(() => setCopyToast(false), 2000); } catch {}
    };
    if (!fixes || !fixes.length) {
        return (
            <div className="text-center py-10">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full"
                    style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                    <Wand2 className="h-6 w-6" />
                </div>
                <p className="mt-4 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No auto-fixes generated.</p>
            </div>
        );
    }
    return (
        <div className="relative">
            <ul className="space-y-4">
                {fixes.map((fix, idx) => <li key={idx}><FixCard fix={fix} onCopy={copy} /></li>)}
            </ul>
            <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md px-4 py-2 text-sm transition-all duration-200"
                style={{
                    backgroundColor: 'var(--bg-card)', color: 'var(--success)',
                    border: '1px solid rgba(34,197,94,0.35)',
                    opacity: copyToast ? 1 : 0,
                    transform: `translate(-50%, ${copyToast ? '0' : '8px'})`,
                    pointerEvents: copyToast ? 'auto' : 'none',
                    boxShadow: '0 12px 32px -8px rgba(0,0,0,0.5)',
                }}>
                <span className="inline-flex items-center gap-2"><Check className="h-4 w-4" /> Copied to clipboard</span>
            </div>
        </div>
    );
}

export default function CommitShow({ commitReview: cr }) {
    const [activeTab, setActiveTab] = useState('security');
    const [severity, setSeverity]   = useState('all');
    const [reanalyzing, setReanalyzing] = useState(false);

    const reanalyze = () => {
        setReanalyzing(true);
        router.post(`/commits/${cr.id}/re-analyze`, {}, {
            preserveScroll: true,
            onFinish: () => setReanalyzing(false),
        });
    };

    // Auto-poll while review is in flight so the user doesn't have to refresh
    // manually. Stops automatically once status flips to completed or failed.
    const inFlight = cr.status === 'pending' || cr.status === 'analyzing';
    useEffect(() => {
        if (!inFlight) return;
        const id = setInterval(() => {
            router.reload({
                only: ['commitReview', 'flash'],
                preserveScroll: true,
                preserveState: true,
            });
        }, 5000);
        return () => clearInterval(id);
    }, [inFlight]);

    const issuesByLayer = useMemo(() => ({
        security:     cr?.security_issues     ?? [],
        performance:  cr?.performance_issues  ?? [],
        code_quality: cr?.code_quality_issues ?? [],
    }), [cr]);

    const fixes = useMemo(() => {
        const raw = cr?.suggested_fixes;
        if (Array.isArray(raw)) return raw;
        if (Array.isArray(raw?.fixes)) return raw.fixes;
        return [];
    }, [cr]);

    const filterIssues = (list) =>
        severity === 'all' ? list : list.filter((i) => (i.severity || 'suggestion') === severity);

    return (
        <AuthenticatedLayout
            header={
                <div className="flex items-center justify-between gap-2">
                    <Link href="/dashboard" className="btn btn-ghost min-h-[44px] transition active:scale-95" style={{ padding: '0.375rem 0.625rem' }}>
                        <ArrowLeft className="h-4 w-4" />
                        <span className="hidden sm:inline">Back</span>
                    </Link>
                    {cr.github_url && (
                        <a href={cr.github_url} target="_blank" rel="noreferrer"
                            className="btn btn-secondary min-h-[44px] transition active:scale-95">
                            <ExternalLink className="h-4 w-4" />
                            <span className="hidden sm:inline">View Commit on GitHub</span>
                        </a>
                    )}
                </div>
            }
        >
            <Head title={`Commit · ${cr.short_sha}`} />

            <div className="space-y-6">
                <div className="card-flat p-4 sm:p-6">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 flex-1 order-2 lg:order-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                                <span className="truncate font-mono">{cr.repository?.full_name}</span>
                                <ChevronRight className="h-3 w-3" />
                                <span className="inline-flex items-center gap-1">
                                    <GitCommit className="h-3 w-3" />
                                    <span className="font-mono">{cr.short_sha}</span>
                                </span>
                            </div>
                            <h1 className="mt-1 break-words text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
                                {cr.commit_message?.split('\n')[0] || '(no commit message)'}
                            </h1>
                            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                {cr.author && <span>by <span style={{ color: 'var(--text-primary)' }}>{cr.author}</span></span>}
                                {cr.branch && (
                                    <span className="inline-flex items-center gap-1">
                                        <code className="rounded font-mono" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)', padding: '0.125rem 0.375rem' }}>
                                            {cr.branch}
                                        </code>
                                    </span>
                                )}
                                <StatusPill status={cr.status} />
                            </div>
                            {cr.detected_languages?.length > 0 && (
                                <div className="mt-3">
                                    <LanguageBadges languages={cr.detected_languages} />
                                </div>
                            )}
                        </div>
                        <div className="order-1 flex justify-center lg:order-2 lg:shrink-0">
                            <ScoreCircle score={cr.overall_score ?? null} />
                        </div>
                    </div>
                </div>

                {cr.summary && (
                    <div className="card">
                        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                            AI Summary
                        </h2>
                        <p className="whitespace-pre-line text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>{cr.summary}</p>
                        {cr.ai_model_used && (
                            <div className="mt-3">
                                <span className="badge" style={{
                                    backgroundColor: 'var(--bg-hover)',
                                    color: 'var(--text-secondary)',
                                    borderColor: 'var(--border)',
                                }}>{cr.ai_model_used}</span>
                            </div>
                        )}
                    </div>
                )}

                {(cr.status === 'pending' || cr.status === 'analyzing') && (
                    <div className="card flex items-start gap-3 text-sm"
                        style={{ color: 'var(--warning)', borderColor: 'rgba(245,158,11,0.30)' }}>
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

                {cr.status === 'failed' && (
                    <div
                        className="card flex flex-col gap-3 text-sm sm:flex-row sm:items-center"
                        style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.30)' }}
                    >
                        <div className="flex items-start gap-3">
                            <Info className="mt-0.5 h-5 w-5 shrink-0" />
                            <div>
                                <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                    Review failed
                                </p>
                                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                    The AI model returned malformed JSON. This is a known limitation of the free OpenRouter model — retries usually succeed.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            disabled={reanalyzing}
                            onClick={reanalyze}
                            className="btn btn-primary min-h-[44px] shrink-0 transition active:scale-95 sm:ml-auto"
                        >
                            <RefreshCw className={`h-4 w-4 ${reanalyzing ? 'animate-spin' : ''}`} />
                            {reanalyzing ? 'Retrying…' : 'Re-analyze'}
                        </button>
                    </div>
                )}

                {cr.status === 'completed' && (
                    <div className="card-flat overflow-hidden">
                        <div className="border-b" style={{ borderColor: 'var(--border)' }}>
                            <nav className="-mx-px flex gap-1 overflow-x-auto px-3" aria-label="Review tabs">
                                {LAYERS.map((tab) => {
                                    const count = tab.key === 'fixes' ? fixes.length : issuesByLayer[tab.key].length;
                                    const isActive = activeTab === tab.key;
                                    return (
                                        <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
                                            className={`tab-item shrink-0 ${isActive ? 'tab-item-active' : ''}`}>
                                            {tab.label}
                                            <span className="rounded-full px-1.5 text-[10px]"
                                                style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>{count}</span>
                                        </button>
                                    );
                                })}
                            </nav>
                        </div>

                        <div className="p-5">
                            {activeTab === 'fixes' ? (
                                <FixesTab fixes={fixes} />
                            ) : (() => {
                                const list = filterIssues(issuesByLayer[activeTab]);
                                if (!list.length) return (
                                    <div className="rounded-md p-4 text-sm"
                                        style={{ backgroundColor: 'rgba(34,197,94,0.10)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.30)' }}>
                                        ✓ No issues found in this category.
                                    </div>
                                );
                                return (
                                    <ul className="space-y-3">
                                        {list.map((issue, idx) => <li key={idx}><IssueCard issue={issue} /></li>)}
                                    </ul>
                                );
                            })()}
                        </div>
                    </div>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
