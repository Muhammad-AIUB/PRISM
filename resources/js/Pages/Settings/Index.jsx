import FlashBanner from '@/Components/FlashBanner';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import { Bell, MessageSquare, Save, TestTube } from 'lucide-react';
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

export default function Index({ user }) {
    const { flash } = usePage().props;

    const { data, setData, post, processing, errors } = useForm({
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

                        <div className="mt-6 flex justify-end">
                            <button
                                type="submit"
                                disabled={processing}
                                className="btn btn-primary min-h-[44px] transition active:scale-95"
                            >
                                <Save className="h-4 w-4" />
                                {processing ? 'Saving…' : 'Save changes'}
                            </button>
                        </div>
                    </section>
                </form>
            </div>
        </AuthenticatedLayout>
    );
}
