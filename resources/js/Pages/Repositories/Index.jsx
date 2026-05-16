import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router, usePage } from '@inertiajs/react';
import { useMemo, useState } from 'react';

// GitHub-ish language palette for the dot
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

function Icon({ name, className = 'h-4 w-4' }) {
    const p = {
        star:   <path d="M12 2L15 8.5 22 9.3l-5 4.9 1.2 7-6.2-3.3-6.2 3.3 1.2-7-5-4.9 7-0.8L12 2z" />,
        lock:   <><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4"/></>,
        check:  <path d="M20 6L9 17l-5-5"/>,
        search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
        ext:    <><path d="M14 3h7v7"/><path d="M10 14L21 3"/><path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"/></>,
    };
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{p[name]}</svg>
    );
}

export default function Index({ repos = [], connectedIds = [] }) {
    const { flash } = usePage().props;
    const [connectingId, setConnectingId] = useState(null);
    const [query, setQuery] = useState('');

    const filtered = useMemo(() => {
        if (!query.trim()) return repos;
        const q = query.toLowerCase();
        return repos.filter(r =>
            r.full_name?.toLowerCase().includes(q) ||
            r.description?.toLowerCase().includes(q) ||
            r.language?.toLowerCase().includes(q)
        );
    }, [repos, query]);

    const connect = (repo) => {
        setConnectingId(repo.id);
        router.post('/repositories', {
            github_repo_id: repo.id,
            name: repo.name,
            full_name: repo.full_name,
        }, {
            preserveScroll: true,
            onFinish: () => setConnectingId(null),
        });
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">Repositories</h1>
                        <p className="mt-1 text-sm text-ink-dim">Connect a repo to enable AI reviews on every PR.</p>
                    </div>
                    <div className="relative">
                        <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Filter repositories…"
                            className="rounded-btn border-0 bg-ink-card pl-9 pr-3 py-2 text-sm text-ink-text ring-1 ring-ink-border placeholder:text-ink-faint focus:ring-2 focus:ring-brand-500/40"
                        />
                    </div>
                </div>
            }
        >
            <Head title="Repositories" />

            <div className="space-y-4">
                {flash?.success && (
                    <div className="rounded-btn bg-ok/10 px-4 py-2 text-sm text-ok ring-1 ring-ok/30">{flash.success}</div>
                )}
                {flash?.error && (
                    <div className="rounded-btn bg-bad/10 px-4 py-2 text-sm text-bad ring-1 ring-bad/30">{flash.error}</div>
                )}

                {filtered.length === 0 ? (
                    <div className="card p-16 text-center">
                        <p className="text-sm text-ink-text">No repositories found.</p>
                        <p className="mt-1 text-xs text-ink-dim">{query ? 'Try a different search.' : 'Make sure your GitHub account has at least one repo.'}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {filtered.map((repo) => {
                            const isConnected = connectedIds.includes(repo.id);
                            const isLoading = connectingId === repo.id;
                            return (
                                <div key={repo.id} className="card flex flex-col p-5 transition hover:ring-brand-500/30">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <a
                                                href={repo.html_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-text hover:text-brand-400"
                                            >
                                                <span className="truncate">{repo.full_name}</span>
                                                <Icon name="ext" className="h-3 w-3 text-ink-faint" />
                                            </a>
                                            {repo.private && (
                                                <span className="badge ml-2 bg-ink-muted text-ink-dim ring-ink-border">
                                                    <Icon name="lock" className="h-3 w-3" /> private
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-xs text-ink-dim">
                                        {repo.description || <span className="italic text-ink-faint">No description.</span>}
                                    </p>

                                    <div className="mt-4 flex items-center justify-between text-xs text-ink-dim">
                                        <div className="flex items-center gap-3">
                                            {repo.language && (
                                                <span className="inline-flex items-center gap-1.5">
                                                    <LangDot language={repo.language} />
                                                    {repo.language}
                                                </span>
                                            )}
                                            <span className="inline-flex items-center gap-1">
                                                <Icon name="star" className="h-3 w-3" />
                                                {repo.stargazers_count ?? 0}
                                            </span>
                                        </div>
                                        {isConnected ? (
                                            <span className="badge bg-ok/10 text-ok ring-ok/30">
                                                <Icon name="check" className="h-3 w-3" /> Connected
                                            </span>
                                        ) : (
                                            <button
                                                type="button"
                                                disabled={isLoading}
                                                onClick={() => connect(repo)}
                                                className="btn-primary px-3 py-1.5 text-xs"
                                            >
                                                {isLoading ? 'Connecting…' : 'Connect'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
