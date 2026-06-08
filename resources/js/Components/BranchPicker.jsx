import { Check, GitBranch, Loader2, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

/**
 * Fetches all branches for a GitHub repo and renders a checkbox picker.
 *
 * Props:
 *   fullName       — "owner/repo" (required)
 *   selected       — string[] of currently selected branch names
 *   onChange       — (string[]) => void
 *   defaultPicks   — fallback names to pre-select if `selected` is empty AND we
 *                    can't determine the default branch (e.g. when network fails)
 */
export default function BranchPicker({ fullName, selected = [], onChange, defaultPicks = ['main', 'master'] }) {
    const [state, setState] = useState({ loading: true, branches: [], error: null });
    const [query, setQuery] = useState('');

    useEffect(() => {
        if (!fullName) return;
        let cancelled = false;
        setState({ loading: true, branches: [], error: null });

        fetch(`/repositories/branches?full_name=${encodeURIComponent(fullName)}`, {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
        })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((data) => {
                if (cancelled) return;
                const branches = Array.isArray(data?.branches) ? data.branches : [];
                setState({ loading: false, branches, error: null });

                // If parent hasn't pre-set any selection, seed with the default
                // branch (preferred) or the spec defaults (main/master).
                if (selected.length === 0 && branches.length > 0) {
                    const def = branches.find((b) => b.is_default);
                    if (def) {
                        onChange?.([def.name]);
                    } else {
                        const fallback = branches.filter((b) => defaultPicks.includes(b.name)).map((b) => b.name);
                        if (fallback.length) onChange?.(fallback);
                    }
                }
            })
            .catch((e) => !cancelled && setState({ loading: false, branches: [], error: e.message }));

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fullName]);

    const filtered = useMemo(() => {
        if (!query.trim()) return state.branches;
        const q = query.toLowerCase();
        return state.branches.filter((b) => b.name.toLowerCase().includes(q));
    }, [state.branches, query]);

    const toggle = (name) => {
        const next = selected.includes(name)
            ? selected.filter((n) => n !== name)
            : [...selected, name];
        onChange?.(next);
    };

    if (state.loading) {
        return (
            <div className="flex items-center gap-2 rounded-md p-3 text-sm"
                style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <Loader2 className="h-4 w-4 animate-spin" /> Loading branches from GitHub…
            </div>
        );
    }

    if (state.error) {
        return (
            <div className="rounded-md p-3 text-sm"
                style={{ backgroundColor: 'rgba(239,68,68,0.10)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.30)' }}>
                Couldn't load branches: {state.error}
            </div>
        );
    }

    if (state.branches.length === 0) {
        return (
            <div className="rounded-md p-3 text-sm"
                style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                No branches found on this repo.
            </div>
        );
    }

    return (
        <div className="rounded-md"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            {/* Search */}
            {state.branches.length > 5 && (
                <div className="relative border-b" style={{ borderColor: 'var(--border)' }}>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                        style={{ color: 'var(--text-muted)' }} />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={`Search ${state.branches.length} branches…`}
                        className="w-full bg-transparent px-9 py-2 text-sm outline-none"
                        style={{ color: 'var(--text-primary)' }}
                    />
                </div>
            )}

            {/* Toolbar — select all / none */}
            <div className="flex items-center justify-between border-b px-3 py-1.5 text-[11px]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                <span>
                    <strong style={{ color: 'var(--text-primary)' }}>{selected.length}</strong> of {state.branches.length} selected
                </span>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => onChange?.(state.branches.map((b) => b.name))}
                        className="hover:underline"
                        style={{ color: 'var(--accent)' }}
                    >
                        Select all
                    </button>
                    <span>·</span>
                    <button
                        type="button"
                        onClick={() => onChange?.([])}
                        className="hover:underline"
                        style={{ color: 'var(--accent)' }}
                    >
                        Clear
                    </button>
                </div>
            </div>

            {/* Branch list */}
            <ul className="max-h-56 overflow-y-auto">
                {filtered.length === 0 ? (
                    <li className="px-3 py-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                        No branches match "{query}"
                    </li>
                ) : filtered.map((b) => {
                    const isSelected = selected.includes(b.name);
                    return (
                        <li key={b.name}>
                            <button
                                type="button"
                                onClick={() => toggle(b.name)}
                                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition hover:bg-hover"
                            >
                                <span
                                    className="grid h-4 w-4 shrink-0 place-items-center rounded border"
                                    style={{
                                        borderColor: isSelected ? 'var(--accent)' : 'var(--border-hover)',
                                        backgroundColor: isSelected ? 'var(--accent)' : 'transparent',
                                    }}
                                >
                                    {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                                </span>
                                <GitBranch className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                                <span className="flex-1 truncate font-mono text-xs"
                                    style={{ color: 'var(--text-primary)' }}>{b.name}</span>
                                {b.is_default && (
                                    <span
                                        className="badge"
                                        style={{
                                            backgroundColor: 'rgba(99,102,241,0.10)',
                                            color: 'var(--accent)',
                                            borderColor: 'rgba(99,102,241,0.30)',
                                        }}
                                    >
                                        default
                                    </span>
                                )}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
