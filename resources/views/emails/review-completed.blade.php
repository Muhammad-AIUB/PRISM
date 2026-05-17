@php
    $score      = $review->overall_score;
    $scoreColor = $score === null ? '#94a3b8' : ($score > 70 ? '#22c55e' : ($score >= 40 ? '#f59e0b' : '#ef4444'));
    $sevColors  = ['critical' => '#ef4444', 'warning' => '#f59e0b', 'suggestion' => '#6366f1'];
@endphp
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>PRism Review Complete</title>
</head>
<body style="margin:0; padding:0; background:#0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#e2e8f0;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#0a0a0f; padding:24px 0;">
        <tr>
            <td align="center">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px; background:#1a1a24; border:1px solid #2a2a36; border-radius:8px; overflow:hidden;">
                    {{-- Header --}}
                    <tr>
                        <td style="padding:24px 28px 0; text-align:left;">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td style="vertical-align:middle;">
                                        <div style="display:inline-block; width:32px; height:32px; line-height:32px; text-align:center; border-radius:6px; background:linear-gradient(135deg,#6366f1 0%,#a855f7 100%); color:#fff; font-weight:700; font-size:14px;">P</div>
                                    </td>
                                    <td style="vertical-align:middle; padding-left:10px;">
                                        <span style="font-size:18px; font-weight:700; background:linear-gradient(135deg,#818cf8,#a855f7); -webkit-background-clip:text; background-clip:text; color:transparent;">PRism</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    {{-- Greeting --}}
                    <tr>
                        <td style="padding:20px 28px 0;">
                            <p style="margin:0; font-size:15px; color:#e2e8f0;">
                                Hey {{ $user?->github_username ?? $user?->name ?? 'there' }} 👋
                            </p>
                            <p style="margin:8px 0 0; font-size:14px; color:#94a3b8; line-height:1.55;">
                                Your AI review for <strong style="color:#e2e8f0;">{{ $pr->repository?->full_name }}</strong> · PR #{{ $pr->pr_number }} just finished.
                            </p>
                        </td>
                    </tr>

                    {{-- PR title --}}
                    <tr>
                        <td style="padding:16px 28px 0;">
                            <a href="{{ $reviewUrl }}" style="color:#e2e8f0; text-decoration:none;">
                                <h2 style="margin:0; font-size:18px; font-weight:600; line-height:1.4; color:#e2e8f0;">{{ $pr->title }}</h2>
                            </a>
                        </td>
                    </tr>

                    {{-- Score block --}}
                    <tr>
                        <td style="padding:20px 28px 0;">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#13131a; border:1px solid #2a2a36; border-radius:8px;">
                                <tr>
                                    <td style="padding:18px 22px;" align="center">
                                        <p style="margin:0; font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:#94a3b8;">Overall Score</p>
                                        <p style="margin:6px 0 0; font-size:42px; font-weight:800; line-height:1; color:{{ $scoreColor }};">
                                            {{ $score ?? 'N/A' }}<span style="font-size:18px; color:#64748b; font-weight:500;"> / 100</span>
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    {{-- Summary --}}
                    @if ($review->summary)
                        <tr>
                            <td style="padding:18px 28px 0;">
                                <p style="margin:0 0 6px; font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:#94a3b8;">AI Summary</p>
                                <p style="margin:0; font-size:14px; line-height:1.6; color:#e2e8f0; white-space:pre-line;">{{ $review->summary }}</p>
                            </td>
                        </tr>
                    @endif

                    {{-- Top 3 issues --}}
                    @if ($topIssues->isNotEmpty())
                        <tr>
                            <td style="padding:20px 28px 0;">
                                <p style="margin:0 0 10px; font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:#94a3b8;">Top Issues</p>
                                @foreach ($topIssues as $issue)
                                    @php
                                        $sev      = $issue['severity'] ?? 'suggestion';
                                        $sevColor = $sevColors[$sev] ?? '#6366f1';
                                    @endphp
                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#13131a; border:1px solid #2a2a36; border-radius:6px; margin-bottom:8px;">
                                        <tr>
                                            <td style="padding:12px 14px;">
                                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                    <tr>
                                                        <td style="vertical-align:top;">
                                                            <span style="display:inline-block; padding:2px 8px; font-size:10px; font-weight:600; text-transform:uppercase; color:{{ $sevColor }}; background:{{ $sevColor }}1A; border:1px solid {{ $sevColor }}40; border-radius:99px;">{{ $sev }}</span>
                                                            @if (! empty($issue['file']))
                                                                <span style="display:inline-block; margin-left:6px; padding:2px 6px; font-family:'JetBrains Mono', ui-monospace, Menlo, monospace; font-size:11px; color:#94a3b8; background:#22222e; border-radius:4px;">{{ $issue['file'] }}{{ ! empty($issue['line']) ? ':'.$issue['line'] : '' }}</span>
                                                            @endif
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding-top:6px; font-size:13px; line-height:1.5; color:#e2e8f0;">{{ $issue['comment'] ?? '' }}</td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>
                                @endforeach
                            </td>
                        </tr>
                    @endif

                    {{-- CTA button --}}
                    <tr>
                        <td style="padding:24px 28px 8px;" align="center">
                            <a href="{{ $reviewUrl }}"
                                style="display:inline-block; padding:12px 28px; font-size:14px; font-weight:600; color:#ffffff; background:#6366f1; text-decoration:none; border-radius:6px;">
                                View Full Review
                            </a>
                        </td>
                    </tr>

                    {{-- Footer --}}
                    <tr>
                        <td style="padding:18px 28px 24px; border-top:1px solid #2a2a36; margin-top:8px;">
                            <p style="margin:14px 0 0; font-size:11px; line-height:1.5; color:#64748b; text-align:center;">
                                Sent by PRism · AI-powered code review.<br>
                                You're receiving this because email notifications are enabled. <a href="{{ url('/settings') }}" style="color:#94a3b8;">Manage preferences</a>.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
