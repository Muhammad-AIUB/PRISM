import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link } from '@inertiajs/react';

const STATUS_STYLES = {
    pending:   'bg-yellow-100 text-yellow-800 ring-yellow-200',
    analyzing: 'bg-blue-100 text-blue-800 ring-blue-200',
    completed: 'bg-green-100 text-green-800 ring-green-200',
    failed:    'bg-red-100 text-red-800 ring-red-200',
};

function StatusBadge({ status }) {
    const cls = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-800 ring-gray-200';
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${cls}`}>
            {status}
        </span>
    );
}

function StatCard({ label, value, hint }) {
    return (
        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <p className="text-sm font-medium text-gray-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
            {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
        </div>
    );
}

function formatDate(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
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
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold leading-tight text-gray-800">Dashboard</h2>
                    <Link
                        href="/repositories"
                        className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-500"
                    >
                        Connect Repository
                    </Link>
                </div>
            }
        >
            <Head title="Dashboard" />

            <div className="py-12">
                <div className="mx-auto max-w-7xl space-y-6 sm:px-6 lg:px-8">
                    {/* Stat cards */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <StatCard label="Connected Repos" value={total_repos} />
                        <StatCard label="PRs Reviewed" value={total_prs} />
                        <StatCard
                            label="Average Score"
                            value={avg_score !== null ? `${avg_score}/100` : '—'}
                            hint="Across all completed reviews"
                        />
                    </div>

                    {/* Recent PRs */}
                    <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-100">
                        <div className="border-b border-gray-100 px-6 py-4">
                            <h3 className="text-base font-semibold text-gray-900">Recent Pull Requests</h3>
                        </div>

                        {recent_prs.length === 0 ? (
                            <div className="px-6 py-12 text-center text-sm text-gray-500">
                                No pull requests yet. Connect a repository and open a PR to see reviews here.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Repo</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">PR Title</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Author</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Score</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Created</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 bg-white">
                                        {recent_prs.map((pr) => (
                                            <tr key={pr.id} className="hover:bg-gray-50">
                                                <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-700">
                                                    {pr.repository?.full_name ?? pr.repository?.name ?? '—'}
                                                </td>
                                                <td className="max-w-xs truncate px-6 py-3 text-sm text-gray-900">
                                                    <Link
                                                        href={`/reviews/${pr.id}`}
                                                        className="font-medium text-indigo-600 hover:underline"
                                                    >
                                                        #{pr.pr_number} {pr.title}
                                                    </Link>
                                                </td>
                                                <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-600">{pr.author}</td>
                                                <td className="whitespace-nowrap px-6 py-3 text-sm">
                                                    <StatusBadge status={pr.status} />
                                                </td>
                                                <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-700">
                                                    {pr.score !== null && pr.score !== undefined ? `${pr.score}/100` : '—'}
                                                </td>
                                                <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-500">
                                                    {formatDate(pr.created_at)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
