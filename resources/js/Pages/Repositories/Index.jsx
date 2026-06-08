import BranchPicker from '@/Components/BranchPicker';
import FlashBanner from '@/Components/FlashBanner';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { Check, ExternalLink, GitCommit, GitPullRequest, Layers, Lock, Search, Settings, Star, X } from 'lucide-react';
import { useMemo, useState } from 'react';

const MODE_OPTIONS = [
    {
        value: 'pr_only',
        icon: GitPullRequest,
        title: 'Pull Requests only',
        sub: 'Recommended for teams. Reviews fire when a PR is opened or updated.',
    },
    {
        value: 'commit_only',
        icon: GitCommit,
        title: 'Direct commits to main/master',
        sub: 'For solo developers. Reviews fire on every push to your watched branches.',
    },
    {
        value: 'both',
        icon: Settings,
        title: 'Both PRs and commits',
        sub: 'Maximum coverage. Reviews both events.',
    },
];

function ModeModal({ repo, onClose, onSubmit, submitting }) {
    const [mode, setMode]         = useState('pr_only');
    const [branches, setBranches] = useState([]);

    if (!repo) return null;

    const submit = () => {
        onSubmit(repo, mode, branches.length ? branches : ['main', 'master']);
    };

    return (
        <>
            <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm anim-fade-in" onClick={onClose} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div
                    className="w-full max-w-lg rounded-lg p-6 sm:p-7 anim-fade-in"
                    style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                                Connect repository
                            </p>
                            <h2 className="mt-1 truncate text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {repo.full_name}
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            className="grid h-9 w-9 place-items-center rounded-md transition hover:bg-hover"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        How should PRism review code in this repository?
                    </p>

                    <div className="mt-4 space-y-2">
                        {MODE_OPTIONS.map(({ value, icon: Icon, title, sub }) => {
                            const active = mode === value;
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setMode(value)}
                                    className="flex w-full items-start gap-3 rounded-md p-3 text-left transition active:scale-[0.99]"
                                    style={{
                                        backgroundColor: active ? 'rgba(99,102,241,0.10)' : 'var(--bg-secondary)',
                                        border: `1px solid ${active ? 'rgba(99,102,241,0.45)' : 'var(--border)'}`,
                                    }}
                                >
                                    <span
                                        className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md"
                                        style={{
                                            color: active ? 'var(--accent)' : 'var(--text-secondary)',
                                            backgroundColor: active ? 'rgba(99,102,241,0.15)' : 'var(--bg-hover)',
                                            border: '1px solid var(--border)',
                                        }}
                                    >
                                        <Icon className="h-4 w-4" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</span>
                                        <span className="mt-0.5 block text-xs" style={{ color: 'var(--text-secondary)' }}>{sub}</span>
                                    </span>
                                    <span
                                        className="mt-1 h-4 w-4 shrink-0 rounded-full border-2 transition"
                                        style={{
                                            borderColor: active ? 'var(--accent)' : 'var(--border-hover)',
                                            backgroundColor: active ? 'var(--accent)' : 'transparent',
                                            boxShadow: active ? 'inset 0 0 0 3px var(--bg-card)' : 'none',
                                        }}
                                    />
                                </button>
                            );
                        })}
                    </div>

                    {(mode === 'commit_only' || mode === 'both') && (
                        <div className="mt-4">
                            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                                Branches to watch
                            </label>
                            <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                Auto-loaded from your repo. Default branch is pre-selected — toggle as you like.
                            </p>
                            <div className="mt-2">
                                <BranchPicker
                                    fullName={repo.full_name}
                                    selected={branches}
                                    onChange={setBranches}
                                />
                            </div>
                        </div>
                    )}

                    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn btn-secondary min-h-[44px] transition active:scale-95"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={submitting}
                            onClick={submit}
                            className="btn btn-primary min-h-[44px] transition active:scale-95"
                        >
                            {submitting ? 'Connecting…' : 'Connect'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

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

const MODE_BADGE = {
    pr_only:     { icon: GitPullRequest, label: 'Pull Requests', tone: 'rgba(99,102,241,0.10)',  color: 'var(--accent)' },
    commit_only: { icon: GitCommit,      label: 'Commits',       tone: 'rgba(59,130,246,0.10)',  color: 'var(--info)' },
    both:        { icon: Layers,         label: 'Both',          tone: 'rgba(34,197,94,0.10)',   color: 'var(--success)' },
};

function ModeBadge({ mode }) {
    const m = MODE_BADGE[mode] ?? MODE_BADGE.pr_only;
    const Icon = m.icon;
    return (
        <span
            className="badge"
            style={{ backgroundColor: m.tone, color: m.color, borderColor: m.color }}
            title={`Review mode: ${m.label}`}
        >
            <Icon className="h-3 w-3" />
            {m.label}
        </span>
    );
}

function RepoCard({ repo, isConnected, connectedRepo, isLoading, onConnect }) {
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
                    <div className="inline-flex flex-wrap items-center gap-2">
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
                        {connectedRepo?.review_mode && <ModeBadge mode={connectedRepo.review_mode} />}
                        {connectedRepo?.id && (
                            <Link
                                href={`/repositories/${connectedRepo.id}/settings`}
                                aria-label="Repository settings"
                                className="grid h-7 w-7 place-items-center rounded transition hover:bg-hover"
                                style={{ color: 'var(--text-muted)' }}
                            >
                                <Settings className="h-3.5 w-3.5" />
                            </Link>
                        )}
                    </div>
                ) : (
                    <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => onConnect(repo)}
                        className="btn btn-primary min-h-[36px] transition active:scale-95"
                        style={{ padding: '0.375rem 0.875rem', fontSize: '0.75rem' }}
                    >
                        {isLoading ? 'Connecting…' : 'Connect'}
                    </button>
                )}
            </div>
        </div>
    );
}

