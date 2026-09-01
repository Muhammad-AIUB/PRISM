import {
  AlertCircle,
  ArrowLeft,
  Download,
  FileSearch,
  GitBranch,
  LogIn,
  Settings,
  Shield,
  Trash2,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ComponentType } from 'react';
import AuthenticatedLayout from '@/components/layouts/AuthenticatedLayout';
import { apiGetAuthed } from '@/lib/api';
import { getSessionUser } from '@/lib/session';
import { absoluteTime, relativeTime } from '@/lib/time';
import type { AuditLogEntry } from '@/lib/types';

export const metadata: Metadata = { title: 'Activity Log' };

/**
 * Port of Pages/Security/AuditLog.jsx. Entirely presentational, so it stays a
 * server component — nothing here needs to run in the browser.
 */
const ACTION_META: Record<
  string,
  { icon: ComponentType<{ className?: string }>; color: string; label: string }
> = {
  login: { icon: LogIn, color: 'var(--info)', label: 'Sign in' },
  repo_connected: { icon: GitBranch, color: 'var(--success)', label: 'Repository connected' },
  repo_disconnected: { icon: Trash2, color: 'var(--danger)', label: 'Repository disconnected' },
  settings_updated: { icon: Settings, color: 'var(--warning)', label: 'Settings updated' },
  review_completed: { icon: FileSearch, color: 'var(--success)', label: 'Review completed' },
  review_reanalyzed: { icon: FileSearch, color: 'var(--info)', label: 'Review re-analyzed' },
  data_exported: { icon: Download, color: 'var(--accent)', label: 'Data exported' },
  account_deleted: { icon: Trash2, color: 'var(--danger)', label: 'Account deleted' },
};

function LogRow({ log }: { log: AuditLogEntry }) {
  const meta = ACTION_META[log.action] ?? {
    icon: AlertCircle,
    color: 'var(--text-muted)',
    label: log.action,
  };
  const Icon = meta.icon;
  const hasMetadata = log.metadata !== null && Object.keys(log.metadata).length > 0;

  return (
    <li className="relative pb-6 pl-10">
      <span
        className="absolute left-2 top-0 grid h-7 w-7 -translate-x-1/2 place-items-center rounded-full"
        style={{
          backgroundColor: 'var(--bg-card)',
          color: meta.color,
          border: `1px solid color-mix(in srgb, ${meta.color} 35%, transparent)`,
          boxShadow: '0 0 0 3px var(--bg-primary)',
        }}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {meta.label}
          </span>
          <span
            className="text-[11px]"
            style={{ color: 'var(--text-muted)' }}
            title={absoluteTime(log.created_at)}
          >
            {relativeTime(log.created_at, 'datetime')}
          </span>
        </div>
        {log.description && (
          <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {log.description}
          </p>
        )}
        <div
          className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]"
          style={{ color: 'var(--text-muted)' }}
        >
          <span className="font-mono">{log.action}</span>
          {log.ip_address && <span>· IP {log.ip_address}</span>}
          {hasMetadata && (
            <details className="cursor-pointer">
              <summary className="select-none">metadata</summary>
              <pre
                className="mt-1 max-w-full overflow-x-auto rounded p-2 text-[11px]"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                }}
              >
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </li>
  );
}

export default async function AuditLogPage() {
  const [user, data] = await Promise.all([
    getSessionUser(),
    apiGetAuthed<{ logs: AuditLogEntry[] }>('/security/audit-log'),
  ]);

  return (
    <AuthenticatedLayout
      user={user}
      header={
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p
              className="text-[10px] font-medium uppercase tracking-wider sm:text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              Security
            </p>
            <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
              Activity Log
            </h1>
          </div>
          <Link
            href="/security"
            className="btn btn-ghost min-h-[44px] transition active:scale-95"
            style={{ padding: '0.375rem 0.625rem' }}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to Security</span>
          </Link>
        </div>
      }
    >
      <div className="mx-auto max-w-3xl">
        {data.logs.length === 0 ? (
          <div className="card p-16 text-center">
            <div
              className="mx-auto grid h-14 w-14 place-items-center rounded-full"
              style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}
            >
              <Shield className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              No activity yet
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              Events will appear here as you use PRism — sign-ins, repo connections, reviews,
              settings changes, and more.
            </p>
          </div>
        ) : (
          <ul className="relative">
            {/* Vertical track behind the timeline dots. */}
            <span
              aria-hidden
              className="absolute bottom-2 left-2 top-2 w-px"
              style={{ backgroundColor: 'var(--border)' }}
            />
            {data.logs.map((log) => (
              <LogRow key={log.id} log={log} />
            ))}
          </ul>
        )}
      </div>
    </AuthenticatedLayout>
  );
}
