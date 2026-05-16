import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, router } from '@inertiajs/react';
import { useEffect, useMemo, useState } from 'react';

const SEV = {
    critical:   { cls: 'bg-bad/10 text-bad ring-bad/30', dot: '#ef4444' },
    warning:    { cls: 'bg-warn/10 text-warn ring-warn/30', dot: '#f59e0b' },
    suggestion: { cls: 'bg-brand-500/10 text-brand-300 ring-brand-500/30', dot: '#6366f1' },
};

const LAYERS = [
    { key: 'security',     label: 'Security',     color: 'text-bad',     border: 'border-bad' },
    { key: 'performance',  label: 'Performance',  color: 'text-warn',    border: 'border-warn' },
    { key: 'code_quality', label: 'Code Quality', color: 'text-brand-400', border: 'border-brand-500' },
    { key: 'diff',         label: 'View Diff',    color: 'text-ink-text', border: 'border-ink-text' },
];

function Icon({ name, className = 'h-4 w-4' }) {
    const p = {
        copy:   <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
        check:  <path d="M20 6L9 17l-5-5"/>,
        refresh:<><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></>,
        pdf:    <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></>,
        ext:    <><path d="M14 3h7v7"/><path d="M10 14L21 3"/><path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"/></>,
        back:   <path d="M19 12H5M12 19l-7-7 7-7"/>,
        info:   <><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></>,
    };
    return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{p[name]}</svg>;
}

function CopyBtn({ text }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            type="button"
            onClick={async () => {
                try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
            }}
            className="btn-ghost px-2 py-1 text-xs"
        >
            {copied ? <><Icon name="check" className="h-3 w-3" />Copied</> : <><Icon name="copy" className="h-3 w-3" />Copy</>}
        </button>
    );
}

function ScoreCircle({ score }) {
    const value = (typeof score === 'number') ? Math.max(0, Math.min(100, score)) : null;
    if (value === null) {
        return (
            <div className="grid h-32 w-32 place-items-center rounded-full bg-ink-muted text-sm text-ink-faint ring-1 ring-ink-border">
                No score
            </div>
        );
    }

    const stroke = value > 70 ? '#22c55e' : value >= 40 ? '#f59e0b' : '#ef4444';
    const colorText = value > 70 ? 'text-ok' : value >= 40 ? 'text-warn' : 'text-bad';
    const r = 56, c = 2 * Math.PI * r;
    const offset = c - (value / 100) * c;

    return (
        <div className="relative h-32 w-32 animate-score-in">
            <svg viewBox="0 0 128 128" className="h-32 w-32 -rotate-90">
                <circle cx="64" cy="64" r={r} stroke="#262635" strokeWidth="10" fill="none" />
                <circle
                    cx="64" cy="64" r={r}
                    stroke={stroke} strokeWidth="10" strokeLinecap="round" fill="none"
                    strokeDasharray={c}
                    strokeDashoffset={offset}
                    style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.16,1,0.3,1)' }}
                />
            </svg>
            <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                    <div className={`text-3xl font-bold ${colorText}`}>{value}</div>
                    <div className="text-[10px] uppercase tracking-wider text-ink-faint">/ 100</div>
                </div>
            </div>
        </div>
    );
}

function IssueCard({ issue, fix }) {
    const sev = SEV[issue.severity] ?? SEV.suggestion;
    return (
        <div className="rounded-card border border-ink-border bg-ink-bg/40 p-4 transition hover:border-ink-muted">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    {(issue.file || issue.line) && (
                        <div className="mb-2 inline-flex items-center gap-1 rounded-md bg-ink-muted px-2 py-0.5 font-mono text-[11px] text-ink-dim">
                            {issue.file || 'unknown'}
                            {issue.line ? <span className="text-ink-faint">:{issue.line}</span> : null}
                        </div>
                    )}
                    <p className="text-sm text-ink-text">{issue.comment}</p>
                </div>
                <span className={`badge ${sev.cls}`}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: sev.dot }} />
                    {issue.severity || 'suggestion'}
                </span>
            </div>

            {fix?.suggested_fix && (
                <div className="mt-3 rounded-btn border border-ink-border bg-[#0b0b10] p-3">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-400">Suggested fix</span>
                        <CopyBtn text={fix.suggested_fix} />
                    </div>
                    <pre className="overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed text-ink-text">{fix.suggested_fix}</pre>
                </div>
            )}
        </div>
    );
}

