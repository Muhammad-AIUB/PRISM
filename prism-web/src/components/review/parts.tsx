'use client';

import { Check, Copy, Wand2 } from 'lucide-react';
import { useState } from 'react';
import type { ReviewIssue, SuggestedFix } from '@/lib/types';

/**
 * The pieces the PR review and commit review screens both render. They were
 * duplicated across Show.jsx and CommitShow.jsx; the differences between the
 * two pages are in the pages, not in these.
 */
const SEV: Record<string, { color: string; label: string }> = {
  critical: { color: 'var(--danger)', label: 'Critical' },
  warning: { color: 'var(--warning)', label: 'Warning' },
  suggestion: { color: 'var(--info)', label: 'Suggestion' },
};

const STATUS: Record<string, { color: string; pulse?: boolean }> = {
  pending: { color: 'var(--warning)' },
  analyzing: { color: 'var(--info)', pulse: true },
  completed: { color: 'var(--success)' },
  failed: { color: 'var(--danger)' },
};

export const LAYER_LABEL: Record<string, { label: string; color: string }> = {
  security: { label: 'security', color: 'var(--danger)' },
  performance: { label: 'performance', color: 'var(--warning)' },
  code_quality: { label: 'code quality', color: 'var(--accent)' },
};

export function SeverityBadge({ severity }: { severity?: string }) {
  const entry = SEV[severity ?? ''] ?? SEV.suggestion!;

  return (
    <span
      className="badge"
      style={{
        color: entry.color,
        background: `color-mix(in srgb, ${entry.color} 12%, transparent)`,
        borderColor: `color-mix(in srgb, ${entry.color} 28%, transparent)`,
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: entry.color }}
      />
      {entry.label}
    </span>
  );
}

/**
 * Shows the raw status word, unlike the dashboard's pill which shows a
 * capitalised label. Both were in the original and both are kept.
 */
export function ReviewStatusPill({ status }: { status: string }) {
  const entry = STATUS[status] ?? { color: 'var(--text-muted)' };

  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium">
      {entry.pulse ? (
        <span className="pulse-dot" />
      ) : (
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: entry.color }}
        />
      )}
      <span style={{ color: 'var(--text-primary)' }}>{status}</span>
    </span>
  );
}

export function ScoreCircle({ score }: { score: number | null }) {
  const value = typeof score === 'number' ? Math.max(0, Math.min(100, score)) : null;

  if (value === null) {
    return (
      <div
        className="grid h-32 w-32 place-items-center rounded-full text-sm"
        style={{
          backgroundColor: 'var(--bg-hover)',
          color: 'var(--text-muted)',
          border: '1px solid var(--border)',
        }}
      >
        No score
      </div>
    );
  }

  const stroke =
    value > 70 ? 'var(--success)' : value >= 40 ? 'var(--warning)' : 'var(--danger)';

  const radius = 56;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="anim-score-in relative h-32 w-32">
      <svg viewBox="0 0 128 128" className="h-32 w-32 -rotate-90">
        <circle cx="64" cy="64" r={radius} stroke="var(--border)" strokeWidth="10" fill="none" />
        <circle
          cx="64"
          cy="64"
          r={radius}
          stroke={stroke}
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (value / 100) * circumference}
          style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="text-3xl font-bold" style={{ color: stroke }}>
            {value}
          </div>
          <div
            className="text-[10px] uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            / 100
          </div>
        </div>
      </div>
    </div>
  );
}

export function LanguageBadges({ languages }: { languages: string[] }) {
  if (languages.length === 0) {
    return null;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className="text-[10px] uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        Languages:
      </span>
      {languages.map((language) => (
        <span
          key={language}
          className="badge"
          style={{
            backgroundColor: 'rgba(99,102,241,0.10)',
            color: 'var(--accent)',
            borderColor: 'rgba(99,102,241,0.30)',
          }}
        >
          {language}
        </span>
      ))}
    </span>
  );
}

function CodeBlock({
  label,
  code,
  variant,
}: {
  label: string;
  code: string;
  variant: 'bad' | 'good';
}) {
  const accent = variant === 'bad' ? 'var(--danger)' : 'var(--success)';
  const tint = variant === 'bad' ? 'rgba(239,68,68,0.07)' : 'rgba(34,197,94,0.07)';
  const border = variant === 'bad' ? 'rgba(239,68,68,0.30)' : 'rgba(34,197,94,0.30)';

  return (
    <div className="overflow-hidden rounded-md" style={{ border: `1px solid ${border}` }}>
      <div
        className="flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
        style={{ backgroundColor: tint, color: accent, borderBottom: `1px solid ${border}` }}
      >
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: accent }}
          />
          {label}
        </span>
      </div>
      <pre
        className="overflow-x-auto whitespace-pre p-3 font-mono text-xs leading-relaxed"
        style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
      >
        {code || <em style={{ color: 'var(--text-muted)' }}>// (empty)</em>}
      </pre>
    </div>
  );
}

