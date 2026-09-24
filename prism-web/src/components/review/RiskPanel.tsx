'use client';

import { ChevronDown, ListChecks, Radar } from 'lucide-react';
import { useEffect, useState } from 'react';
import { loadRisk } from '@/app/reviews/actions';
import type { RiskAssessment, RiskBasis, RiskLevel } from '@/lib/types';

/**
 * Risk Radar: how carefully to look, and what to ask before merging.
 *
 * Sits under the verdict because it answers the second question a reviewer
 * has, not the first. The verdict says whether the AI found something wrong;
 * this says how much the change could break if something is wrong that
 * nobody found — which is the part a score cannot express.
 *
 * Loaded after the page renders. It may need a GitHub round trip, and the
 * verdict above it should never wait for that.
 *
 * The checkboxes are this reader's own working state and are deliberately not
 * saved: they are a way to work through a list, not a sign-off record.
 */
const LEVELS: Record<RiskLevel, { label: string; color: string; note: string }> = {
  high: {
    label: 'High risk',
    color: 'var(--danger)',
    note: 'This change could break something important. Read it slowly, and answer the questions below before merging.',
  },
  medium: {
    label: 'Medium risk',
    color: 'var(--warning)',
    note: 'Worth a careful read. The questions below are where problems in changes like this usually hide.',
  },
  low: {
    label: 'Low risk',
    color: 'var(--success)',
    note: 'Small, contained, and tested, or touching nothing that is hard to undo.',
  },
};

export default function RiskPanel({
  kind,
  id,
  revision,
}: {
  kind: 'pull-request' | 'commit';
  id: number;
  /**
   * Changes whenever the review this panel sits beside changes (its status,
   * or the review row coming and going). The page polls while a review runs;
   * without this the verdict would update and the panel would keep describing
   * the previous revision, which is the mismatch ReviewRiskStore exists to stop.
   */
  revision: string;
}) {
  const [state, setState] = useState<{
    risk: RiskAssessment | null;
    basis: RiskBasis | null;
    error: string | null;
  } | null>(
    null,
  );
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setState(null);

    // A server action can reject outright (network drop, a deploy while the
    // page is open). Without the catch the panel would sit on its loading
    // state forever; with it, it says quietly that risk is unavailable.
    loadRisk(kind, id)
      .catch(() => ({ risk: null, basis: null, error: 'could not reach the server' }))
      .then((result) => {
        if (!cancelled) {
          setState(result);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [kind, id, revision]);

  if (state === null) {
    return (
      <div className="card flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Radar className="h-4 w-4 animate-pulse" />
        Assessing change risk…
      </div>
    );
  }

  // A risk panel that cannot load is not worth an error box above the fold;
  // the review itself is still here. Say it quietly.
  if (!state.risk) {
    return (
      <div className="card flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        <Radar className="h-4 w-4" />
        Change risk unavailable: {state.error}
      </div>
    );
  }

  const { risk } = state;
  const level = LEVELS[risk.level];
  const answered = risk.checklist.filter((check) => done[check.id]).length;

  return (
    <div
      className="card"
      style={{ borderColor: `color-mix(in srgb, ${level.color} 32%, transparent)` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radar className="h-5 w-5" style={{ color: level.color }} />
          <span className="text-lg font-semibold tracking-tight" style={{ color: level.color }}>
            {level.label}
          </span>
          <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
            {risk.score}/100
          </span>
        </div>
        <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
          {risk.stats.files} files ·{' '}
          <span style={{ color: 'var(--success)' }}>+{risk.stats.additions}</span>{' '}
          <span style={{ color: 'var(--danger)' }}>−{risk.stats.deletions}</span> ·{' '}
          {risk.stats.testFiles} test {risk.stats.testFiles === 1 ? 'file' : 'files'}
        </span>
      </div>

      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: 'var(--bg-hover)' }}
        role="meter"
        aria-label="Change risk score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={risk.score}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(risk.score, 3)}%`, backgroundColor: level.color }}
        />
      </div>

      <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        {level.note}
      </p>

      {/* Never let a panel about one push sit beside a verdict about another
          without saying so. */}
      {state.basis === 'current' && (
        <p className="mt-2 text-xs" style={{ color: 'var(--warning)' }}>
          Assessed against the pull request&apos;s current head, which may include pushes made
          after the review above.
        </p>
      )}

      {risk.signals.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="flex min-h-[44px] w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
            aria-expanded={open}
          >
            Why ({risk.signals.length})
            <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
          </button>
          {!open && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {risk.signals.map((signal) => (
                <span
                  key={signal.id}
                  className="badge"
                  style={{
                    backgroundColor: 'var(--bg-hover)',
                    color: 'var(--text-secondary)',
                    borderColor: 'var(--border)',
                  }}
                >
                  {signal.label}
                </span>
              ))}
            </div>
          )}
          {open && (
            <ul className="mt-2 space-y-2">
              {risk.signals.map((signal) => (
                <li key={signal.id} className="text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span style={{ color: 'var(--text-primary)' }}>{signal.label}</span>
                    <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                      +{signal.weight}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {signal.detail}
                  </p>
                  {signal.files.length > 0 && (
                    <p className="mt-0.5 truncate font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                      {signal.files.join(', ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {risk.checklist.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <h3
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              <ListChecks className="h-4 w-4" />
              Before merging
            </h3>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {answered}/{risk.checklist.length}
            </span>
          </div>
          <ul className="mt-2 space-y-2">
            {risk.checklist.map((check) => (
              <li key={check.id}>
                <label className="flex cursor-pointer gap-3 rounded-md p-2 transition hover:bg-[var(--bg-hover)]">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                    checked={done[check.id] ?? false}
                    onChange={(event) =>
                      setDone((current) => ({ ...current, [check.id]: event.target.checked }))
                    }
                  />
                  <span className="min-w-0">
                    <span
                      className="block text-sm"
                      style={{
                        color: done[check.id] ? 'var(--text-muted)' : 'var(--text-primary)',
                        textDecoration: done[check.id] ? 'line-through' : 'none',
                      }}
                    >
                      {check.question}
                    </span>
                    <span className="block text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {check.why}
                    </span>
                    {check.files.length > 0 && (
                      <span
                        className="mt-0.5 block truncate font-mono text-xs"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {check.files.join(', ')}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
