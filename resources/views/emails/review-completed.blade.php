<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>PRism Review Complete</title>
</head>
<body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; background:#0f0f13; color:#e2e8f0; margin:0; padding:24px;">
    <div style="max-width:560px; margin:0 auto; background:#1a1a24; border-radius:8px; padding:24px;">
        <h1 style="margin:0 0 16px; font-size:20px;">PRism Review Complete</h1>
        <p style="color:#94a3b8; margin:0 0 4px;">{{ $pr->repository?->full_name }} · #{{ $pr->pr_number }}</p>
        <h2 style="margin:0 0 16px; font-size:16px; color:#e2e8f0;">{{ $pr->title }}</h2>

        @if ($review)
            <div style="background:#0f0f13; padding:16px; border-radius:6px; margin:16px 0;">
                <p style="margin:0; color:#94a3b8; font-size:12px; text-transform:uppercase; letter-spacing:1px;">Overall Score</p>
                <p style="margin:4px 0 0; font-size:32px; font-weight:700;
                          color: @if($review->overall_score > 70) #22c55e @elseif($review->overall_score >= 40) #f59e0b @else #ef4444 @endif;">
                    {{ $review->overall_score ?? 'N/A' }}<span style="font-size:14px; color:#64748b;"> / 100</span>
                </p>
            </div>

            @if ($review->summary)
                <p style="color:#e2e8f0; line-height:1.6; white-space:pre-line;">{{ $review->summary }}</p>
            @endif
        @endif

        <p style="margin-top:24px;">
            <a href="{{ $url }}" style="display:inline-block; background:#6366f1; color:white; padding:10px 20px; border-radius:6px; text-decoration:none; font-weight:600;">View full review</a>
        </p>

        <hr style="border:0; border-top:1px solid #262635; margin:24px 0;">
        <p style="color:#64748b; font-size:11px; margin:0;">Sent by PRism. AI-powered code review.</p>
    </div>
</body>
</html>
