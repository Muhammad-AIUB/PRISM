'use client';

import { ArrowLeft, CheckCircle2, FileCode2, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import DemoLayout, { DemoLanguageDot } from '@/components/demo/DemoLayout';

/**
 * Port of Pages/Demo/ReviewDetail.jsx.
 *
 * The severity vocabulary here (critical / high / medium / low) is the demo's
 * own and deliberately not the real app's (critical / warning / suggestion).
 * The score thresholds differ too — 85 and 70 rather than 70 and 40. Both are
 * left as they were: this screen exists to look good to an evaluator, not to
 * match production data.
 */
export interface DemoIssue {
  severity: string;
  type: string;
  message: string;
  file: string;
  line: number;
  before: string;
  after: string;
}

export interface DemoReview {
  id: number;
  pr_title: string;
  repo: string;
  language: string;
  score: number;
  status: string;
  created_at: string;
  issues: DemoIssue[];
}

const SEVERITY: Record<string, { color: string; label: string }> = {
  critical: { color: 'var(--danger)', label: 'Critical' },
  high: { color: '#fb923c', label: 'High' },
  medium: { color: 'var(--warning)', label: 'Medium' },
  low: { color: 'var(--info)', label: 'Low' },
};

function SeverityBadge({ severity }: { severity: string }) {
  const entry = SEVERITY[severity] ?? SEVERITY.medium!;

  return (
    <span
      className="badge"
      style={{
        color: entry.color,
        background: `color-mix(in srgb, ${entry.color} 12%, transparent)`,
        borderColor: `color-mix(in srgb, ${entry.color} 30%, transparent)`,
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

function ScoreGauge({ score }: { score: number | null }) {
  const value = typeof score === 'number' ? Math.max(0, Math.min(100, score)) : null;

  if (value === null) {
    return (
      <div
        className="grid h-32 w-32 place-items-center rounded-full text-sm"
        style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}
      >
        No score
      </div>
    );
  }

  const stroke =
    value >= 85 ? 'var(--success)' : value >= 70 ? 'var(--warning)' : 'var(--danger)';
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

function FileLineBadge({ file, line }: { file: string; line?: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded font-mono text-[11px]"
      style={{
        backgroundColor: 'var(--bg-hover)',
        color: 'var(--text-secondary)',
        padding: '0.125rem 0.5rem',
      }}
    >
      <FileCode2 className="h-3 w-3" />
      {file}
      {line ? <span style={{ color: 'var(--text-muted)' }}>:{line}</span> : null}
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
        className="flex items-center px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
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

function IssueHeader({ issue }: { issue: DemoIssue }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SeverityBadge severity={issue.severity} />
      <span
        className="text-[11px] font-medium uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        {issue.type}
      </span>
      <span className="ml-auto">
        <FileLineBadge file={issue.file} line={issue.line} />
      </span>
    </div>
  );
}

export default function DemoReviewDetailView({ review }: { review: DemoReview }) {
  const [tab, setTab] = useState<'issues' | 'fixes'>('issues');
  const issues = review.issues ?? [];

  return (
    <DemoLayout active="reviews">
      <div className="mb-4">
        <Link
          href="/demo"
          className="btn btn-ghost min-h-[40px] transition active:scale-95"
          style={{ padding: '0.375rem 0.625rem' }}
        >
          <ArrowLeft className="h-4 w-4" /> Back to demo dashboard
        </Link>
      </div>

      <div className="space-y-6">
        <div className="card-flat p-4 sm:p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="order-2 min-w-0 flex-1 lg:order-1">
              <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                {review.repo}
              </p>
              <h1 className="mt-1 break-words text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
                {review.pr_title}
              </h1>
              <div
                className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs"
                style={{ color: 'var(--text-secondary)' }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <DemoLanguageDot language={review.language} />
                  {review.language}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: 'var(--success)' }}
                  />
                  <span style={{ color: 'var(--text-primary)' }}>{review.status}</span>
                </span>
                <span style={{ color: 'var(--text-muted)' }}>{review.created_at}</span>
              </div>
            </div>
            <div className="order-1 flex justify-center lg:order-2 lg:shrink-0">
              <ScoreGauge score={review.score} />
            </div>
          </div>
        </div>

        <div className="card-flat overflow-hidden">
          <div className="border-b" style={{ borderColor: 'var(--border)' }}>
            <nav className="-mx-px flex gap-1 overflow-x-auto px-3" aria-label="Review tabs">
              {(
                [
                  { key: 'issues', label: 'Issues' },
                  { key: 'fixes', label: 'Auto-Fixes' },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`tab-item shrink-0 ${tab === key ? 'tab-item-active' : ''}`}
                >
                  {label}
                  <span
                    className="rounded-full px-1.5 text-[10px]"
                    style={{
                      backgroundColor: 'var(--bg-hover)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {issues.length}
                  </span>
                </button>
              ))}
            </nav>
          </div>

          <div className="p-5">
            {issues.length === 0 ? (
              <div className="py-10 text-center">
                <div
                  className="mx-auto grid h-14 w-14 place-items-center rounded-full"
                  style={{ backgroundColor: 'rgba(34,197,94,0.10)', color: 'var(--success)' }}
                >
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <p className="mt-4 text-base font-medium" style={{ color: 'var(--text-primary)' }}>
                  No issues found — clean code! ✅
                </p>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  PRism couldn&apos;t find anything worth flagging on this PR.
                </p>
              </div>
            ) : tab === 'issues' ? (
              <ul className="space-y-3">
                {issues.map((issue, index) => (
                  <li
                    key={`${issue.file}-${index}`}
                    className="rounded-md p-4"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <IssueHeader issue={issue} />
                    <p
                      className="mt-3 text-sm leading-relaxed"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {issue.message}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="space-y-4">
                {issues.map((issue, index) => (
                  <li
                    key={`${issue.file}-${index}`}
                    className="rounded-md p-4"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <IssueHeader issue={issue} />
                    <p
                      className="mt-3 text-sm leading-relaxed"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {issue.message}
                    </p>
                    <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <CodeBlock label="Current Code" code={issue.before} variant="bad" />
                      <CodeBlock label="Suggested Fix" code={issue.after} variant="good" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {issues.length > 0 && (
            <div
              className="border-t px-5 py-3 text-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              <span className="inline-flex items-center gap-1.5">
                <Wand2 className="h-3.5 w-3.5" />
                In production, the Copy Fix button puts the suggested code straight onto your
                clipboard.
              </span>
            </div>
          )}
        </div>
      </div>
    </DemoLayout>
  );
}
