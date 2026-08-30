'use client';

import { Check, GitBranch, Loader2, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { fetchBranches } from '@/app/repositories/actions';
import type { Branch } from '@/lib/types';

/**
 * Port of Components/BranchPicker.jsx.
 *
 * The list is loaded through a server action rather than a browser fetch, so
 * the API origin and the session cookie stay server-side. Behaviour is the
 * same: on first load, if nothing is selected yet, seed with the repository's
 * default branch, falling back to main/master.
 */
export default function BranchPicker({
  fullName,
  selected,
  onChange,
  defaultPicks = ['main', 'master'],
}: {
  fullName: string;
  selected: string[];
  onChange: (branches: string[]) => void;
  defaultPicks?: string[];
}) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!fullName) {
      return;
    }

    let cancelled = false;

    setLoading(true);

    void fetchBranches(fullName).then((list) => {
      if (cancelled) {
        return;
      }

      setBranches(list);
      setLoading(false);

      // Seeding only happens when the caller has no selection yet, so an
      // existing repository's saved branches are never overwritten.
      if (selected.length === 0 && list.length > 0) {
        const preferred = list.find((branch) => branch.is_default);

        if (preferred) {
          onChange([preferred.name]);

          return;
        }

        const fallback = list
          .filter((branch) => defaultPicks.includes(branch.name))
          .map((branch) => branch.name);

        if (fallback.length > 0) {
          onChange(fallback);
        }
      }
    });

    return () => {
      cancelled = true;
    };
    // Re-running on `selected` would re-seed on every toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullName]);

  const filtered = useMemo(() => {
    if (!query.trim()) {
      return branches;
    }

    const needle = query.toLowerCase();

    return branches.filter((branch) => branch.name.toLowerCase().includes(needle));
  }, [branches, query]);

  const toggle = (name: string) => {
    onChange(
      selected.includes(name)
        ? selected.filter((entry) => entry !== name)
        : [...selected, name],
    );
  };

  if (loading) {
    return (
      <div
        className="flex items-center gap-2 rounded-md p-3 text-sm"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          color: 'var(--text-muted)',
        }}
      >
        <Loader2 className="h-4 w-4 animate-spin" /> Loading branches from GitHub…
      </div>
    );
  }

  if (branches.length === 0) {
    return (
      <div
        className="rounded-md p-3 text-sm"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          color: 'var(--text-muted)',
        }}
      >
        No branches found on this repo.
      </div>
    );
  }

  return (
    <div
      className="rounded-md"
      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
    >
      {branches.length > 5 && (
        <div className="relative border-b" style={{ borderColor: 'var(--border)' }}>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${branches.length} branches…`}
            className="w-full bg-transparent px-9 py-2 text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
      )}

      <div
        className="flex items-center justify-between border-b px-3 py-1.5 text-[11px]"
        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
      >
        <span>
          <strong style={{ color: 'var(--text-primary)' }}>{selected.length}</strong> of{' '}
          {branches.length} selected
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange(branches.map((branch) => branch.name))}
            className="hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            Select all
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => onChange([])}
            className="hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            Clear
          </button>
        </div>
      </div>

      <ul className="max-h-56 overflow-y-auto">
        {filtered.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            No branches match &quot;{query}&quot;
          </li>
        ) : (
          filtered.map((branch) => {
            const isSelected = selected.includes(branch.name);

            return (
              <li key={branch.name}>
                <button
                  type="button"
                  onClick={() => toggle(branch.name)}
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
                  <GitBranch
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: 'var(--text-muted)' }}
                  />
                  <span
                    className="flex-1 truncate font-mono text-xs"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {branch.name}
                  </span>
                  {branch.is_default && (
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
          })
        )}
      </ul>
    </div>
  );
}
