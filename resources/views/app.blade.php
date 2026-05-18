@php
    // Hardcoded — config('app.name') falls back to 'Laravel' if APP_NAME is unset.
    $title       = 'PRism · AI Code Review';
    $description = 'AI-powered code review for GitHub pull requests and commits. Get instant security, performance, and code-quality feedback on every PR — free, open-source, and self-hostable.';
    $ogImage     = asset('og-image.svg');
    $currentUrl  = url()->current();
@endphp
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="dark">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">

        <title inertia>{{ $title }}</title>
        <meta name="description" content="{{ $description }}">
        <meta name="theme-color" content="#6366f1">
        <link rel="canonical" href="{{ $currentUrl }}">

        {{-- Open Graph (Facebook, WhatsApp, LinkedIn, Slack, Discord, …) --}}
        <meta property="og:type"        content="website">
        <meta property="og:site_name"   content="PRism">
        <meta property="og:title"       content="{{ $title }}">
        <meta property="og:description" content="{{ $description }}">
        <meta property="og:url"         content="{{ $currentUrl }}">
        <meta property="og:image"       content="{{ $ogImage }}">
        <meta property="og:image:type"  content="image/svg+xml">
        <meta property="og:image:width" content="1200">
        <meta property="og:image:height" content="630">
        <meta property="og:image:alt"   content="PRism — AI-powered code review">

        {{-- Twitter / X --}}
        <meta name="twitter:card"        content="summary_large_image">
        <meta name="twitter:title"       content="{{ $title }}">
        <meta name="twitter:description" content="{{ $description }}">
        <meta name="twitter:image"       content="{{ $ogImage }}">
        <meta name="twitter:image:alt"   content="PRism — AI-powered code review">

        {{-- Favicons --}}
        <link rel="icon" type="image/svg+xml" href="{{ asset('favicon.svg') }}">

        {{-- Fonts --}}
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link
            href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
            rel="stylesheet"
        >

        {{-- Apply persisted theme before paint to avoid flash --}}
        <script>
            // Safe: UI preference only, no PII or auth data.
            // The only key PRism writes to localStorage is `prism-theme` ('light'|'dark').
            (function () {
                try {
                    var t = localStorage.getItem('prism-theme');
                    if (t === 'light') {
                        document.documentElement.classList.remove('dark');
                        document.documentElement.classList.add('light');
                    } else {
                        document.documentElement.classList.add('dark');
                    }
                } catch (e) {}
            })();
        </script>

        {{-- Scripts --}}
        @routes
        @viteReactRefresh
        @vite(['resources/js/app.jsx', "resources/js/Pages/{$page['component']}.jsx"])
        @inertiaHead
    </head>
    <body class="antialiased">
        @inertia
    </body>
</html>
