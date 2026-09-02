'use client';

import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Download,
  ExternalLink,
  Info,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { reAnalyzePullRequest } from '@/app/reviews/actions';
import AuthenticatedLayout from '@/components/layouts/AuthenticatedLayout';
import DiffViewer from '@/components/review/DiffViewer';
import {
  FixesTab,
  IssueCard,
  LanguageBadges,
  ReviewStatusPill,
  ScoreCircle,
  SeverityFilters,
  normaliseFixes,
} from '@/components/review/parts';
import { AuthorAvatar } from '@/components/ui/pills';
import type { PullRequestDetail, ReviewDetail, SessionUser } from '@/lib/types';

/** Port of Pages/Reviews/Show.jsx. */
const LAYERS = [
  { key: 'security', label: 'Security' },
  { key: 'performance', label: 'Performance' },
  { key: 'code_quality', label: 'Code Quality' },
  { key: 'fixes', label: 'Auto-Fixes' },
  { key: 'diff', label: 'View Diff' },
] as const;

type LayerKey = (typeof LAYERS)[number]['key'];
type IssueLayer = 'security' | 'performance' | 'code_quality';

export default function ReviewShowView({
  user,
  pullRequest,
  review,
}: {
  user: SessionUser;
  pullRequest: PullRequestDetail;
  review: ReviewDetail | null;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<LayerKey>('security');
  const [severity, setSeverity] = useState('all');
  const [pending, startTransition] = useTransition();

  const issuesByLayer = useMemo(
    () => ({
      security: review?.security_issues ?? [],
      performance: review?.performance_issues ?? [],
      code_quality: review?.code_quality_issues ?? [],
    }),
    [review],
  );

  const fixes = useMemo(() => normaliseFixes(review?.suggested_fixes), [review]);

  const counts = useMemo(() => {
    const tally = { all: 0, critical: 0, warning: 0, suggestion: 0 };

    for (const list of Object.values(issuesByLayer)) {
      for (const issue of list) {
        const key = issue.severity ?? 'suggestion';

        tally.all += 1;

        if (key in tally) {
          tally[key as keyof typeof tally] += 1;
        }
      }
    }

    return tally;
  }, [issuesByLayer]);

  const inFlight = pullRequest.status === 'pending' || pullRequest.status === 'analyzing';

  // Poll while the AI is still working. router.refresh() re-runs the server
  // component, so the tab and scroll position survive the update.
  useEffect(() => {
    if (!inFlight) {
      return;
    }

    const id = setInterval(() => router.refresh(), 5000);

    return () => clearInterval(id);
  }, [inFlight, router]);

  const reanalyze = () => {
    startTransition(async () => {
      await reAnalyzePullRequest(pullRequest.id);
      router.refresh();
    });
  };

  const githubPrUrl =
    pullRequest.diff_url?.replace('.diff', '') ||
    (pullRequest.repository?.full_name
      ? `https://github.com/${pullRequest.repository.full_name}/pull/${pullRequest.pr_number}`
      : null);

  return (
    <AuthenticatedLayout
      user={user}
      header={
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/dashboard"
            className="btn btn-ghost min-h-[44px] transition active:scale-95"
            style={{ padding: '0.375rem 0.625rem' }}
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Link>
          <div className="flex items-center gap-2">
            {/* A plain anchor: this is a file download served by a route
                handler, not a client-side navigation. */}
            <a
              href={`/reviews/${pullRequest.id}/export`}
              className="btn btn-secondary min-h-[44px] transition active:scale-95"
              aria-label="Export PDF"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export PDF</span>
            </a>
            <button
              type="button"
              onClick={reanalyze}
              disabled={pending}
              className="btn btn-primary min-h-[44px] transition active:scale-95"
            >
              <RefreshCw className={`h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{pending ? 'Analyzing…' : 'Re-analyze'}</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="card-flat p-4 sm:p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="order-2 min-w-0 flex-1 lg:order-1">
              <div
                className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                {githubPrUrl ? (
                  <a
                    href={githubPrUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1 truncate font-mono hover:opacity-80"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <span className="truncate">{pullRequest.repository?.full_name}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  <span className="truncate font-mono">{pullRequest.repository?.full_name}</span>
                )}
                <ChevronRight className="h-3 w-3" />
                <span>PR #{pullRequest.pr_number}</span>
              </div>
              <h1 className="mt-1 break-words text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
                {pullRequest.title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                <span
                  className="inline-flex items-center gap-2"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  by <AuthorAvatar login={pullRequest.author} />
                  <span style={{ color: 'var(--text-primary)' }}>{pullRequest.author}</span>
                </span>
                <span
                  className="inline-flex items-center gap-1.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <code
                    className="rounded font-mono"
                    style={{
                      backgroundColor: 'var(--bg-hover)',
                      color: 'var(--text-primary)',
                      padding: '0.125rem 0.375rem',
                    }}
                  >
                    {pullRequest.head_branch}
                  </code>
                  <ArrowRight className="h-3 w-3" style={{ color: 'var(--text-muted)' }} />
                  <code
                    className="rounded font-mono"
                    style={{
                      backgroundColor: 'var(--bg-hover)',
                      color: 'var(--text-primary)',
                      padding: '0.125rem 0.375rem',
                    }}
                  >
                    {pullRequest.base_branch}
                  </code>
                </span>
                <ReviewStatusPill status={pullRequest.status} />
              </div>
              {pullRequest.detected_languages.length > 0 && (
                <div className="mt-3">
                  <LanguageBadges languages={pullRequest.detected_languages} />
                </div>
              )}
            </div>
            <div className="order-1 flex justify-center lg:order-2 lg:shrink-0">
              <ScoreCircle score={review?.overall_score ?? null} />
            </div>
          </div>
        </div>

        {review?.summary && (
          <div className="card">
            <h2
              className="mb-2 text-sm font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              AI Summary
            </h2>
            <p
              className="whitespace-pre-line text-sm leading-relaxed"
              style={{ color: 'var(--text-primary)' }}
            >
              {review.summary}
            </p>
            {review.ai_model_used && (
              <div className="mt-3">
                <span
                  className="badge"
                  style={{
                    backgroundColor: 'var(--bg-hover)',
                    color: 'var(--text-secondary)',
                    borderColor: 'var(--border)',
                  }}
                >
                  {review.ai_model_used}
                </span>
              </div>
            )}
          </div>
        )}

        {!review && inFlight && (
          <div
            className="card flex items-start gap-3 text-sm"
            style={{ color: 'var(--warning)', borderColor: 'rgba(245,158,11,0.30)' }}
          >
            <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />
            <div>
              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                Review in progress — typically takes 15-30 seconds
              </p>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                This page auto-refreshes every 5 seconds. No need to do anything — results will
                appear here when the AI finishes.
              </p>
            </div>
          </div>
        )}

        {pullRequest.status === 'failed' && (
          <div
            className="card flex items-start gap-3 text-sm"
            style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.30)' }}
          >
            <Info className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                Review failed
              </p>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                The AI model returned malformed output. This happens occasionally with
                free-tier models — use the <strong>Re-analyze</strong> button at the top right
                to retry. Retries usually succeed.
              </p>
            </div>
          </div>
        )}

        {review && (
          <div className="card-flat overflow-hidden">
            <div className="border-b" style={{ borderColor: 'var(--border)' }}>
              <nav
                className="-mx-px flex gap-1 overflow-x-auto px-3"
                aria-label="Review tabs"
                style={{ scrollbarWidth: 'thin' }}
              >
                {LAYERS.map((tab) => {
                  const count =
                    tab.key === 'diff'
                      ? null
                      : tab.key === 'fixes'
                        ? fixes.length
                        : issuesByLayer[tab.key as IssueLayer].length;

                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={`tab-item shrink-0 ${activeTab === tab.key ? 'tab-item-active' : ''}`}
                    >
                      {tab.label}
                      {count !== null && (
                        <span
                          className="rounded-full px-1.5 text-[10px]"
                          style={{
                            backgroundColor: 'var(--bg-hover)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {activeTab !== 'diff' && activeTab !== 'fixes' && (
              <div
                className="border-b px-5 py-3"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <SeverityFilters counts={counts} active={severity} onChange={setSeverity} />
              </div>
            )}

            <div className="p-5">
              {activeTab === 'diff' ? (
                <DiffViewer pullRequestId={pullRequest.id} />
              ) : activeTab === 'fixes' ? (
                <FixesTab
                  fixes={fixes}
                  hint="The AI didn't propose concrete fixes for this review. Run Re-analyze to try again."
                />
              ) : (
                (() => {
                  const list = issuesByLayer[activeTab as IssueLayer].filter(
                    (issue) =>
                      severity === 'all' || (issue.severity ?? 'suggestion') === severity,
                  );

                  if (list.length === 0) {
                    return (
                      <div
                        className="rounded-md p-4 text-sm"
                        style={{
                          backgroundColor: 'rgba(34,197,94,0.10)',
                          color: 'var(--success)',
                          border: '1px solid rgba(34,197,94,0.30)',
                        }}
                      >
                        ✓ No {severity === 'all' ? '' : `${severity} `}issues found in this
                        category.
                      </div>
                    );
                  }

                  return (
                    <ul className="space-y-3">
                      {list.map((issue, index) => (
                        <li key={`${activeTab}-${index}`}>
                          <IssueCard issue={issue} />
                        </li>
                      ))}
                    </ul>
                  );
                })()
              )}
            </div>

            <div
              className="flex items-center justify-between border-t px-5 py-3 text-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              <span>
                {review.ai_model_used ? (
                  <>
                    Generated by{' '}
                    <code className="font-mono" style={{ color: 'var(--text-secondary)' }}>
                      {review.ai_model_used}
                    </code>
                  </>
                ) : (
                  'Generated by PRism'
                )}
              </span>
              {githubPrUrl && (
                <a
                  href={githubPrUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:opacity-80"
                  style={{ color: 'var(--accent)' }}
                >
                  View on GitHub <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </AuthenticatedLayout>
  );
}
