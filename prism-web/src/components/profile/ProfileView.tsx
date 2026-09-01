'use client';

import { Check, Loader2, Save, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deleteAccount, updateProfile } from '@/app/profile/actions';
import AuthenticatedLayout from '@/components/layouts/AuthenticatedLayout';
import FlashBanner from '@/components/ui/FlashBanner';
import type { SessionUser } from '@/lib/types';

/**
 * Port of Pages/Profile/Edit.jsx and its partials.
 *
 * DELIBERATE DEVIATION — styling: the Breeze originals were never restyled and
 * still used bg-white / text-gray-800, which renders as white cards inside a
 * dark app. Reproducing that faithfully would mean shipping a page that looks
 * broken, so this uses the same design tokens as every other screen.
 *
 * DELIBERATE OMISSION — the change-password form. It posted to Breeze's
 * PUT /password, which has no NestJS equivalent (that route set is still on
 * Laravel), and no PRism account can have a password anyway: sign-in is GitHub
 * only. The form was unusable before and would be broken now.
 */
export default function ProfileView({ user }: { user: SessionUser }) {
  const router = useRouter();

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saved, setSaved] = useState(false);
  const [saving, startSaving] = useTransition();

  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [deleteErrors, setDeleteErrors] = useState<string[]>([]);
  const [deleting, startDeleting] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSaved(false);
    setFieldErrors({});

    startSaving(async () => {
      const result = await updateProfile({ name, email });

      if (result.ok) {
        // Clear any banner left over from a previous failure — a successful
        // save that still shows "email must be lowercase" reads as a failure.
        setFlash(null);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      } else {
        setFieldErrors(result.errors ?? {});
        setFlash({ type: 'error', message: result.message });
      }
    });
  };

  const confirmDelete = (event: React.FormEvent) => {
    event.preventDefault();
    setDeleteErrors([]);

    startDeleting(async () => {
      const result = await deleteAccount(password);

      if (result.ok) {
        router.push('/login');
        router.refresh();

        return;
      }

      setDeleteErrors(result.errors?.['password'] ?? [result.message]);
      setPassword('');
    });
  };

  const fieldError = (field: string) => fieldErrors[field] ?? [];

  return (
    <AuthenticatedLayout
      user={user}
      header={
        <div className="min-w-0">
          <p
            className="text-[10px] font-medium uppercase tracking-wider sm:text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            Account
          </p>
          <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
            Profile
          </h1>
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
              Profile information
            </h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              Update your account&apos;s name and email address.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="name"
                  className="text-xs font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  autoComplete="name"
                  maxLength={255}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="input mt-1 min-h-[44px] w-full"
                />
                {fieldError('name').map((message) => (
                  <p key={message} className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>
                    {message}
                  </p>
                ))}
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="text-xs font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="username"
                  maxLength={255}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="input mt-1 min-h-[44px] w-full"
                />
                {/* The API validates that the address is already lowercase
                    rather than normalising it, so the message is worth showing
                    verbatim. */}
                {fieldError('email').map((message) => (
                  <p key={message} className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>
                    {message}
                  </p>
                ))}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
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
                disabled={saving}
                className="btn btn-primary min-h-[44px] transition active:scale-95"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </section>
        </form>

        <section className="card-flat p-5 sm:p-6">
          <h2
            className="text-sm font-semibold uppercase tracking-wider"
            style={{ color: 'var(--danger)' }}
          >
            Delete account
          </h2>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            Once your account is deleted, all of its resources and data are permanently deleted.
            Download anything you want to keep first.
          </p>

          {/* Says out loud what the Laravel version left the user to discover:
              this form needs a password, and GitHub sign-in never sets one. */}
          <div
            className="mt-4 rounded-md p-3 text-xs"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            Signed in with GitHub? This form needs an account password, which GitHub sign-in does
            not create. Use{' '}
            <Link
              href="/security/my-data"
              className="font-medium underline-offset-2 hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              Security → My Data
            </Link>{' '}
            to delete everything instead.
          </div>

          {confirming ? (
            <form onSubmit={confirmDelete} className="mt-4">
              <label
                htmlFor="delete-password"
                className="text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                Confirm with your password
              </label>
              <input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="input mt-1 min-h-[44px] w-full"
              />
              {deleteErrors.map((message) => (
                <p key={message} className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>
                  {message}
                </p>
              ))}
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false);
                    setPassword('');
                    setDeleteErrors([]);
                  }}
                  className="btn btn-secondary min-h-[44px] transition active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deleting || !password}
                  className="btn min-h-[44px] transition active:scale-95"
                  style={{
                    backgroundColor: 'var(--danger)',
                    color: '#ffffff',
                    border: '1px solid var(--danger)',
                  }}
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  {deleting ? 'Deleting…' : 'Delete account'}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="btn mt-4 min-h-[44px] transition active:scale-95"
              style={{
                backgroundColor: 'transparent',
                color: 'var(--danger)',
                border: '1px solid color-mix(in srgb, var(--danger) 40%, transparent)',
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete account
            </button>
          )}
        </section>
      </div>
    </AuthenticatedLayout>
  );
}
