import BranchPicker from '@/Components/BranchPicker';
import FlashBanner from '@/Components/FlashBanner';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, useForm, usePage } from '@inertiajs/react';
import { ArrowLeft, GitCommit, GitPullRequest, Save, Settings as SettingsIcon } from 'lucide-react';

const MODE_OPTIONS = [
    {
        value: 'pr_only',
        icon: GitPullRequest,
        title: 'Pull Requests only',
        sub: 'Recommended for teams.',
    },
    {
        value: 'commit_only',
        icon: GitCommit,
        title: 'Direct commits to main/master',
        sub: 'For solo developers.',
    },
    {
        value: 'both',
        icon: SettingsIcon,
        title: 'Both PRs and commits',
        sub: 'Maximum coverage.',
    },
];

export default function Settings({ repository }) {
    const { flash } = usePage().props;
    const { data, setData, post, processing, errors } = useForm({
        review_mode:     repository.review_mode,
        review_branches: repository.review_branches || ['main', 'master'],
    });

    const submit = (e) => {
        e.preventDefault();
        post(`/repositories/${repository.id}/settings`, {
            preserveScroll: true,
        });
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[10px] font-medium uppercase tracking-wider sm:text-xs" style={{ color: 'var(--text-muted)' }}>
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
            <Head title={`Settings · ${repository.full_name}`} />

            <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
                <FlashBanner type="success" message={flash?.success} />
                <FlashBanner type="error"   message={flash?.error} />

                <form onSubmit={submit}>
                    <section className="card-flat p-5 sm:p-6">
                        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Review mode</h2>
                        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                            Changing this will update the GitHub webhook events PRism subscribes to.
                        </p>

                        <div className="mt-5 space-y-2">
                            {MODE_OPTIONS.map(({ value, icon: Icon, title, sub }) => {
                                const active = data.review_mode === value;
                                return (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setData('review_mode', value)}
                                        className="flex w-full items-start gap-3 rounded-md p-3 text-left transition active:scale-[0.99]"
                                        style={{
                                            backgroundColor: active ? 'rgba(99,102,241,0.10)' : 'var(--bg-secondary)',
                                            border: `1px solid ${active ? 'rgba(99,102,241,0.45)' : 'var(--border)'}`,
                                        }}
                                    >
                                        <span
                                            className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md"
                                            style={{
                                                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                                                backgroundColor: active ? 'rgba(99,102,241,0.15)' : 'var(--bg-hover)',
                                                border: '1px solid var(--border)',
                                            }}
                                        >
                                            <Icon className="h-4 w-4" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</span>
                                            <span className="mt-0.5 block text-xs" style={{ color: 'var(--text-secondary)' }}>{sub}</span>
                                        </span>
                                        <span
                                            className="mt-1 h-4 w-4 shrink-0 rounded-full border-2 transition"
                                            style={{
                                                borderColor: active ? 'var(--accent)' : 'var(--border-hover)',
                                                backgroundColor: active ? 'var(--accent)' : 'transparent',
                                                boxShadow: active ? 'inset 0 0 0 3px var(--bg-card)' : 'none',
                                            }}
                                        />
                                    </button>
                                );
                            })}
                        </div>

                        {(data.review_mode === 'commit_only' || data.review_mode === 'both') && (
                            <div className="mt-5">
                                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                                    Branches to watch
                                </label>
                                <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                    Pick the branches PRism should review on every push. We auto-loaded the live list from GitHub.
                                </p>
                                <div className="mt-2">
                                    <BranchPicker
                                        fullName={repository.full_name}
                                        selected={data.review_branches}
                                        onChange={(arr) => setData('review_branches', arr)}
                                    />
                                </div>
                                {errors.review_branches && (
                                    <p className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>{errors.review_branches}</p>
                                )}
                                {errors['review_branches.0'] && (
                                    <p className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>{errors['review_branches.0']}</p>
                                )}
                            </div>
                        )}

                        <div className="mt-6 flex justify-end">
                            <button type="submit" disabled={processing}
                                className="btn btn-primary min-h-[44px] transition active:scale-95">
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
