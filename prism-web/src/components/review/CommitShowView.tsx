'use client';

import { ArrowLeft, ChevronRight, ExternalLink, GitCommit, Info, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { reAnalyzeCommit } from '@/app/reviews/actions';
import AuthenticatedLayout from '@/components/layouts/AuthenticatedLayout';
import {
  FixesTab,
  IssueCard,
  LanguageBadges,
  ReviewStatusPill,
  ScoreCircle,
  normaliseFixes,
} from '@/components/review/parts';
import type { CommitReviewDetail, SessionUser } from '@/lib/types';

/**
 * Port of Pages/Reviews/CommitShow.jsx.
 *
 * Three things differ from the PR screen and are kept: there is no diff tab
 * (a commit review has no PR diff endpoint), there is no severity filter bar,
 * and Re-analyze lives only inside the failure card rather than in the header.
 */
const LAYERS = [
  { key: 'security', label: 'Security' },
  { key: 'performance', label: 'Performance' },
  { key: 'code_quality', label: 'Code Quality' },
  { key: 'fixes', label: 'Auto-Fixes' },
] as const;

type LayerKey = (typeof LAYERS)[number]['key'];
type IssueLayer = 'security' | 'performance' | 'code_quality';

export default function CommitShowView({
  user,
  commitReview,
}: {
  user: SessionUser;
  commitReview: CommitReviewDetail;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<LayerKey>('security');
  const [pending, startTransition] = useTransition();

  const issuesByLayer = useMemo(
    () => ({
      security: commitReview.security_issues ?? [],
      performance: commitReview.performance_issues ?? [],
      code_quality: commitReview.code_quality_issues ?? [],
    }),
    [commitReview],
  );

  const fixes = useMemo(
    () => normaliseFixes(commitReview.suggested_fixes),
    [commitReview.suggested_fixes],
  );

  const inFlight = commitReview.status === 'pending' || commitReview.status === 'analyzing';

  useEffect(() => {
    if (!inFlight) {
      return;
    }

    const id = setInterval(() => router.refresh(), 5000);

    return () => clearInterval(id);
  }, [inFlight, router]);

  const reanalyze = () => {
    startTransition(async () => {
      await reAnalyzeCommit(commitReview.id);
      router.refresh();
    });
  };

  return (
    <AuthenticatedLayout
      user={user}
      header={
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/dashboard"
            className="btn btn-ghost min-h-[44px] transition active:scale-95"
            style={{ padding: '0.375rem 0.625rem' }}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Link>
          {commitReview.github_url && (
            <a
              href={commitReview.github_url}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary min-h-[44px] transition active:scale-95"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline">View Commit on GitHub</span>
            </a>
          )}
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
                <span className="truncate font-mono">{commitReview.repository?.full_name}</span>
                <ChevronRight className="h-3 w-3" />
                <span className="inline-flex items-center gap-1">
                  <GitCommit className="h-3 w-3" />
                  <span className="font-mono">{commitReview.short_sha}</span>
                </span>
              </div>
              <h1 className="mt-1 break-words text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
                {commitReview.commit_message?.split('\n')[0] || '(no commit message)'}
              </h1>
              <div
                className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs"
                style={{ color: 'var(--text-secondary)' }}
              >
                {commitReview.author && (
                  <span>
                    by <span style={{ color: 'var(--text-primary)' }}>{commitReview.author}</span>
                  </span>
                )}
                {commitReview.branch && (
                  <span className="inline-flex items-center gap-1">
                    <code
                      className="rounded font-mono"
                      style={{
                        backgroundColor: 'var(--bg-hover)',
                        color: 'var(--text-primary)',
                        padding: '0.125rem 0.375rem',
                      }}
                    >
                      {commitReview.branch}
                    </code>
                  </span>
                )}
                <ReviewStatusPill status={commitReview.status} />
              </div>
              {commitReview.detected_languages.length > 0 && (
                <div className="mt-3">
                  <LanguageBadges languages={commitReview.detected_languages} />
                </div>
              )}
            </div>
            <div className="order-1 flex justify-center lg:order-2 lg:shrink-0">
              <ScoreCircle score={commitReview.overall_score} />
            </div>
          </div>
        </div>

        {commitReview.summary && (
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
              {commitReview.summary}
            </p>
            {commitReview.ai_model_used && (
              <div className="mt-3">
                <span
                  className="badge"
                  style={{
                    backgroundColor: 'var(--bg-hover)',
                    color: 'var(--text-secondary)',
                    borderColor: 'var(--border)',
                  }}
                >
                  {commitReview.ai_model_used}
                </span>
              </div>
            )}
          </div>
        )}

        {inFlight && (
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

        {commitReview.status === 'failed' && (
          <div
            className="card flex flex-col gap-3 text-sm sm:flex-row sm:items-center"
            style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.30)' }}
          >
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  Review failed
                </p>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  The AI model returned malformed JSON. This happens occasionally with
                  free-tier models — retries usually succeed.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={reanalyze}
              className="btn btn-primary min-h-[44px] shrink-0 transition active:scale-95 sm:ml-auto"
            >
              <RefreshCw className={`h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
              {pending ? 'Retrying…' : 'Re-analyze'}
            </button>
          </div>
        )}

        {/* Tabs appear only once the review is done — a half-written review
            would show empty categories as though nothing was found. */}
        {commitReview.status === 'completed' && (
          <div className="card-flat overflow-hidden">
            <div className="border-b" style={{ borderColor: 'var(--border)' }}>
              <nav className="-mx-px flex gap-1 overflow-x-auto px-3" aria-label="Review tabs">
                {LAYERS.map((tab) => {
                  const count =
                    tab.key === 'fixes'
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
                      <span
                        className="rounded-full px-1.5 text-[10px]"
                        style={{
                          backgroundColor: 'var(--bg-hover)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="p-5">
              {activeTab === 'fixes' ? (
                <FixesTab fixes={fixes} />
              ) : (
                (() => {
                  const list = issuesByLayer[activeTab as IssueLayer];

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
                        ✓ No issues found in this category.
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
          </div>
        )}
      </div>
    </AuthenticatedLayout>
  );
}
