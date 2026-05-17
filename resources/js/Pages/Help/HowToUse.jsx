import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link } from '@inertiajs/react';
import {
    Bell,
    ChevronDown,
    FileSearch,
    GitBranch,
    GitPullRequest,
    Mail,
    MessageSquare,
    Shield,
    Sparkles,
} from 'lucide-react';
import { useState } from 'react';

// GitHub mark (lucide dropped brand icons)
function GithubIcon({ className }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
            <path d="M12 .5C5.65.5.5 5.66.5 12.04c0 5.1 3.29 9.42 7.86 10.96.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.87-1.55-3.87-1.55-.52-1.34-1.27-1.7-1.27-1.7-1.04-.72.08-.7.08-.7 1.15.08 1.75 1.19 1.75 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.29-5.24-5.74 0-1.27.45-2.31 1.19-3.13-.12-.3-.52-1.49.11-3.11 0 0 .97-.31 3.18 1.2.92-.26 1.91-.39 2.9-.39s1.98.13 2.9.39c2.21-1.51 3.18-1.2 3.18-1.2.63 1.62.23 2.81.11 3.11.74.82 1.19 1.86 1.19 3.13 0 4.47-2.69 5.45-5.25 5.73.41.36.78 1.07.78 2.16 0 1.56-.01 2.82-.01 3.2 0 .31.21.68.8.56 4.56-1.54 7.85-5.86 7.85-10.96C23.5 5.66 18.35.5 12 .5z" />
        </svg>
    );
}

function SectionHeading({ eyebrow, title, subtitle }) {
    return (
        <div className="text-center">
            {eyebrow && (
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] sm:text-xs" style={{ color: 'var(--accent)' }}>
                    {eyebrow}
                </p>
            )}
            <h2 className="mt-2 text-2xl font-bold tracking-tight lg:text-3xl" style={{ color: 'var(--text-primary)' }}>
                {title}
            </h2>
            {subtitle && (
                <p className="mt-2 text-sm leading-relaxed sm:text-base" style={{ color: 'var(--text-secondary)' }}>
                    {subtitle}
                </p>
            )}
        </div>
    );
}

function StepCard({ icon: Icon, step, title, items, note }) {
    return (
        <div className="card flex flex-col gap-3 p-5 sm:p-6">
            <div className="flex items-center gap-3">
                <div
                    className="grid h-10 w-10 place-items-center rounded-md"
                    style={{
                        color: 'var(--accent)',
                        backgroundColor: 'rgba(99,102,241,0.12)',
                        border: '1px solid rgba(99,102,241,0.30)',
                    }}
                >
                    <Icon className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>
                    Step {step}
                </span>
            </div>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
            <ol className="space-y-1.5 pl-5 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)', listStyle: 'decimal' }}>
                {items.map((item, i) => <li key={i}>{item}</li>)}
            </ol>
            {note && (
                <p className="mt-auto pt-2 text-xs italic" style={{ color: 'var(--text-muted)' }}>
                    {note}
                </p>
            )}
        </div>
    );
}

function AccordionItem({ icon, title, body, defaultOpen = false }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div
            className="overflow-hidden rounded-md transition"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
            <button
                type="button"
                onClick={() => setOpen((s) => !s)}
                className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-hover active:scale-[0.995]"
            >
                <span className="text-2xl">{icon}</span>
                <span className="flex-1 text-sm font-semibold sm:text-base" style={{ color: 'var(--text-primary)' }}>
                    {title}
                </span>
                <ChevronDown
                    className="h-4 w-4 transition-transform duration-200"
                    style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
            </button>
            <div
                className="grid transition-all duration-300 ease-out"
                style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
            >
                <div className="overflow-hidden">
                    <div
                        className="border-t px-4 py-3 text-sm leading-relaxed"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    >
                        {body}
                    </div>
                </div>
            </div>
        </div>
    );
}

