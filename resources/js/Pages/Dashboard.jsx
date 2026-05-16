import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link } from '@inertiajs/react';

const STATUS = {
    pending:   { label: 'Pending',   cls: 'bg-warn/10 text-warn ring-warn/30' },
    analyzing: { label: 'Analyzing', cls: 'bg-brand-500/15 text-brand-300 ring-brand-500/30' },
    completed: { label: 'Completed', cls: 'bg-ok/10 text-ok ring-ok/30' },
    failed:    { label: 'Failed',    cls: 'bg-bad/10 text-bad ring-bad/30' },
};

function StatusBadge({ status }) {
    const s = STATUS[status] ?? { label: status, cls: 'bg-ink-muted text-ink-dim ring-ink-border' };
    return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

function Icon({ name, className = 'h-5 w-5' }) {
    const paths = {
        repo:    <><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4"/><path d="M3 17l9 4 9-4"/></>,
        pr:      <><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M6 9v6"/><path d="M18 9V7a2 2 0 0 0-2-2h-3"/></>,
        score:   <><path d="M12 2L15 8.5 22 9.3l-5 4.9 1.2 7-6.2-3.3-6.2 3.3 1.2-7-5-4.9 7-0.8L12 2z"/></>,
        plus:    <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    };
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {paths[name]}
        </svg>
    );
}

function StatCard({ icon, label, value, hint, accent = 'brand' }) {
    const accents = {
        brand: 'text-brand-400 bg-brand-500/10 ring-brand-500/20',
        ok:    'text-ok bg-ok/10 ring-ok/20',
        warn:  'text-warn bg-warn/10 ring-warn/20',
    };
    return (
        <div className="card p-5">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-xs uppercase tracking-wider text-ink-dim">{label}</p>
                    <p className="mt-2 text-3xl font-semibold text-ink-text">{value}</p>
                    {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
                </div>
                <div className={`grid h-9 w-9 place-items-center rounded-btn ring-1 ${accents[accent]}`}>
                    <Icon name={icon} className="h-4 w-4" />
                </div>
            </div>
        </div>
    );
}

function relative(iso) {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        const s = Math.floor((Date.now() - d.getTime()) / 1000);
        if (s < 60) return 'just now';
        if (s < 3600) return `${Math.floor(s / 60)}m ago`;
        if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
        if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
        return d.toLocaleDateString();
    } catch { return iso; }
}

function ScorePill({ score }) {
    if (score === null || score === undefined) return <span className="text-ink-faint">—</span>;
    const color = score > 70 ? 'text-ok' : score >= 40 ? 'text-warn' : 'text-bad';
    return <span className={`font-mono text-sm font-semibold ${color}`}>{score}</span>;
}

export default function Dashboard({
    total_repos = 0,
    total_prs = 0,
    avg_score = null,
    recent_prs = [],
}) {
    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
                        <p className="mt-1 text-sm text-ink-dim">AI-powered pull request reviews at a glance.</p>
                    </div>
                    <Link href="/repositories" className="btn-primary">
                        <Icon name="plus" className="h-4 w-4" />
                        Connect Repository
                    </Link>
                </div>
            }
        >
            <Head title="Dashboard" />

            <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <StatCard icon="repo"  label="Connected Repos" value={total_repos}              accent="brand" />
                    <StatCard icon="pr"    label="PRs Reviewed"     value={total_prs}                accent="ok" />
                    <StatCard icon="score" label="Average Score"    value={avg_score ?? '—'} hint="Across completed reviews" accent="warn" />
                </div>

                <div className="card overflow-hidden">
                    <div className="flex items-center justify-between border-b border-ink-border px-5 py-3">
                        <h2 className="text-sm font-semibold text-ink-text">Recent Pull Requests</h2>
                        <span className="text-xs text-ink-faint">Showing last {recent_prs.length}</span>
                    </div>

                    {recent_prs.length === 0 ? (
                        <div className="px-5 py-16 text-center">
                            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-ink-muted text-ink-dim">
                                <Icon name="pr" />
                            </div>
                            <p className="mt-4 text-sm text-ink-text">No pull requests yet.</p>
                            <p className="mt-1 text-xs text-ink-dim">Connect a repo and open a PR to get an AI review.</p>
                            <Link href="/repositories" className="btn-primary mt-5"><Icon name="plus" className="h-4 w-4" />Connect a Repository</Link>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead>
                                    <tr className="text-left text-xs uppercase tracking-wider text-ink-dim">
                                        <th className="px-5 py-3 font-medium">Repo</th>
                                        <th className="px-5 py-3 font-medium">PR</th>
                                        <th className="px-5 py-3 font-medium">Author</th>
                                        <th className="px-5 py-3 font-medium">Status</th>
                                        <th className="px-5 py-3 font-medium">Score</th>
                                        <th className="px-5 py-3 font-medium">Created</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-ink-border">
                                    {recent_prs.map((pr) => (
                                        <tr key={pr.id} className="text-sm transition hover:bg-ink-muted/40">
                                            <td className="px-5 py-3 font-mono text-xs text-ink-dim">{pr.repository?.full_name ?? '—'}</td>
                                            <td className="max-w-md px-5 py-3">
                                                <Link href={`/reviews/${pr.id}`} className="block truncate font-medium text-ink-text hover:text-brand-400">
                                                    <span className="text-ink-faint">#{pr.pr_number}</span> {pr.title}
                                                </Link>
                                            </td>
                                            <td className="whitespace-nowrap px-5 py-3 text-ink-dim">{pr.author}</td>
                                            <td className="whitespace-nowrap px-5 py-3"><StatusBadge status={pr.status} /></td>
                                            <td className="whitespace-nowrap px-5 py-3"><ScorePill score={pr.score} /></td>
                                            <td className="whitespace-nowrap px-5 py-3 text-xs text-ink-dim">{relative(pr.created_at)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
