import FlashBanner from '@/Components/FlashBanner';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import { Bell, Check, Copy, KeyRound, Loader2, MessageSquare, Plus, Save, TestTube, Trash2 } from 'lucide-react';
import { useState } from 'react';

function Toggle({ checked, onChange, label, hint }) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className="flex w-full items-start justify-between gap-4 text-left"
        >
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
                {hint && <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
            </div>
            <span
                role="switch"
                aria-checked={checked}
                className="relative inline-block h-6 w-11 shrink-0 rounded-full transition"
                style={{ backgroundColor: checked ? 'var(--accent)' : 'var(--border)' }}
            >
                <span
                    className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform"
                    style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
                />
            </span>
        </button>
    );
}

function ApiTokensSection({ tokens, newToken }) {
    const [tokenName, setTokenName] = useState('');
    const [creating, setCreating]   = useState(false);
    const [copied, setCopied]       = useState(false);

    const createToken = (e) => {
        e.preventDefault();
        if (!tokenName.trim()) return;
        setCreating(true);
        router.post('/settings/api-tokens',
            { name: tokenName.trim() },
            { preserveScroll: true, onFinish: () => { setCreating(false); setTokenName(''); } },
        );
    };

    const revoke = (id) => {
        if (!confirm('Revoke this token? Any MCP server or integration using it will stop working.')) return;
        router.delete(`/settings/api-tokens/${id}`, { preserveScroll: true });
    };

    const copyToken = async () => {
        try {
            await navigator.clipboard.writeText(newToken);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {}
    };

    return (
        <section className="card-flat p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                <KeyRound className="h-4 w-4" /> API Tokens
            </h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                For the PRism MCP server and other integrations. Tokens grant read access to your reviews
                and the ability to trigger re-analysis — treat them like passwords.
            </p>

            {/* One-time plaintext token reveal */}
            {newToken && (
                <div className="mt-4 rounded-md p-4"
                    style={{
                        backgroundColor: 'color-mix(in srgb, var(--success) 8%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)',
                    }}>
                    <p className="text-xs font-semibold" style={{ color: 'var(--success)' }}>
                        Copy your token now — it will never be shown again.
                    </p>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <code className="flex-1 overflow-x-auto rounded p-2 font-mono text-[11px]"
                            style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                            {newToken}
                        </code>
                        <button type="button" onClick={copyToken}
                            className="btn btn-secondary min-h-[40px] shrink-0 transition active:scale-95"
                            style={{ fontSize: '0.75rem' }}>
                            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                </div>
            )}

            {/* Existing tokens */}
            {tokens.length > 0 && (
                <ul className="mt-4 space-y-2">
                    {tokens.map((t) => (
                        <li key={t.id} className="flex items-center justify-between gap-3 rounded-md p-3"
                            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t.name}</p>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                    Created {t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}
                                    {' · '}
                                    {t.last_used_at ? `Last used ${new Date(t.last_used_at).toLocaleString()}` : 'Never used'}
                                </p>
                            </div>
                            <button type="button" onClick={() => revoke(t.id)}
                                className="btn btn-secondary min-h-[36px] shrink-0 transition active:scale-95"
                                style={{ padding: '0.25rem 0.625rem', fontSize: '0.75rem', color: 'var(--danger)' }}>
                                <Trash2 className="h-3.5 w-3.5" /> Revoke
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {/* Create form */}
            <form onSubmit={createToken} className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                    type="text"
                    maxLength={64}
                    placeholder="Token name (e.g. claude-code-mcp)"
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                    className="input min-h-[44px] flex-1 text-sm"
                />
                <button type="submit" disabled={!tokenName.trim() || creating}
                    className="btn btn-primary min-h-[44px] shrink-0 transition active:scale-95">
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Generate token
                </button>
            </form>
        </section>
    );
}

export default function Index({ user, api_tokens = [], new_api_token = null }) {
    const { flash } = usePage().props;

    const { data, setData, post, processing, recentlySuccessful, errors } = useForm({
        email_notifications: !!user.email_notifications,
        slack_webhook_url:   user.slack_webhook_url || '',
    });

    const [testing, setTesting] = useState(false);

    const submit = (e) => {
        e.preventDefault();
        post('/settings', { preserveScroll: true });
    };

    const testSlack = () => {
        if (!data.slack_webhook_url) return;
        setTesting(true);
        router.post('/settings/test-slack',
            { slack_webhook_url: data.slack_webhook_url },
            { preserveScroll: true, onFinish: () => setTesting(false) },
        );
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wider sm:text-xs" style={{ color: 'var(--text-muted)' }}>Account</p>
                    <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">Settings</h1>
                </div>
            }
        >
            <Head title="Settings" />

            <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
                {/* Flash banners */}
                <FlashBanner type="success" message={flash?.success} />
                <FlashBanner type="error"   message={flash?.error} />

                {/* Profile (read-only) */}
                <section className="card-flat p-5 sm:p-6">
                    <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Profile</h2>
                    <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Synced from GitHub. Read-only.</p>

                    <div className="mt-5 flex items-center gap-4">
                        {user.github_avatar ? (
                            <img src={user.github_avatar} alt={user.name}
                                className="h-14 w-14 rounded-full ring-1"
                                style={{ '--tw-ring-color': 'var(--border)' }} />
                        ) : (
                            <div className="grid h-14 w-14 place-items-center rounded-full text-lg font-semibold text-white"
                                style={{ backgroundColor: 'var(--accent)' }}>
                                {(user.name || '?').charAt(0).toUpperCase()}
                            </div>
                        )}
                        <div className="min-w-0">
                            <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{user.name || user.github_username}</p>
                            <p className="truncate text-sm" style={{ color: 'var(--text-muted)' }}>{user.email}</p>
                            {user.github_username && (
                                <p className="truncate font-mono text-xs" style={{ color: 'var(--text-muted)' }}>@{user.github_username}</p>
                            )}
                        </div>
                    </div>
                </section>

                {/* Notifications */}
                <form onSubmit={submit}>
                    <section className="card-flat p-5 sm:p-6">
                        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                            <Bell className="h-4 w-4" /> Notifications
                        </h2>
                        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Control where review completions are sent.</p>

                        {/* Email toggle */}
                        <div className="mt-6 rounded-md p-4"
                            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                            <Toggle
                                checked={data.email_notifications}
                                onChange={(v) => setData('email_notifications', v)}
                                label="Email notifications"
                                hint={`Send a completion email to ${user.email || 'your email'} when a review finishes.`}
                            />
                        </div>

                        {/* Slack webhook */}
                        <div className="mt-4 rounded-md p-4"
                            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                            <label className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                <MessageSquare className="h-4 w-4" /> Slack webhook URL
                            </label>
                            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                                Leave blank to disable. Get a webhook from <a className="underline" href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Slack&nbsp;Apps&nbsp;→&nbsp;Incoming Webhooks</a>.
                            </p>
                            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                <input
                                    type="url"
                                    inputMode="url"
                                    placeholder="https://hooks.slack.com/services/T…/B…/…"
                                    value={data.slack_webhook_url}
                                    onChange={(e) => setData('slack_webhook_url', e.target.value)}
                                    className="input min-h-[44px] flex-1 font-mono text-xs"
                                />
                                <button
                                    type="button"
                                    onClick={testSlack}
                                    disabled={!data.slack_webhook_url || testing}
                                    className="btn btn-secondary min-h-[44px] shrink-0 transition active:scale-95"
                                >
                                    <TestTube className="h-4 w-4" />
                                    {testing ? 'Sending…' : 'Test'}
                                </button>
                            </div>
                            {errors.slack_webhook_url && (
                                <p className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>{errors.slack_webhook_url}</p>
                            )}
                        </div>

                        <div className="mt-6 flex items-center justify-end gap-3">
                            {recentlySuccessful && (
                                <span
                                    className="inline-flex items-center gap-1.5 text-sm font-medium anim-fade-in"
                                    style={{ color: 'var(--success)' }}
                                >
                                    <Check className="h-4 w-4" strokeWidth={3} />
                                    Saved
                                </span>
                            )}
                            <button
                                type="submit"
                                disabled={processing}
                                className="btn btn-primary min-h-[44px] transition active:scale-95"
                            >
                                {processing
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <Save className="h-4 w-4" />}
                                {processing ? 'Saving…' : 'Save changes'}
                            </button>
                        </div>
                    </section>
                </form>

                {/* API tokens (MCP / integrations) */}
                <ApiTokensSection tokens={api_tokens} newToken={new_api_token} />
            </div>
        </AuthenticatedLayout>
    );
}
