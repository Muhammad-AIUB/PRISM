import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router, usePage } from '@inertiajs/react';
import { useState } from 'react';

export default function Index({ repos = [], connectedIds = [] }) {
    const { flash } = usePage().props;
    const [connectingId, setConnectingId] = useState(null);

    const connect = (repo) => {
        setConnectingId(repo.id);
        router.post(
            '/repositories',
            {
                github_repo_id: repo.id,
                name: repo.name,
                full_name: repo.full_name,
            },
            {
                preserveScroll: true,
                onFinish: () => setConnectingId(null),
            },
        );
    };

    return (
        <AuthenticatedLayout
            header={
                <h2 className="text-xl font-semibold leading-tight text-gray-800">
                    Connect a Repository
                </h2>
            }
        >
            <Head title="Repositories" />

            <div className="py-12">
                <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
                    {flash?.success && (
                        <div className="mb-4 rounded-md bg-green-50 p-4 text-sm text-green-800 ring-1 ring-green-200">
                            {flash.success}
                        </div>
                    )}
                    {flash?.error && (
                        <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">
                            {flash.error}
                        </div>
                    )}

                    <div className="overflow-hidden bg-white shadow-sm sm:rounded-lg">
                        <div className="p-6">
                            {repos.length === 0 ? (
                                <p className="text-gray-500">
                                    No repositories found on your GitHub account.
                                </p>
                            ) : (
                                <ul className="divide-y divide-gray-200">
                                    {repos.map((repo) => {
                                        const isConnected = connectedIds.includes(repo.id);
                                        const isLoading = connectingId === repo.id;

                                        return (
                                            <li
                                                key={repo.id}
                                                className="flex items-start justify-between gap-4 py-4"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <a
                                                            href={repo.html_url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="truncate text-base font-semibold text-indigo-600 hover:underline"
                                                        >
                                                            {repo.full_name}
                                                        </a>
                                                        {repo.private && (
                                                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                                                                private
                                                            </span>
                                                        )}
                                                    </div>
                                                    {repo.description && (
                                                        <p className="mt-1 text-sm text-gray-600">
                                                            {repo.description}
                                                        </p>
                                                    )}
                                                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
                                                        {repo.language && (
                                                            <span>
                                                                <span className="font-medium text-gray-700">
                                                                    Language:
                                                                </span>{' '}
                                                                {repo.language}
                                                            </span>
                                                        )}
                                                        <span>
                                                            <span className="font-medium text-gray-700">
                                                                Stars:
                                                            </span>{' '}
                                                            {repo.stargazers_count ?? 0}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="shrink-0">
                                                    {isConnected ? (
                                                        <span className="inline-flex items-center rounded-md bg-green-100 px-3 py-1.5 text-sm font-medium text-green-800">
                                                            Connected
                                                        </span>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            disabled={isLoading}
                                                            onClick={() => connect(repo)}
                                                            className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                                                        >
                                                            {isLoading ? 'Connecting…' : 'Connect'}
                                                        </button>
                                                    )}
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