export default function Index({ repos = [], connectedIds = [], connectedRepos = {} }) {
    const { flash } = usePage().props;
    const [connectingId, setConnectingId] = useState(null);
    const [query, setQuery] = useState('');
    const [modalRepo, setModalRepo] = useState(null);

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

    const openConnectModal = (repo) => setModalRepo(repo);

    const submitConnect = (repo, mode, branches) => {
        setConnectingId(repo.id);
        router.post(
            '/repositories',
            {
                github_repo_id:  repo.id,
                name:            repo.name,
                full_name:       repo.full_name,
                review_mode:     mode,
                review_branches: branches,
            },
            {
                preserveScroll: true,
                onFinish: () => { setConnectingId(null); setModalRepo(null); },
            },
        );
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0">
                        <p className="text-[10px] font-medium uppercase tracking-wider sm:text-xs" style={{ color: 'var(--text-muted)' }}>Connect</p>
                        <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">Repositories</h1>
                    </div>
                    <div className="relative w-full sm:w-72">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Filter repositories…"
                            className="input min-h-[44px] pl-9"
                        />
                    </div>
                </div>
            }
        >
            <Head title="Repositories" />

            <div className="space-y-4">
                <FlashBanner type="success" message={flash?.success} />
                <FlashBanner type="error"   message={flash?.error} />

                {filtered.length === 0 ? (
                    <div className="card p-16 text-center">
                        <p className="text-sm font-medium">No repositories found</p>
                        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                            {query ? 'Try a different search.' : 'Make sure your GitHub account has at least one repo.'}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 2xl:grid-cols-3">
                        {filtered.map((repo) => (
                            <RepoCard
                                key={repo.id}
                                repo={repo}
                                isConnected={connectedIds.includes(repo.id)}
                                connectedRepo={connectedRepos[repo.id]}
                                isLoading={connectingId === repo.id}
                                onConnect={openConnectModal}
                            />
                        ))}
                    </div>
                )}
            </div>

            <ModeModal
                repo={modalRepo}
                onClose={() => setModalRepo(null)}
                onSubmit={submitConnect}
                submitting={connectingId !== null}
            />
        </AuthenticatedLayout>
    );
}