function NotificationCard({ icon: Icon, title, blurb, steps }) {
    return (
        <div className="card p-5 sm:p-6">
            <div className="flex items-center gap-3">
                <div
                    className="grid h-10 w-10 place-items-center rounded-md"
                    style={{
                        color: 'var(--accent)',
                        backgroundColor: 'rgba(99,102,241,0.12)',
                        border: '1px solid rgba(99,102,241,0.30)',
                    }}
                >
                    <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{blurb}</p>
            <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Setup</p>
                <ol className="mt-1.5 space-y-1 pl-5 text-sm" style={{ color: 'var(--text-secondary)', listStyle: 'decimal' }}>
                    {steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
            </div>
        </div>
    );
}

function CheckTip({ children }) {
    return (
        <li className="flex items-start gap-3">
            <span
                className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full"
                style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: 'var(--success)' }}
            >
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                </svg>
            </span>
            <span className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{children}</span>
        </li>
    );
}

export default function HowToUse() {
    return (
        <AuthenticatedLayout
            header={
                <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wider sm:text-xs" style={{ color: 'var(--text-muted)' }}>Help</p>
                    <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">How to Use</h1>
                </div>
            }
        >
            <Head title="How to Use PRism" />

            <div className="mx-auto max-w-4xl space-y-16 sm:space-y-20">
                {/* ── 1. Hero ─────────────────────────────────────────── */}
                <section className="text-center">
                    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl" style={{ color: 'var(--text-primary)' }}>
                        Welcome to PRism <span aria-hidden>👋</span>
                    </h1>
                    <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed sm:text-base" style={{ color: 'var(--text-secondary)' }}>
                        Your AI code reviewer — set it up once, get smart reviews on every PR.
                    </p>
                    <div className="mt-6 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
                        style={{
                            color: 'var(--accent)',
                            backgroundColor: 'rgba(99,102,241,0.12)',
                            border: '1px solid rgba(99,102,241,0.30)',
                        }}>
                        <Sparkles className="h-4 w-4" />
                        Get Started in 3 Steps
                    </div>
                </section>

                {/* ── 1.5 Privacy & Security teaser ─────────────────── */}
                <section>
                    <div className="card flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:p-6"
                        style={{ borderColor: 'rgba(34,197,94,0.30)' }}>
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md"
                            style={{
                                color: 'var(--success)',
                                backgroundColor: 'rgba(34,197,94,0.10)',
                                border: '1px solid rgba(34,197,94,0.30)',
                            }}>
                            <Shield className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="text-base font-semibold sm:text-lg" style={{ color: 'var(--text-primary)' }}>
                                Privacy &amp; Security
                            </h3>
                            <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                Curious about how we handle your data? Visit the Security &amp; Privacy page to see exactly
                                what PRism accesses, how your token is encrypted, and how to revoke access anytime.
                            </p>
                        </div>
                        <Link href="/security" className="btn btn-primary min-h-[44px] shrink-0 transition active:scale-95">
                            <Shield className="h-4 w-4" /> Visit Security Page
                        </Link>
                    </div>
                </section>

                {/* ── 2. Quick Start ──────────────────────────────────── */}
                <section>
                    <SectionHeading
                        eyebrow="Quick start"
                        title="Three steps to your first review"
                    />
                    <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
                        <StepCard
                            icon={GitBranch}
                            step={1}
                            title="Connect a Repository"
                            items={[
                                'Click "Repositories" in the sidebar',
                                'Find the GitHub repo you want PRism to review',
                                'Click the "Connect" button next to it',
                                'PRism automatically installs a webhook on that repo',
                            ]}
                            note="Connection takes about 2 seconds. You'll see a green 'Connected' badge when done."
                        />
                        <StepCard
                            icon={GitPullRequest}
                            step={2}
                            title="Open a Pull Request"
                            items={[
                                'Create a new branch in your connected repo',
                                'Make your code changes and push',
                                'Open a PR targeting your main branch on GitHub',
                                'PRism automatically receives the webhook and starts analyzing',
                            ]}
                            note="First review typically completes in 10–30 seconds."
                        />
                        <StepCard
                            icon={FileSearch}
                            step={3}
                            title="Read Your Review"
                            items={[
                                'Open the Dashboard to see your PR in the table',
                                'Click on the PR title to open the full review',
                                'Browse issues by category (Security / Performance / Code Quality)',
                                'Check the "Auto-Fixes" tab for ready-to-use code suggestions',
                            ]}
                            note="Reviews are also commented directly on your GitHub PR."
                        />
                    </div>
                </section>

                {/* ── 3. Feature deep dive ────────────────────────────── */}
                <section>
                    <SectionHeading
                        eyebrow="Deep dive"
                        title="Every feature, explained"
                        subtitle="Click any item below to learn what it does and how to use it well."
                    />
                    <div className="mt-8 space-y-3">
                        <AccordionItem
                            icon="📊"
                            title="The Score (0-100)"
                            body={
                                <>
                                    Each PR gets an overall quality score. Higher is better.
                                    <ul className="mt-2 space-y-1 pl-5" style={{ listStyle: 'disc' }}>
                                        <li><strong style={{ color: 'var(--success)' }}>70+ (green):</strong> Safe to merge.</li>
                                        <li><strong style={{ color: 'var(--warning)' }}>40-70 (yellow):</strong> Needs review, has warnings.</li>
                                        <li><strong style={{ color: 'var(--danger)' }}>Below 40 (red):</strong> Has critical issues, don't merge yet.</li>
                                    </ul>
                                </>
                            }
                            defaultOpen
                        />
                        <AccordionItem
                            icon="🔒"
                            title="Security Tab"
                            body={<>PRism scans for: SQL injection vulnerabilities, hardcoded credentials, missing authorization checks, unsafe deserialization, XSS risks, and exposed secrets. Each issue shows the file, line number, and severity.</>}
                        />
                        <AccordionItem
                            icon="⚡"
                            title="Performance Tab"
                            body={<>Catches: N+1 database queries, missing indexes, inefficient loops, memory leaks, blocking I/O in async code, and unoptimized queries. Especially smart about Laravel Eloquent and React rendering patterns.</>}
                        />
                        <AccordionItem
                            icon="🧹"
                            title="Code Quality Tab"
                            body={<>Flags: SOLID principle violations, dead code, magic numbers, poor naming, missing type hints, console.log left in code, missing error handling, and code duplication.</>}
                        />
                        <AccordionItem
                            icon="🛠️"
                            title="Auto-Fixes Tab"
                            body={
                                <>
                                    PRism doesn't just complain — it shows you HOW to fix issues.
                                    <ul className="mt-2 space-y-1 pl-5" style={{ listStyle: 'disc' }}>
                                        <li>Side-by-side comparison: current code vs suggested fix</li>
                                        <li>Click <em>Copy Fix</em> to copy the corrected code to your clipboard</li>
                                        <li>Each fix includes an explanation of why it's better</li>
                                        <li>Limited to top 5 most impactful fixes per PR</li>
                                    </ul>
                                </>
                            }
                        />
                        <AccordionItem
                            icon="🔄"
                            title="Re-analyze Button"
                            body={<>If you push new commits to a PR, click <em>Re-analyze</em> on the review page to get a fresh review of the updated code. The old review is replaced with the new one.</>}
                        />
                        <AccordionItem
                            icon="📄"
                            title="Export PDF"
                            body={<>Need to share a review with a teammate who doesn't have PRism? Click <em>Export PDF</em> on any review page to download a polished report with all issues, scores, and the summary.</>}
                        />
                        <AccordionItem
                            icon="🏷️"
                            title="Language Detection"
                            body={<>PRism automatically detects the languages in your PR (PHP, JavaScript, TypeScript, Python, Go, Ruby, Java) and applies language-specific rules. For example, on PHP files it specifically looks for Laravel N+1 queries and missing validation.</>}
                        />
                        <AccordionItem
                            icon="📈"
                            title="Score Timeline"
                            body={<>On the Dashboard, see how your code quality is trending across your last 30 PRs. Watch yourself improve over time.</>}
                        />
                        <AccordionItem
                            icon="🎯"
                            title="Severity Filter"
                            body={<>On any review page, use the filter buttons at the top to focus on only Critical issues, or only Suggestions. Helpful when you want to fix the most important things first.</>}
                        />
                    </div>
                </section>

                {/* ── 3.5 Working without Pull Requests ───────────────── */}
                <section>
                    <SectionHeading
                        eyebrow="Solo developers"
                        title="Working without Pull Requests"
                        subtitle="Push directly to main? PRism still reviews every commit — no PR workflow required."
                    />
                    <ol className="mt-8 space-y-3 rounded-md p-5 sm:p-6"
                        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', listStyle: 'decimal', paddingLeft: '2.25rem' }}>
                        <li className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            Connect a repo from the <strong style={{ color: 'var(--text-primary)' }}>Repositories</strong> page and choose <strong style={{ color: 'var(--text-primary)' }}>"Direct commits to main/master"</strong> in the mode picker.
                        </li>
                        <li className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            Push directly to <code className="rounded px-1 font-mono" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)' }}>main</code> as you normally would.
                        </li>
                        <li className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            PRism receives the <code className="rounded px-1 font-mono" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)' }}>push</code> webhook automatically and reviews the head commit.
                        </li>
                        <li className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            Get notified via Email and Slack (if configured) — same as PR reviews.
                        </li>
                        <li className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            View commit reviews on the Dashboard under the <strong style={{ color: 'var(--text-primary)' }}>Commits</strong> tab.
                        </li>
                    </ol>
                    <p className="mt-4 text-center text-xs italic" style={{ color: 'var(--text-muted)' }}>
                        You can also pick <strong>"Both PRs and commits"</strong> on the mode picker to cover both workflows.
                    </p>
                </section>

                {/* ── 4. Notifications ────────────────────────────────── */}
                <section>
                    <SectionHeading
                        eyebrow="Stay informed"
                        title="Stay Notified"
                        subtitle="Get reviews delivered wherever you work."
                    />
                    <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <NotificationCard
                            icon={Mail}
                            title="Email Notifications"
                            blurb="PRism sends you a beautiful email when each review completes. Includes the score, summary, and a link to the full review."
                            steps={[
                                'Go to Settings (sidebar)',
                                'Toggle "Email Notifications" ON',
                                'That\'s it — you\'re done',
                            ]}
                        />
                        <NotificationCard
                            icon={MessageSquare}
                            title="Slack Notifications"
                            blurb="Get review summaries posted directly to your Slack workspace. Color-coded by score, includes top issues and a link."
                            steps={[
                                'In Slack: Apps → Incoming Webhooks → Add to Slack',
                                'Choose a channel and copy the webhook URL',
                                'In PRism Settings, paste the URL and click "Test"',
                                'You\'ll see a test message in Slack confirming it works',
                            ]}
                        />
                    </div>
                </section>

                {/* ── 5. Pro tips ─────────────────────────────────────── */}
                <section>
                    <SectionHeading
                        eyebrow="Best practices"
                        title="Pro Tips"
                    />
                    <ul className="mt-8 space-y-3 rounded-md p-5 sm:p-6"
                        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                        <CheckTip>Keep PRs small (under 400 lines) for the most accurate AI analysis.</CheckTip>
                        <CheckTip>Open PRs against your main branch — that's what triggers PRism.</CheckTip>
                        <CheckTip>Re-analyze after pushing fixes to see your score improve.</CheckTip>
                        <CheckTip>Use the Auto-Fixes tab first — those are the highest-impact changes.</CheckTip>
                        <CheckTip>Check the score trend chart weekly to track team improvement.</CheckTip>
                        <CheckTip>Add your Slack webhook so your whole team sees reviews.</CheckTip>
                        <CheckTip>Export PDFs for code review documentation in retrospectives.</CheckTip>
                    </ul>
                </section>

                {/* ── 6. FAQ ──────────────────────────────────────────── */}
                <section>
                    <SectionHeading
                        eyebrow="Common questions"
                        title="Frequently Asked Questions"
                    />
                    <div className="mt-8 space-y-3">
                        <AccordionItem
                            icon="⏱️"
                            title="How long does a review take?"
                            body={<>Most reviews complete in 10-30 seconds. Larger PRs (1000+ lines) may take up to a minute. If a review is stuck on "analyzing" for over 5 minutes, click <em>Re-analyze</em> to retry.</>}
                        />
                        <AccordionItem
                            icon="🔑"
                            title="Why does PRism ask for repository access?"
                            body={<>To install a webhook (so we know when you open a PR), read the PR diff for analysis, and post review comments. <strong style={{ color: 'var(--text-primary)' }}>We never push code, modify files, or store your source code.</strong> See the <a href="/security" className="underline" style={{ color: 'var(--accent)' }}>Security &amp; Privacy</a> page for full details.</>}
                        />
                        <AccordionItem
                            icon="🔐"
                            title="Is my code sent anywhere?"
                            body={<>Your code diff is sent to OpenRouter (a free AI gateway) for analysis. It's not stored after the analysis completes. PRism itself only stores the review results, not your source code.</>}
                        />
                        <AccordionItem
                            icon="🌐"
                            title="What languages does PRism support?"
                            body={<>PHP, JavaScript, TypeScript, Python, Go, Ruby, and Java with language-specific rules. Other languages get generic code quality checks.</>}
                        />
                        <AccordionItem
                            icon="⚙️"
                            title="Can I customize the rules?"
                            body={<>Not yet — custom rules are on the roadmap. Currently rules are built-in based on industry best practices and framework conventions.</>}
                        />
                        <AccordionItem
                            icon="🚫"
                            title="Does PRism block my PR from merging?"
                            body={<>No, PRism only provides reviews and suggestions. It never blocks merges. You decide what to do with the feedback.</>}
                        />
                        <AccordionItem
                            icon="❌"
                            title="My review failed — what now?"
                            body={<>Click <em>Re-analyze</em> on the review page to retry. If it keeps failing, check the Settings page or contact support. Most failures are due to AI API rate limits and resolve themselves.</>}
                        />
                        <AccordionItem
                            icon="🔒"
                            title="Can I use PRism on private repositories?"
                            body={<>Yes! When you authorize PRism, it gets access to your private repos too. The repository data stays within PRism's encrypted database.</>}
                        />
                        <AccordionItem
                            icon="💸"
                            title="Is PRism free?"
                            body={<>Yes, PRism is completely free and open-source. It runs on free-tier infrastructure with the OpenRouter free AI model.</>}
                        />
                    </div>
                </section>

                {/* ── 7. Footer CTA ───────────────────────────────────── */}
                <section className="text-center">
                    <div
                        className="rounded-md p-8 sm:p-10"
                        style={{
                            background:
                                'radial-gradient(60% 80% at 50% 0%, rgba(99,102,241,0.18) 0%, rgba(10,10,15,0) 70%), var(--bg-card)',
                            border: '1px solid var(--border)',
                        }}
                    >
                        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: 'var(--text-primary)' }}>
                            Ready to get started?
                        </h2>
                        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                            Connect your first repository and let PRism review your next pull request.
                        </p>
                        <Link
                            href="/repositories"
                            className="btn btn-primary mt-6 inline-flex min-h-[44px] transition active:scale-95"
                        >
                            <GitBranch className="h-4 w-4" />
                            Connect Your First Repository
                        </Link>
                        <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                            Still have questions?{' '}
                            <a
                                href="https://github.com/Muhammad-AIUB/PRISM"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 underline"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                Reach out on GitHub <GithubIcon className="h-3 w-3" />
                            </a>
                        </p>
                    </div>
                </section>
            </div>
        </AuthenticatedLayout>
    );
}