function FixCard({ fix, onCopy }: { fix: SuggestedFix; onCopy: (text: string) => void }) {
  const layer = LAYER_LABEL[fix.layer] ?? LAYER_LABEL.code_quality!;

  return (
    <div
      className="rounded-md p-4"
      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {(fix.file || fix.line) && (
          <span
            className="inline-flex items-center gap-1 rounded font-mono text-[11px]"
            style={{
              backgroundColor: 'var(--bg-hover)',
              color: 'var(--text-secondary)',
              padding: '0.125rem 0.5rem',
            }}
          >
            {fix.file || 'unknown'}
          </span>
        )}
        {fix.line ? (
          <span
            className="inline-flex items-center gap-1 rounded font-mono text-[11px] font-semibold"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)',
              color: 'var(--accent)',
              border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
              padding: '0.125rem 0.5rem',
            }}
            title="Apply this fix at this line"
          >
            Line {fix.line}
          </span>
        ) : null}
        <span
          className="badge"
          style={{
            color: layer.color,
            background: `color-mix(in srgb, ${layer.color} 12%, transparent)`,
            borderColor: `color-mix(in srgb, ${layer.color} 28%, transparent)`,
          }}
        >
          {layer.label}
        </span>
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => onCopy(fix.suggested_code)}
            className="btn btn-secondary min-h-[36px] transition active:scale-95"
            style={{ padding: '0.25rem 0.625rem', fontSize: '0.75rem' }}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy Fix
          </button>
        </div>
      </div>

      {fix.original_issue && (
        <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
          {fix.original_issue}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <CodeBlock label="Current Code" code={fix.problematic_code} variant="bad" />
        <CodeBlock label="Suggested Fix" code={fix.suggested_code} variant="good" />
      </div>

      {fix.explanation && (
        <div
          className="mt-3 rounded p-3 text-xs leading-relaxed"
          style={{
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
          }}
        >
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            Why this is better:
          </span>{' '}
          {fix.explanation}
        </div>
      )}
    </div>
  );
}

/**
 * `hint` is the second line of the empty state. The PR page shows one telling
 * the user to re-analyze; the commit page shows none, because its re-analyze
 * button only appears on a failed review.
 */
export function FixesTab({ fixes, hint }: { fixes: SuggestedFix[]; hint?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is unavailable outside a secure context; nothing to show.
    }
  };

  if (fixes.length === 0) {
    return (
      <div className="py-10 text-center">
        <div
          className="mx-auto grid h-14 w-14 place-items-center rounded-full"
          style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}
        >
          <Wand2 className="h-6 w-6" />
        </div>
        <p className="mt-4 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          No auto-fixes generated.
        </p>
        {hint && (
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            {hint}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <ul className="space-y-4">
        {fixes.map((fix, index) => (
          <li key={`${fix.file}-${fix.line}-${index}`}>
            <FixCard fix={fix} onCopy={copy} />
          </li>
        ))}
      </ul>

      <div
        className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md px-4 py-2 text-sm transition-all duration-200"
        style={{
          backgroundColor: 'var(--bg-card)',
          color: 'var(--success)',
          border: '1px solid rgba(34,197,94,0.35)',
          opacity: copied ? 1 : 0,
          transform: `translate(-50%, ${copied ? '0' : '8px'})`,
          pointerEvents: copied ? 'auto' : 'none',
          boxShadow: '0 12px 32px -8px rgba(0,0,0,0.5)',
        }}
      >
        <span className="inline-flex items-center gap-2">
          <Check className="h-4 w-4" /> Copied to clipboard
        </span>
      </div>
    </div>
  );
}

export function IssueCard({ issue }: { issue: ReviewIssue }) {
  return (
    <div
      className="rounded-md p-4 transition"
      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {(issue.file || issue.line) && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {issue.file && (
                <span
                  className="inline-flex items-center gap-1 rounded font-mono text-[11px]"
                  style={{
                    backgroundColor: 'var(--bg-hover)',
                    color: 'var(--text-secondary)',
                    padding: '0.125rem 0.5rem',
                  }}
                >
                  {issue.file}
                </span>
              )}
              {issue.line ? (
                <span
                  className="inline-flex items-center gap-1 rounded font-mono text-[11px] font-semibold"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                    color: 'var(--accent)',
                    border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
                    padding: '0.125rem 0.5rem',
                  }}
                >
                  Line {issue.line}
                </span>
              ) : null}
            </div>
          )}
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
            {issue.comment}
          </p>
        </div>
        <SeverityBadge severity={issue.severity} />
      </div>
    </div>
  );
}

export function SeverityFilters({
  counts,
  active,
  onChange,
}: {
  counts: Record<string, number>;
  active: string;
  onChange: (key: string) => void;
}) {
  const items = [
    { key: 'all', label: 'All', color: null },
    { key: 'critical', label: 'Critical', color: 'var(--danger)' },
    { key: 'warning', label: 'Warning', color: 'var(--warning)' },
    { key: 'suggestion', label: 'Suggestion', color: 'var(--info)' },
  ];

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 sm:flex-wrap">
      {items.map(({ key, label, color }) => {
        const isActive = active === key;

        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className="btn shrink-0 transition active:scale-95"
            style={{
              padding: '0.375rem 0.75rem',
              fontSize: '0.75rem',
              backgroundColor: isActive ? 'rgba(99,102,241,0.15)' : 'var(--bg-card)',
              color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              border: `1px solid ${isActive ? 'rgba(99,102,241,0.40)' : 'var(--border)'}`,
            }}
          >
            {color && (
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: color }}
              />
            )}
            {label}
            <span
              className="ml-1 rounded-full px-1.5 py-px text-[10px]"
              style={{
                backgroundColor: 'var(--bg-primary)',
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {counts[key] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** suggested_fixes has been both a bare array and { fixes: [...] }. Accept both. */
export function normaliseFixes(raw: unknown): SuggestedFix[] {
  if (Array.isArray(raw)) {
    return raw as SuggestedFix[];
  }

  const wrapped = (raw as { fixes?: unknown } | null)?.fixes;

  return Array.isArray(wrapped) ? (wrapped as SuggestedFix[]) : [];
}
