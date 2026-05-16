<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="dark">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">

        <title inertia>{{ config('app.name', 'PRism') }}</title>

        {{-- Apply persisted theme before paint to avoid flash --}}
        <script>
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