function SeverityFilters({ counts, active, onChange }) {
    const items = [
        { key: 'all',        label: 'All',        count: counts.all },
        { key: 'critical',   label: 'Critical',   count: counts.critical },
        { key: 'warning',    label: 'Warning',    count: counts.warning },
        { key: 'suggestion', label: 'Suggestion', count: counts.suggestion },
    ];
    return (
        <div className="flex flex-wrap gap-2">
            {items.map(({ key, label, count }) => {
                const isActive = active === key;
                const dotColor = key === 'critical' ? '#ef4444' : key === 'warning' ? '#f59e0b' : key === 'suggestion' ? '#6366f1' : null;
                return (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onChange(key)}
                        className={`inline-flex items-center gap-1.5 rounded-btn px-3 py-1.5 text-xs font-medium ring-1 transition ${
                            isActive
                                ? 'bg-brand-500/15 text-brand-300 ring-brand-500/40'
                                : 'bg-ink-card text-ink-dim ring-ink-border hover:text-ink-text'
                        }`}
                    >
                        {dotColor && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dotColor }} />}
                        {label}
                        <span className="ml-1 rounded-full bg-ink-bg px-1.5 text-[10px] text-ink-dim">{count}</span>
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

    if (state.loading) return <div className="py-10 text-center text-sm text-ink-dim">Loading diff…</div>;
    if (state.error) return <div className="rounded-btn bg-bad/10 p-4 text-sm text-bad ring-1 ring-bad/30">Failed to load diff: {state.error}</div>;
    if (!state.diff) return <div className="py-10 text-center text-sm text-ink-dim">Empty diff.</div>;

    const lines = state.diff.split('\n');
    return (
        <pre className="max-h-[70vh] overflow-auto rounded-btn border border-ink-border bg-[#0b0b10] p-3 text-xs leading-5">
            {lines.map((line, i) => {
                let cls = 'text-ink-dim';
                if (line.startsWith('+++') || line.startsWith('---')) cls = 'text-ink-text font-semibold';
                else if (line.startsWith('@@')) cls = 'text-brand-400';
                else if (line.startsWith('+')) cls = 'text-ok bg-ok/5';
                else if (line.startsWith('-')) cls = 'text-bad bg-bad/5';
                return <div key={i} className={`whitespace-pre font-mono ${cls}`}>{line || ' '}</div>;
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

    const fixesByLayer = useMemo(() => {
        const out = { security: {}, performance: {}, code_quality: {} };
        const fixes = review?.suggested_fixes?.fixes ?? review?.suggested_fixes ?? [];
        if (Array.isArray(fixes)) {
            for (const f of fixes) {
                const layer = f.layer || 'code_quality';
                if (out[layer]) out[layer][f.issue_index] = f;
            }
        }
        return out;
    }, [review]);

    const filterIssues = (list) =>
        severity === 'all' ? list : list.filter((i) => (i.severity || 'suggestion') === severity);

    const countAcross = (sev) => {
        let n = 0;
        for (const list of Object.values(issuesByLayer)) {
            for (const i of list) {
                if (sev === 'all' || (i.severity || 'suggestion') === sev) n++;
            }
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
        router.post(`/reviews/${pullRequest.id}/reanalyze`, {}, {
            preserveScroll: true,
            onFinish: () => setReanalyzing(false),
        });
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex items-center justify-between gap-4">
                    <Link href="/dashboard" className="btn-ghost"><Icon name="back" className="h-4 w-4" />Back</Link>
                    <div className="flex items-center gap-2">
                        <a
                            href={`/reviews/${pullRequest.id}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-secondary"
                        >
                            <Icon name="pdf" className="h-4 w-4" /> Export PDF
                        </a>
                        <button type="button" onClick={reanalyze} disabled={reanalyzing} className="btn-primary">
                            <Icon name="refresh" className={`h-4 w-4 ${reanalyzing ? 'animate-spin' : ''}`} />
                            {reanalyzing ? 'Analyzing…' : 'Re-analyze'}
                        </button>
                    </div>
                </div>
            }
        >
            <Head title={`Review · ${pullRequest.title}`} />

            <div className="space-y-6">
                {/* PR header card */}
                <div className="card p-6">
                    <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-xs text-ink-dim">
                                <span className="font-mono">{pullRequest.repository?.full_name}</span>
                                <span>·</span>
                                <span>PR #{pullRequest.pr_number}</span>
                            </div>
                            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-text">{pullRequest.title}</h1>
                            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                                <span className="text-ink-dim">
                                    by <span className="text-ink-text">{pullRequest.author}</span>
                                </span>
                                <span className="inline-flex items-center gap-1 font-mono text-ink-dim">
                                    <span className="rounded bg-ink-muted px-1.5 py-0.5 text-ink-text">{pullRequest.head_branch}</span>
                                    <span>→</span>
                                    <span className="rounded bg-ink-muted px-1.5 py-0.5 text-ink-text">{pullRequest.base_branch}</span>
                                </span>
                                <span className="badge bg-ink-muted text-ink-dim ring-ink-border">{pullRequest.status}</span>
                                {pullRequest.diff_url && (
                                    <a href={pullRequest.diff_url.replace('.diff','')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-400 hover:text-brand-300">
                                        View on GitHub <Icon name="ext" className="h-3 w-3" />
                                    </a>
                                )}
                            </div>
                        </div>
                        <div className="md:shrink-0">
                            <ScoreCircle score={review?.overall_score ?? null} />
                        </div>
                    </div>

                    {review?.summary && (
                        <div className="mt-6 rounded-btn border border-ink-border bg-ink-bg/40 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wider text-ink-dim">Summary</p>
                            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-text">{review.summary}</p>
                        </div>
                    )}
                </div>

                {!review && (
                    <div className="card flex items-center gap-3 p-4 text-sm text-warn ring-warn/30">
                        <Icon name="info" className="h-5 w-5 shrink-0 text-warn" />
                        The review is still being generated or has not run yet. The PR status will move to <strong>completed</strong> when it finishes.
                    </div>
                )}

                {review && (
                    <div className="card overflow-hidden">
                        <div className="border-b border-ink-border">
                            <nav className="flex gap-1 px-3" aria-label="Review tabs">
                                {LAYERS.map((tab) => {
                                    const count = tab.key === 'diff' ? null : issuesByLayer[tab.key].length;
                                    const isActive = activeTab === tab.key;
                                    return (
                                        <button
                                            key={tab.key}
                                            type="button"
                                            onClick={() => setActiveTab(tab.key)}
                                            className={`relative inline-flex items-center gap-2 px-3 py-3 text-sm font-medium transition ${
                                                isActive ? `${tab.color}` : 'text-ink-dim hover:text-ink-text'
                                            }`}
                                        >
                                            {tab.label}
                                            {count !== null && (
                                                <span className="rounded-full bg-ink-muted px-1.5 text-[10px] text-ink-dim">{count}</span>
                                            )}
                                            {isActive && <span className={`absolute inset-x-2 -bottom-px h-px bg-current`} />}
                                        </button>
                                    );
                                })}
                            </nav>
                        </div>

                        {activeTab !== 'diff' && (
                            <div className="border-b border-ink-border bg-ink-bg/30 px-5 py-3">
                                <SeverityFilters counts={counts} active={severity} onChange={setSeverity} />
                            </div>
                        )}

                        <div className="p-5">
                            {activeTab === 'diff' ? (
                                <DiffViewer pullRequestId={pullRequest.id} />
                            ) : (() => {
                                const filtered = filterIssues(issuesByLayer[activeTab]);
                                if (filtered.length === 0) {
                                    return (
                                        <div className="rounded-btn bg-ok/10 p-4 text-sm text-ok ring-1 ring-ok/30">
                                            ✓ No {severity === 'all' ? '' : severity + ' '}issues detected in this layer.
                                        </div>
                                    );
                                }
                                return (
                                    <ul className="space-y-3">
                                        {filtered.map((issue, idx) => {
                                            const originalIdx = issuesByLayer[activeTab].indexOf(issue);
                                            const fix = fixesByLayer[activeTab][originalIdx];
                                            return <li key={`${activeTab}-${idx}`}><IssueCard issue={issue} fix={fix} /></li>;
                                        })}
                                    </ul>
                                );
                            })()}
                        </div>

                        {review.ai_model_used && (
                            <div className="border-t border-ink-border bg-ink-bg/30 px-5 py-3 text-xs text-ink-faint">
                                Generated by <code className="font-mono text-ink-dim">{review.ai_model_used}</code>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
