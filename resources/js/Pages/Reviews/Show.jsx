import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link } from '@inertiajs/react';
import { useState } from 'react';

const SEVERITY_STYLES = {
    critical:   'bg-red-100 text-red-800 ring-red-200',
    warning:    'bg-yellow-100 text-yellow-800 ring-yellow-200',
    suggestion: 'bg-gray-100 text-gray-700 ring-gray-200',
};

const TABS = [
    { key: 'security',     label: 'Security',     color: 'red'    },
    { key: 'performance',  label: 'Performance',  color: 'orange' },
    { key: 'code_quality', label: 'Code Quality', color: 'blue'   },
];

const TAB_COLORS = {
    red:    'border-red-500 text-red-600',
    orange: 'border-orange-500 text-orange-600',
    blue:   'border-blue-500 text-blue-600',
};

function ScoreCircle({ score }) {
    if (score === null || score === undefined) {
        return (
            <div className="flex h-32 w-32 items-center justify-center rounded-full bg-gray-100 text-gray-400 ring-4 ring-gray-200">
                <span className="text-sm">No score</span>
            </div>
        );
    }

    let color = 'text-red-600 ring-red-200 bg-red-50';
    if (score > 70)      color = 'text-green-600 ring-green-200 bg-green-50';
    else if (score >= 40) color = 'text-yellow-600 ring-yellow-200 bg-yellow-50';

    return (
        <div className={`flex h-32 w-32 flex-col items-center justify-center rounded-full ring-4 ${color}`}>
            <span className="text-4xl font-bold">{score}</span>
            <span className="text-xs uppercase tracking-wider">/ 100</span>
        </div>
    );
}

function IssueList({ issues }) {
    if (!Array.isArray(issues) || issues.length === 0) {
        return (
            <div className="rounded-md bg-green-50 p-4 text-sm text-green-800 ring-1 ring-green-200">
                ✅ No issues detected in this layer.
            </div>
        );
    }

    return (
        <ul className="space-y-3">
            {issues.map((issue, idx) => {
                const sev = SEVERITY_STYLES[issue.severity] ?? SEVERITY_STYLES.suggestion;
                return (
                    <li key={idx} className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <p className="font-mono text-xs text-gray-500">
                                    {issue.file || 'unknown'}
                                    {issue.line ? `:${issue.line}` : ''}
                                </p>
                                <p className="mt-2 text-sm text-gray-800">{issue.comment}</p>
                            </div>
                            <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${sev}`}>
                                {issue.severity || 'suggestion'}
                            </span>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

export default function Show({ pullRequest, review }) {
    const [activeTab, setActiveTab] = useState('security');

    const issuesByTab = {
        security:     review?.security_issues     ?? [],
        performance:  review?.performance_issues  ?? [],
        code_quality: review?.code_quality_issues ?? [],
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold leading-tight text-gray-800">
                        PR Review
                    </h2>
                    <Link href="/dashboard" className="text-sm text-indigo-600 hover:underline">
                        ← Back to Dashboard
                    </Link>
                </div>
            }
        >
            <Head title={`Review · ${pullRequest.title}`} />

            <div className="py-12">
                <div className="mx-auto max-w-7xl space-y-6 sm:px-6 lg:px-8">
                    {/* PR header */}
                    <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-100">
                        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm text-gray-500">
                                    {pullRequest.repository?.full_name} · #{pullRequest.pr_number}
                                </p>
                                <h1 className="mt-1 text-2xl font-semibold text-gray-900">
                                    {pullRequest.title}
                                </h1>
                                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                                    <span>
                                        <span className="font-medium text-gray-800">Author:</span> {pullRequest.author}
                                    </span>
                                    <span>
                                        <span className="font-medium text-gray-800">Branch:</span>{' '}
                                        <code className="rounded bg-gray-100 px-1 text-xs">{pullRequest.head_branch}</code>
                                        {' → '}
                                        <code className="rounded bg-gray-100 px-1 text-xs">{pullRequest.base_branch}</code>
                                    </span>
                                    <span>
                                        <span className="font-medium text-gray-800">Status:</span> {pullRequest.status}
                                    </span>
                                </div>
                            </div>
                            <div className="flex justify-center md:justify-end">
                                <ScoreCircle score={review?.overall_score ?? null} />
                            </div>
                        </div>

                        {review?.summary && (
                            <div className="mt-6 rounded-md bg-gray-50 p-4 text-sm text-gray-700 ring-1 ring-gray-100">
                                <p className="font-medium text-gray-900">Summary</p>
                                <p className="mt-1 whitespace-pre-line">{review.summary}</p>
                            </div>
                        )}
                    </div>

                    {!review && (
                        <div className="rounded-md bg-yellow-50 p-4 text-sm text-yellow-800 ring-1 ring-yellow-200">
                            The review is still being generated or has not run yet. Check back once the PR status is <strong>completed</strong>.
                        </div>
                    )}

                    {review && (
                        <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-100">
                            {/* Tabs */}
                            <div className="border-b border-gray-200">
                                <nav className="flex gap-6 px-6" aria-label="Review layers">
                                    {TABS.map((tab) => {
                                        const count = issuesByTab[tab.key].length;
                                        const isActive = activeTab === tab.key;
                                        return (
                                            <button
                                                key={tab.key}
                                                type="button"
                                                onClick={() => setActiveTab(tab.key)}
                                                className={`flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition ${
                                                    isActive
                                                        ? TAB_COLORS[tab.color]
                                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                                }`}
                                            >
                                                {tab.label}
                                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                                                    {count}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </nav>
                            </div>

                            <div className="p-6">
                                <IssueList issues={issuesByTab[activeTab]} />
                            </div>

                            {review.ai_model_used && (
                                <div className="border-t border-gray-100 bg-gray-50 px-6 py-3 text-xs text-gray-500">
                                    Generated by <code>{review.ai_model_used}</code>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
