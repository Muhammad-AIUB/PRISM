import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link } from '@inertiajs/react';
import {
    CategoryScale,
    Chart as ChartJS,
    Filler,
    Legend,
    LinearScale,
    LineElement,
    PointElement,
    Tooltip,
} from 'chart.js';
import {
    GitBranch,
    GitPullRequest,
    Plus,
    TrendingUp,
} from 'lucide-react';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const STATUS = {
    pending:   { label: 'Pending',   color: 'var(--warning)' },
    analyzing: { label: 'Analyzing', color: 'var(--info)',    pulse: true },
    completed: { label: 'Completed', color: 'var(--success)' },
    failed:    { label: 'Failed',    color: 'var(--danger)' },
};

function StatusPill({ status }) {
    const s = STATUS[status] ?? { label: status, color: 'var(--text-muted)' };
    return (
        <span className="inline-flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            {s.pulse ? (
                <span className="pulse-dot" />
            ) : (
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            )}
            {s.label}
        </span>
    );
}

function ScorePill({ score }) {
    if (score === null || score === undefined) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
    let color = 'var(--danger)';
    if (score > 70) color = 'var(--success)';
    else if (score >= 40) color = 'var(--warning)';
    return (
        <span
            className="inline-flex items-center rounded-full px-2 py-0.5 font-mono text-xs font-semibold"
            style={{
                color,
                backgroundColor: color.replace('var(--', 'rgba(') === color ? 'rgba(0,0,0,0.1)' : undefined,
                background: `color-mix(in srgb, ${color} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
            }}
        >
            {score}
        </span>
    );
}

function StatCard({ icon: Icon, label, value, hint }) {
    return (
        <div className="card flex items-start justify-between">
            <div>
                <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</p>
                <p className="mt-2 text-3xl font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</p>
                {hint && <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
            </div>
            <div
                className="grid h-9 w-9 place-items-center rounded-md"
                style={{
                    color: 'var(--accent)',
                    backgroundColor: 'rgba(99,102,241,0.12)',
                    border: '1px solid rgba(99,102,241,0.25)',
                }}
            >
                <Icon className="h-4 w-4" />
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

function ScoreTimeline({ timeline = [] }) {
    if (!timeline.length) return null;

    const labels = timeline.map((p) => {
        try { return new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
        catch { return ''; }
    });

    const data = {
        labels,
        datasets: [{
            label: 'Score',
            data: timeline.map((p) => p.score),
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99,102,241,0.15)',
            pointBackgroundColor: '#818cf8',
            pointRadius: 4,
            pointHoverRadius: 6,
            tension: 0.35,
            fill: true,
        }],
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: '#1a1a24',
                borderColor: '#2a2a36',
                borderWidth: 1,
                titleColor: '#f1f5f9',
                bodyColor: '#94a3b8',
                callbacks: {
                    title: (items) => timeline[items[0].dataIndex]?.pr || '',
                    label: (item) => ` Score: ${item.parsed.y}/100`,
                },
            },
        },
        scales: {
            x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(42,42,54,0.5)' } },
            y: { min: 0, max: 100, ticks: { color: '#64748b', stepSize: 25 }, grid: { color: 'rgba(42,42,54,0.5)' } },
        },
    };

    return <div className="h-64"><Line data={data} options={options} /></div>;
}

export default function Dashboard({
    total_repos = 0,
    total_prs = 0,
    avg_score = null,
    recent_prs = [],
    timeline = [],
}) {
    return (
        <AuthenticatedLayout
            header={
                <div className="flex items-end justify-between">
                    <div>
                        <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Overview</p>
                        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">Dashboard</h1>
                    </div>
                    <Link href="/repositories" className="btn-primary btn">
                        <Plus className="h-4 w-4" /> Connect Repository
                    </Link>
                </div>
            }
        >
            <Head title="Dashboard" />

            <div className="space-y-6">
                {/* Stat cards */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <StatCard icon={GitBranch}       label="Connected Repositories" value={total_repos} />
                    <StatCard icon={GitPullRequest}  label="Pull Requests Reviewed"  value={total_prs} />
                    <StatCard icon={TrendingUp}      label="Average Score"           value={avg_score ?? '—'} hint="Across completed reviews" />
                </div>

                {/* Timeline */}
                {timeline.length > 0 && (
                    <div className="card">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-sm font-semibold">Score Timeline</h2>
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {timeline.length} review{timeline.length === 1 ? '' : 's'}
                            </span>
                        </div>
                        <ScoreTimeline timeline={timeline} />
                    </div>
                )}

                {/* PR Table */}
                <div className="card-flat overflow-hidden">
                    <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
                        <h2 className="text-sm font-semibold">Recent Pull Requests</h2>
                        {recent_prs.length > 0 && (
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                Showing last {recent_prs.length}
                            </span>
                        )}
                    </div>

                    {recent_prs.length === 0 ? (
                        <div className="px-5 py-16 text-center">
                            <div
                                className="mx-auto grid h-14 w-14 place-items-center rounded-full"
                                style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}
                            >
                                <GitPullRequest className="h-6 w-6" />
                            </div>
                            <p className="mt-4 text-sm font-medium">No reviews yet</p>
                            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                                Connect a repository and open a PR to get an AI review.
                            </p>
                            <Link href="/repositories" className="btn-primary btn mt-5 inline-flex">
                                <Plus className="h-4 w-4" /> Connect Repository
                            </Link>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead>
                                    <tr className="text-left text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                                        <th className="px-5 py-3 font-medium">Repository</th>
                                        <th className="px-5 py-3 font-medium">PR Title</th>
                                        <th className="px-5 py-3 font-medium">Author</th>
                                        <th className="px-5 py-3 font-medium">Status</th>
                                        <th className="px-5 py-3 font-medium">Score</th>
                                        <th className="px-5 py-3 font-medium">Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recent_prs.map((pr) => (
                                        <tr
                                            key={pr.id}
                                            className="border-t text-sm transition-colors hover:bg-hover"
                                            style={{ borderColor: 'var(--border)' }}
                                        >
                                            <td className="whitespace-nowrap px-5 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                                                {pr.repository?.full_name ?? '—'}
                                            </td>
                                            <td className="max-w-md px-5 py-3">
                                                <Link
                                                    href={`/reviews/${pr.id}`}
                                                    className="block truncate font-medium"
                                                    style={{ color: 'var(--text-primary)' }}
                                                >
                                                    <span style={{ color: 'var(--text-muted)' }}>#{pr.pr_number}</span> {pr.title}
                                                </Link>
                                            </td>
                                            <td className="whitespace-nowrap px-5 py-3">
                                                <span className="inline-flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                                    <AuthorAvatar login={pr.author} />
                                                    {pr.author}
                                                </span>
                                            </td>
                                            <td className="whitespace-nowrap px-5 py-3"><StatusPill status={pr.status} /></td>
                                            <td className="whitespace-nowrap px-5 py-3"><ScorePill score={pr.score} /></td>
                                            <td className="whitespace-nowrap px-5 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                                                {relative(pr.created_at)}
                                            </td>
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
