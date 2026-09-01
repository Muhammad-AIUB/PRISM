'use client';

import { useEffect, useState } from 'react';
import { loadDiff } from '@/app/reviews/actions';

/**
 * Port of Show.jsx's DiffViewer. Loaded on demand — the diff can be large and
 * most visits never open this tab — through a server action rather than a
 * browser fetch.
 *
 * The colouring is by line prefix, matching the original: file headers and
 * hunk markers first, since "+++" also starts with "+" and would otherwise be
 * painted as an addition.
 */
export default function DiffViewer({ pullRequestId }: { pullRequestId: number }) {
  const [state, setState] = useState<{ loading: boolean; diff: string; error: string | null }>({
    loading: true,
    diff: '',
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    setState({ loading: true, diff: '', error: null });

    void loadDiff(pullRequestId).then((result) => {
      if (!cancelled) {
        setState({ loading: false, diff: result.diff, error: result.error });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [pullRequestId]);

  if (state.loading) {
    return (
      <div className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
        Loading diff…
      </div>
    );
  }

  if (state.error) {
    return (
      <div
        className="rounded-md p-4 text-sm"
        style={{
          backgroundColor: 'rgba(239,68,68,0.10)',
          color: 'var(--danger)',
          border: '1px solid rgba(239,68,68,0.30)',
        }}
      >
        Failed to load diff: {state.error}
      </div>
    );
  }

  if (!state.diff) {
    return (
      <div className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
        Empty diff.
      </div>
    );
  }

  return (
    <pre
      className="max-h-[70vh] overflow-auto rounded-md p-3 text-xs leading-5"
      style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}
    >
      {state.diff.split('\n').map((line, index) => {
        let color = 'var(--text-secondary)';
        let background = 'transparent';

        if (line.startsWith('+++') || line.startsWith('---')) {
          color = 'var(--text-primary)';
        } else if (line.startsWith('@@')) {
          color = 'var(--accent)';
        } else if (line.startsWith('+')) {
          color = 'var(--success)';
          background = 'rgba(34,197,94,0.06)';
        } else if (line.startsWith('-')) {
          color = 'var(--danger)';
          background = 'rgba(239,68,68,0.06)';
        }

        return (
          <div
            // Diff lines repeat, so the index is the only stable key here.
            key={index}
            className="whitespace-pre font-mono"
            style={{ color, backgroundColor: background }}
          >
            {line || ' '}
          </div>
        );
      })}
    </pre>
  );
}
