'use client';

import { AlertTriangle, ArrowLeft, FileText, GitBranch, Lock, Shield, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type ComponentType } from 'react';
import { deleteAllMyData } from '@/app/security/actions';
import AuthenticatedLayout from '@/components/layouts/AuthenticatedLayout';
import FlashBanner from '@/components/ui/FlashBanner';
import type { MyData, SessionUser } from '@/lib/types';

/** Port of Pages/Security/MyData.jsx. */
function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
      <p
        className="w-44 shrink-0 text-xs uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </p>
      <p className={`text-sm ${mono ? 'font-mono' : ''}`} style={{ color: 'var(--text-primary)' }}>
        {value || '—'}
      </p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        <Icon className="h-3.5 w-3.5" />
        <span className="uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
        {value}
      </p>
    </div>
  );
}

export default function MyDataView({ user, data }: { user: SessionUser; data: MyData }) {
  const router = useRouter();
  const { profile, token_preview, stats, repositories } = data;

  const [confirm, setConfirm] = useState('');
  const [armed, setArmed] = useState(false);
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Enough to recognise the token, never enough to use it.
  const masked =
    token_preview.length > 0
      ? `${token_preview.first_4}${'*'.repeat(Math.max(0, token_preview.length - 8))}${token_preview.last_4}`
      : '(none)';

  const deleteAll = () => {
    if (confirm !== 'DELETE') {
      return;
    }

    startTransition(async () => {
      const result = await deleteAllMyData('DELETE');

      if (result.ok) {
        // The account is gone; there is nothing left on this page to show.
        router.push('/login');
        router.refresh();

        return;
      }

      setFlash({ type: 'error', message: result.message });
    });
  };

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
              My Data
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
      <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
        {flash && <FlashBanner type={flash.type} message={flash.message} />}

        <section className="card-flat p-5 sm:p-6">
          <h2
            className="text-sm font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            Profile
          </h2>
          <div className="mt-5 flex items-center gap-4">
            {profile.github_avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.github_avatar}
                alt={profile.name}
                className="h-14 w-14 rounded-full ring-1"
                style={{ ['--tw-ring-color' as string]: 'var(--border)' }}
              />
            ) : (
              <div
                className="grid h-14 w-14 place-items-center rounded-full text-lg font-semibold text-white"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {(profile.name || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                {profile.name || profile.github_username}
              </p>
              <p className="truncate text-sm" style={{ color: 'var(--text-muted)' }}>
                {profile.email}
              </p>
            </div>
          </div>
          <div className="mt-6 space-y-2">
            <Field
              label="GitHub username"
              value={profile.github_username ? `@${profile.github_username}` : null}
              mono
            />
            <Field label="Email" value={profile.email} />
            <Field label="Joined" value={profile.created_at} />
          </div>
        </section>

        <section className="card-flat p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4" style={{ color: 'var(--accent)' }} />
            <h2
              className="text-sm font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              GitHub token
            </h2>
          </div>
          <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            Only the first 4 and last 4 characters are shown. Even we can&apos;t see the rest
            without decrypting it from the DB.
          </p>
          <pre
            className="mt-3 overflow-x-auto rounded-md p-3 text-xs"
            style={{
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            {masked}
          </pre>
          <div
            className="mt-3 flex flex-wrap items-center gap-2 text-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span>
              Length:{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{token_preview.length}</strong> chars
            </span>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span
              className="inline-flex items-center gap-1.5"
              style={{ color: 'var(--success)' }}
            >
              <Shield className="h-3.5 w-3.5" /> Encrypted at rest (AES-256)
            </span>
          </div>
        </section>

        <section>
          <h2
            className="mb-3 px-1 text-sm font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            Activity
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            <StatCard icon={GitBranch} label="Connected repos" value={stats.connected_repos} />
            <StatCard icon={FileText} label="Total reviews" value={stats.total_reviews} />
            <StatCard icon={Shield} label="Audit events" value={stats.audit_events} />
          </div>
        </section>

        <section className="card-flat overflow-hidden">
          <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Connected repositories
            </h2>
          </div>
          {repositories.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              You have no connected repositories.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {repositories.map((repo) => (
                <li
                  key={repo.full_name}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm" style={{ color: 'var(--text-primary)' }}>
                      {repo.full_name}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Connected on {repo.created_at} · mode: {repo.review_mode}
                    </p>
                  </div>
                  {repo.is_active && (
                    <span
                      className="badge"
                      style={{
                        backgroundColor: 'rgba(34,197,94,0.10)',
                        color: 'var(--success)',
                        borderColor: 'rgba(34,197,94,0.30)',
                      }}
                    >
                      active
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card-flat p-5 sm:p-6" style={{ border: '1px solid rgba(239,68,68,0.45)' }}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" style={{ color: 'var(--danger)' }} />
            <h2 className="text-base font-semibold" style={{ color: 'var(--danger)' }}>
              Danger Zone
            </h2>
          </div>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            This permanently deletes your account, all connected repositories, every review and
            review comment, all commit reviews, your audit log, and your GitHub token from PRism.
            We&apos;ll also try to uninstall the webhooks from GitHub. This cannot be undone.
          </p>

          {!armed ? (
            <button
              type="button"
              onClick={() => setArmed(true)}
              className="btn mt-5 min-h-[44px] transition active:scale-95"
              style={{
                backgroundColor: 'rgba(239,68,68,0.10)',
                color: 'var(--danger)',
                border: '1px solid rgba(239,68,68,0.40)',
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete My Data…
            </button>
          ) : (
            <div className="mt-5 space-y-3">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Type{' '}
                <code
                  className="rounded px-1 font-mono"
                  style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)' }}
                >
                  DELETE
                </code>{' '}
                below to confirm.
              </label>
              <input
                type="text"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="DELETE"
                className="input min-h-[44px] font-mono"
                autoFocus
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setArmed(false);
                    setConfirm('');
                  }}
                  className="btn btn-secondary min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={deleteAll}
                  disabled={confirm !== 'DELETE' || pending}
                  className="btn min-h-[44px] transition active:scale-95"
                  style={{
                    backgroundColor:
                      confirm === 'DELETE' ? 'var(--danger)' : 'rgba(239,68,68,0.20)',
                    color: '#fff',
                    opacity: confirm === 'DELETE' && !pending ? 1 : 0.6,
                    cursor: confirm === 'DELETE' && !pending ? 'pointer' : 'not-allowed',
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  {pending ? 'Deleting…' : 'Permanently Delete Everything'}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </AuthenticatedLayout>
  );
}
