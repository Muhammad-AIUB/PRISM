import { Head, Link } from '@inertiajs/react';
import {
    FileSearch,
    GitBranch,
    GitCommit,
    GitPullRequest,
    Info,
    LayoutDashboard,
    LogIn,
    Settings,
    Shield,
    TrendingUp,
} from 'lucide-react';
import DemoLayout, { DemoLanguageDot, DemoModeBadge, DemoScorePill } from './_layout.jsx';

const STATUS = {
    pending:   { label: 'Pending',   color: 'var(--warning)' },
    analyzing: { label: 'Analyzing', color: 'var(--info)' },
    completed: { label: 'Completed', color: 'var(--success)' },
    failed:    { label: 'Failed',    color: 'var(--danger)' },
};

function StatusPill({ status }) {
    const s = STATUS[status] ?? { label: status, color: 'var(--text-muted)' };
    return (
        <span className="inline-flex items-center gap-2 text-xs font-medium">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            <span style={{ color: 'var(--text-primary)' }}>{s.label}</span>
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

export default function DemoDashboard({ stats, repositories, recent_reviews }) {
    return (
        <DemoLayout active="dashboard">
            <Head title="Demo · PRism" />

            {/* Page header */}
            <div className="mb-6 flex items-end justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wider sm:text-xs" style={{ color: 'var(--text-muted)' }}>
                        Overview
                    </p>
                    <h1 className="mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">Dashboard</h1>
                </div>
                <Link href="/login" className="btn btn-primary min-h-[44px]">
                    <LogIn className="h-4 w-4" /> Sign in for real
                </Link>
            </div>

            <div className="space-y-4 sm:space-y-6">
                {/* Stat cards */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-6">
                    <StatCard icon={GitBranch}      label="Repos"            value={stats.repos} />
                    <StatCard icon={GitPullRequest} label="PRs Reviewed"     value={stats.prs_reviewed} />
                    <StatCard icon={GitCommit}      label="Commits Reviewed" value={stats.commits_reviewed} />
                    <StatCard icon={TrendingUp}     label="Average Score"    value={stats.avg_score} hint="Across all reviews" />
                </div>

                {/* Connected repos */}
                <div className="card-flat overflow-hidden">
                    <div className="border-b px-5 py-3" style={{ borderColor: 'var(--border)' }}>
                        <h2 className="text-sm font-semibold">Connected repositories</h2>
                    </div>
                    <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                        {repositories.map((r) => (
                            <li key={r.name} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                                <div className="flex min-w-0 items-center gap-3">
                                    <DemoLanguageDot language={r.language} />
                                    <span className="truncate font-mono" style={{ color: 'var(--text-primary)' }}>{r.name}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>{r.language}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{r.reviews} reviews</span>
                                    <DemoModeBadge mode={r.review_mode} />
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Recent reviews */}
                <div className="card-flat overflow-hidden">
                    <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: 'var(--border)' }}>
                        <h2 className="text-sm font-semibold">Recent reviews</h2>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Sample data</span>
                    </div>

                    {/* Mobile: card list */}
                    <ul className="divide-y md:hidden" style={{ borderColor: 'var(--border)' }}>
                        {recent_reviews.map((rv) => (
                            <li key={rv.id} className="px-4 py-3">
                                <Link href={`/demo/review/${rv.id}`} className="block">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[11px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>{rv.repo}</p>
                                            <p className="mt-0.5 truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{rv.pr_title}</p>
                                            <div className="mt-2 flex items-center gap-3">
                                                <StatusPill status={rv.status} />
                                                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{rv.created_at}</span>
                                            </div>
                                        </div>
                                        <DemoScorePill score={rv.score} />
                                    </div>
                                </Link>
                            </li>
                        ))}
                    </ul>

                    {/* md+: full table */}
                    <div className="hidden overflow-x-auto md:block">
                        <table className="min-w-full">
                            <thead>
                                <tr className="text-left text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                                    <th className="px-5 py-3 font-medium">Repository</th>
                                    <th className="px-5 py-3 font-medium">PR Title</th>
                                    <th className="px-5 py-3 font-medium">Language</th>
                                    <th className="px-5 py-3 font-medium">Status</th>
                                    <th className="px-5 py-3 font-medium">Score</th>
                                    <th className="px-5 py-3 font-medium">Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recent_reviews.map((rv) => (
                                    <tr
                                        key={rv.id}
                                        className="border-t text-sm transition-colors hover:bg-hover"
                                        style={{ borderColor: 'var(--border)' }}
                                    >
                                        <td className="whitespace-nowrap px-5 py-3 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{rv.repo}</td>
                                        <td className="max-w-md px-5 py-3">
                                            <Link
                                                href={`/demo/review/${rv.id}`}
                                                className="truncate font-medium"
                                                style={{ color: 'var(--text-primary)' }}
                                            >
                                                {rv.pr_title}
                                            </Link>
                                        </td>
                                        <td className="whitespace-nowrap px-5 py-3">
                                            <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                                <DemoLanguageDot language={rv.language} />
                                                {rv.language}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap px-5 py-3"><StatusPill status={rv.status} /></td>
                                        <td className="whitespace-nowrap px-5 py-3"><DemoScorePill score={rv.score} /></td>
                                        <td className="whitespace-nowrap px-5 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{rv.created_at}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* CTA footer card */}
                <div
                    className="rounded-md p-5 text-center sm:p-6"
                    style={{
                        backgroundColor: 'var(--accent-bg)',
                        border: '1px solid rgba(99,102,241,0.30)',
                    }}
                >
                    <Info className="mx-auto h-5 w-5" style={{ color: 'var(--accent)' }} />
                    <p className="mt-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                        Everything you see is hardcoded sample data. The real PRism reviews <em>your</em> pull requests with AI.
                    </p>
                    <Link href="/login" className="btn btn-primary mt-4 inline-flex min-h-[44px]">
                        <LogIn className="h-4 w-4" /> Sign in with GitHub
                    </Link>
                </div>
            </div>
        </DemoLayout>
    );
}
