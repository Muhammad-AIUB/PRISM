import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router, usePage } from '@inertiajs/react';
import { Check, ExternalLink, Lock, Search, Star } from 'lucide-react';
import { useMemo, useState } from 'react';

// GitHub-style language colors
const LANG_COLORS = {
    JavaScript: '#f1e05a',
    TypeScript: '#3178c6',
    PHP:        '#4F5D95',
    Python:     '#3572A5',
    Go:         '#00ADD8',
    Rust:       '#dea584',
    Ruby:       '#701516',
    Java:       '#b07219',
    Kotlin:     '#A97BFF',
    Swift:      '#F05138',
    'C++':      '#f34b7d',
    C:          '#555555',
    'C#':       '#178600',
    HTML:       '#e34c26',
    CSS:        '#563d7c',
    Vue:        '#41b883',
    Shell:      '#89e051',
    Dockerfile: '#384d54',
};

function LangDot({ language }) {
    const color = LANG_COLORS[language] || '#94a3b8';
    return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />;
}

function relative(iso) {
    if (!iso) return null;
    try {
        const d = new Date(iso);
        const s = Math.floor((Date.now() - d.getTime()) / 1000);
        if (s < 60)      return 'just now';
        if (s < 3600)    return `${Math.floor(s / 60)}m ago`;
        if (s < 86400)   return `${Math.floor(s / 3600)}h ago`;
        if (s < 604800)  return `${Math.floor(s / 86400)}d ago`;
        if (s < 2592000) return `${Math.floor(s / 604800)}w ago`;
        return d.toLocaleDateString();
    } catch { return iso; }
}

function RepoCard({ repo, isConnected, isLoading, onConnect }) {
    return (
        <div className="card flex flex-col gap-3 transition" style={{ minHeight: '180px' }}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <a
                        href={repo.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold transition hover:opacity-80"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        <span className="truncate">{repo.full_name}</span>
                        <ExternalLink className="h-3 w-3" style={{ color: 'var(--text-muted)' }} />
                    </a>
                    {repo.private && (
                        <span
                            className="badge ml-2"
                            style={{
                                backgroundColor: 'var(--bg-hover)',
                                color: 'var(--text-secondary)',
                                borderColor: 'var(--border)',
                            }}
                        >
                            <Lock className="h-3 w-3" /> private
                        </span>
                    )}
                </div>
            </div>

            <p className="line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {repo.description || <em style={{ color: 'var(--text-muted)' }}>No description.</em>}
            </p>

            <div className="mt-auto flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                <div className="flex flex-wrap items-center gap-3">
                    {repo.language && (
                        <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                            <LangDot language={repo.language} />
                            {repo.language}
                        </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                        <Star className="h-3 w-3" />
                        {repo.stargazers_count ?? 0}
                    </span>
                    {repo.updated_at && (
                        <span title={new Date(repo.updated_at).toLocaleString()}>
                            Updated {relative(repo.updated_at)}
                        </span>
                    )}
                </div>

                {isConnected ? (
                    <span
                        className="badge"
                        style={{
                            backgroundColor: 'rgba(34,197,94,0.10)',
                            color: 'var(--success)',
                            borderColor: 'rgba(34,197,94,0.30)',
                        }}
                    >
                        <Check className="h-3 w-3" /> Connected
                    </span>
                ) : (
                    <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => onConnect(repo)}
                        className="btn-primary btn"
                        style={{ padding: '0.375rem 0.875rem', fontSize: '0.75rem' }}
                    >
                        {isLoading ? 'Connecting…' : 'Connect'}
                    </button>
                )}
            </div>
        </div>
    );
}

export default function Index({ repos = [], connectedIds = [] }) {
    const { flash } = usePage().props;
    const [connectingId, setConnectingId] = useState(null);
    const [query, setQuery] = useState('');

    const filtered = useMemo(() => {
        if (!query.trim()) return repos;
        const q = query.toLowerCase();
        return repos.filter(
            (r) =>
                r.full_name?.toLowerCase().includes(q) ||
                r.description?.toLowerCase().includes(q) ||
                r.language?.toLowerCase().includes(q),
        );
    }, [repos, query]);

    const connect = (repo) => {
        setConnectingId(repo.id);
        router.post(
            '/repositories',
            {
                github_repo_id: repo.id,
                name: repo.name,
                full_name: repo.full_name,
            },
            { preserveScroll: true, onFinish: () => setConnectingId(null) },
        );
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Connect</p>
                        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">Repositories</h1>
                    </div>
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Filter repositories…"
                            className="input pl-9"
                            style={{ width: '18rem' }}
                        />
                    </div>
                </div>
            }
        >
            <Head title="Repositories" />

            <div className="space-y-4">
                {flash?.success && (
                    <div
                        className="rounded-md px-4 py-2 text-sm"
                        style={{
                            backgroundColor: 'rgba(34,197,94,0.10)',
                            color: 'var(--success)',
                            border: '1px solid rgba(34,197,94,0.30)',
                        }}
                    >
                        {flash.success}
                    </div>
                )}
                {flash?.error && (
                    <div
                        className="rounded-md px-4 py-2 text-sm"
                        style={{
                            backgroundColor: 'rgba(239,68,68,0.10)',
                            color: 'var(--danger)',
                            border: '1px solid rgba(239,68,68,0.30)',
                        }}
                    >
                        {flash.error}
                    </div>
                )}

                {filtered.length === 0 ? (
                    <div className="card p-16 text-center">
                        <p className="text-sm font-medium">No repositories found</p>
                        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                            {query ? 'Try a different search.' : 'Make sure your GitHub account has at least one repo.'}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        {filtered.map((repo) => (
                            <RepoCard
                                key={repo.id}
                                repo={repo}
                                isConnected={connectedIds.includes(repo.id)}
                                isLoading={connectingId === repo.id}
                                onConnect={connect}
                            />
                        ))}
                    </div>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
