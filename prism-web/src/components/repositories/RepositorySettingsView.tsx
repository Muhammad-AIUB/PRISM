'use client';

import { ArrowLeft, Check, Loader2, Save } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { updateRepositorySettings } from '@/app/repositories/actions';
import AuthenticatedLayout from '@/components/layouts/AuthenticatedLayout';
import BranchPicker from '@/components/repositories/BranchPicker';
import ModeSelector, { SETTINGS_MODE_OPTIONS } from '@/components/repositories/ModeSelector';
import FlashBanner from '@/components/ui/FlashBanner';
import type { RepositorySettingsData, SessionUser } from '@/lib/types';

/** Port of Pages/Repositories/Settings.jsx. */
export default function RepositorySettingsView({
  user,
  data,
}: {
  user: SessionUser;
  data: RepositorySettingsData;
}) {
  const { repository } = data;

  const [mode, setMode] = useState(repository.review_mode);
  const [branches, setBranches] = useState<string[]>(
    repository.review_branches.length > 0 ? repository.review_branches : ['main', 'master'],
  );
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSaved(false);
    setFieldErrors({});

    startTransition(async () => {
      const result = await updateRepositorySettings(repository.id, {
        review_mode: mode,
        review_branches: branches,
      });

      if (result.ok) {
        setSaved(true);
        // Matches Inertia's recentlySuccessful window, so the inline "Saved"
        // next to the button fades on its own.
        setTimeout(() => setSaved(false), 2000);
      } else {
        setFieldErrors(result.errors ?? {});
      }

      setFlash({ type: result.ok ? 'success' : 'error', message: result.message });
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
              Repository
            </p>
            <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
              {repository.full_name}
            </h1>
          </div>
          <Link
            href="/repositories"
            className="btn btn-ghost min-h-[44px] transition active:scale-95"
            style={{ padding: '0.375rem 0.625rem' }}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Link>
        </div>
      }
    >
      <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
        {flash && <FlashBanner type={flash.type} message={flash.message} />}

        <form onSubmit={submit}>
          <section className="card-flat p-5 sm:p-6">
            <h2
              className="text-sm font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Review mode
            </h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              Changing this will update the GitHub webhook events PRism subscribes to.
            </p>

            <div className="mt-5">
              <ModeSelector options={SETTINGS_MODE_OPTIONS} value={mode} onChange={setMode} />
            </div>

            {(mode === 'commit_only' || mode === 'both') && (
              <div className="mt-5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Branches to watch
                </label>
                <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Pick the branches PRism should review on every push. We auto-loaded the live
                  list from GitHub.
                </p>
                <div className="mt-2">
                  <BranchPicker
                    fullName={repository.full_name}
                    selected={branches}
                    onChange={setBranches}
                  />
                </div>
                {/* The API reports `each` failures against the parent key; the
                    dotted form is kept in case that changes. */}
                {(fieldErrors['review_branches'] ?? fieldErrors['review_branches.0'] ?? []).map(
                  (message) => (
                    <p key={message} className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>
                      {message}
                    </p>
                  ),
                )}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              {/* Inline, right next to the button, so it cannot be missed. */}
              {saved && (
                <span
                  className="anim-fade-in inline-flex items-center gap-1.5 text-sm font-medium"
                  style={{ color: 'var(--success)' }}
                >
                  <Check className="h-4 w-4" strokeWidth={3} />
                  Saved
                </span>
              )}
              <button
                type="submit"
                disabled={pending}
                className="btn btn-primary min-h-[44px] transition active:scale-95"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {pending ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </section>
        </form>
      </div>
    </AuthenticatedLayout>
  );
}
