'use client';

import {
  Bell,
  Check,
  Copy,
  KeyRound,
  Loader2,
  MessageSquare,
  Plus,
  Save,
  TestTube,
  Trash2,
} from 'lucide-react';
import { useState, useTransition } from 'react';
import {
  createApiToken,
  revokeApiToken,
  testSlackWebhook,
  updateSettings,
} from '@/app/settings/actions';
import AuthenticatedLayout from '@/components/layouts/AuthenticatedLayout';
import FlashBanner from '@/components/ui/FlashBanner';
import type { ApiToken, SessionUser, SettingsData } from '@/lib/types';

/** Port of Pages/Settings/Index.jsx. */
function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-4 text-left"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {label}
        </p>
        {hint && (
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            {hint}
          </p>
        )}
      </div>
      <span
        role="switch"
        aria-checked={checked}
        className="relative inline-block h-6 w-11 shrink-0 rounded-full transition"
        style={{ backgroundColor: checked ? 'var(--accent)' : 'var(--border)' }}
      >
        <span
          className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform"
          style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
        />
      </span>
    </button>
  );
}

function ApiTokensSection({
  tokens,
  onFlash,
}: {
  tokens: ApiToken[];
  onFlash: (flash: { type: 'success' | 'error'; message: string }) => void;
}) {
  const [tokenName, setTokenName] = useState('');
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const create = (event: React.FormEvent) => {
    event.preventDefault();

    if (!tokenName.trim()) {
      return;
    }

    startTransition(async () => {
      const result = await createApiToken(tokenName.trim());

      // Held in component state, not re-fetched: this is the only moment the
      // plaintext exists anywhere. A refresh loses it for good, by design.
      if (result.ok && result.plainTextToken) {
        setNewToken(result.plainTextToken);
        setTokenName('');
      }

      onFlash({ type: result.ok ? 'success' : 'error', message: result.message });
    });
  };

  const revoke = (id: number) => {
    if (
      !confirm('Revoke this token? Any MCP server or integration using it will stop working.')
    ) {
      return;
    }

    startTransition(async () => {
      const result = await revokeApiToken(id);

      onFlash({ type: result.ok ? 'success' : 'error', message: result.message });
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(newToken ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard needs a secure context; the token is on screen to copy by hand.
    }
  };

  return (
    <section className="card-flat p-5 sm:p-6">
      <h2
        className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        <KeyRound className="h-4 w-4" /> API Tokens
      </h2>
      <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
        For the PRism MCP server and other integrations. Tokens grant read access to your reviews
        and the ability to trigger re-analysis — treat them like passwords.
      </p>

      {newToken && (
        <div
          className="mt-4 rounded-md p-4"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--success) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)',
          }}
        >
          <p className="text-xs font-semibold" style={{ color: 'var(--success)' }}>
            Copy your token now — it will never be shown again.
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code
              className="flex-1 overflow-x-auto rounded p-2 font-mono text-[11px]"
              style={{
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
            >
              {newToken}
            </code>
            <button
              type="button"
              onClick={copy}
              className="btn btn-secondary min-h-[40px] shrink-0 transition active:scale-95"
              style={{ fontSize: '0.75rem' }}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {tokens.length > 0 && (
        <ul className="mt-4 space-y-2">
          {tokens.map((token) => (
            <li
              key={token.id}
              className="flex items-center justify-between gap-3 rounded-md p-3"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {token.name}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Created{' '}
                  {token.created_at ? new Date(token.created_at).toLocaleDateString() : '—'}
                  {' · '}
                  {token.last_used_at
                    ? `Last used ${new Date(token.last_used_at).toLocaleString()}`
                    : 'Never used'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => revoke(token.id)}
                className="btn btn-secondary min-h-[36px] shrink-0 transition active:scale-95"
                style={{
                  padding: '0.25rem 0.625rem',
                  fontSize: '0.75rem',
                  color: 'var(--danger)',
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Revoke
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={create} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          maxLength={64}
          placeholder="Token name (e.g. claude-code-mcp)"
          value={tokenName}
          onChange={(event) => setTokenName(event.target.value)}
          className="input min-h-[44px] flex-1 text-sm"
        />
        <button
          type="submit"
          disabled={!tokenName.trim() || pending}
          className="btn btn-primary min-h-[44px] shrink-0 transition active:scale-95"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Generate token
        </button>
      </form>
    </section>
  );
}

export default function SettingsView({
  sessionUser,
  data,
}: {
  sessionUser: SessionUser;
  data: SettingsData;
}) {
  const { user, api_tokens } = data;

  const [emailNotifications, setEmailNotifications] = useState(user.email_notifications);
  const [slackUrl, setSlackUrl] = useState(user.slack_webhook_url ?? '');
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saved, setSaved] = useState(false);
  const [saving, startSaving] = useTransition();
  const [testing, startTesting] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSaved(false);
    setFieldErrors({});

    startSaving(async () => {
      const result = await updateSettings({
        email_notifications: emailNotifications,
        // An empty field means "disable", which the API expects as null
        // rather than an empty string — that would fail URL validation.
        slack_webhook_url: slackUrl.trim() === '' ? null : slackUrl.trim(),
      });

      if (result.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setFieldErrors(result.errors ?? {});
      }

      setFlash({ type: result.ok ? 'success' : 'error', message: result.message });
    });
  };

  const testSlack = () => {
    if (!slackUrl) {
      return;
    }

    startTesting(async () => {
      const result = await testSlackWebhook(slackUrl);

      setFlash({ type: result.ok ? 'success' : 'error', message: result.message });
    });
  };

  return (
    <AuthenticatedLayout
      user={sessionUser}
      header={
        <div className="min-w-0">
          <p
            className="text-[10px] font-medium uppercase tracking-wider sm:text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            Account
          </p>
          <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
            Settings
          </h1>
        </div>
      }
    >
      <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
        {flash && <FlashBanner type={flash.type} message={flash.message} />}

        <section className="card-flat p-5 sm:p-6">
          <h2
            className="text-sm font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            Profile
          </h2>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            Synced from GitHub. Read-only.
          </p>

          <div className="mt-5 flex items-center gap-4">
            {user.github_avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.github_avatar}
                alt={user.name}
                className="h-14 w-14 rounded-full ring-1"
                style={{ ['--tw-ring-color' as string]: 'var(--border)' }}
              />
            ) : (
              <div
                className="grid h-14 w-14 place-items-center rounded-full text-lg font-semibold text-white"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {(user.name || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                {user.name || user.github_username}
              </p>
              <p className="truncate text-sm" style={{ color: 'var(--text-muted)' }}>
                {user.email}
              </p>
              {user.github_username && (
                <p className="truncate font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                  @{user.github_username}
                </p>
              )}
            </div>
          </div>
        </section>

        <form onSubmit={submit}>
          <section className="card-flat p-5 sm:p-6">
            <h2
              className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              <Bell className="h-4 w-4" /> Notifications
            </h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              Control where review completions are sent.
            </p>

            <div
              className="mt-6 rounded-md p-4"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              <Toggle
                checked={emailNotifications}
                onChange={setEmailNotifications}
                label="Email notifications"
                hint={`Send a completion email to ${user.email || 'your email'} when a review finishes.`}
              />
            </div>

            <div
              className="mt-4 rounded-md p-4"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              <label
                className="flex items-center gap-2 text-sm font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                <MessageSquare className="h-4 w-4" /> Slack webhook URL
              </label>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                Leave blank to disable. Get a webhook from{' '}
                <a
                  className="underline"
                  href="https://api.slack.com/messaging/webhooks"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--accent)' }}
                >
                  Slack&nbsp;Apps&nbsp;→&nbsp;Incoming Webhooks
                </a>
                .
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  type="url"
                  inputMode="url"
                  placeholder="https://hooks.slack.com/services/T…/B…/…"
                  value={slackUrl}
                  onChange={(event) => setSlackUrl(event.target.value)}
                  className="input min-h-[44px] flex-1 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={testSlack}
                  disabled={!slackUrl || testing}
                  className="btn btn-secondary min-h-[44px] shrink-0 transition active:scale-95"
                >
                  <TestTube className="h-4 w-4" />
                  {testing ? 'Sending…' : 'Test'}
                </button>
              </div>
              {(fieldErrors['slack_webhook_url'] ?? []).map((message) => (
                <p key={message} className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>
                  {message}
                </p>
              ))}
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
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </section>
        </form>

        <ApiTokensSection tokens={api_tokens} onFlash={setFlash} />
      </div>
    </AuthenticatedLayout>
  );
}
