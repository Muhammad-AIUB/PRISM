import type { Metadata, Viewport } from 'next';
// Self-hosted, not the Google Fonts CDN: no render-blocking third-party
// request, no visitor IPs sent to Google, and the font ships with the build,
// so it cannot fail independently of the app. Inter's optical-size cut adjusts
// letterforms to the rendered size, the way SF Pro does.
import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';

const TITLE = 'PRism · AI Code Review';
const DESCRIPTION =
  'AI-powered code review for GitHub pull requests and commits. Get instant security, performance, and code-quality feedback on every PR — free, open-source, and self-hostable.';

export const metadata: Metadata = {
  // Needed to turn the relative OG image path into an absolute URL; without
  // it Next falls back to localhost and shares link previews nobody can load.
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3001'),
  title: { default: TITLE, template: '%s · PRism' },
  description: DESCRIPTION,
  icons: { icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }] },
  openGraph: {
    type: 'website',
    siteName: 'PRism',
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: '/og-image.svg',
        width: 1200,
        height: 630,
        alt: 'PRism — AI-powered code review',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/og-image.svg'],
  },
};

export const viewport: Viewport = { themeColor: '#4f46e5' };

/**
 * Applies the saved theme before first paint. Anything later — an effect, a
 * client component — repaints after the browser has already shown the default,
 * which is the flash of the wrong theme this exists to prevent.
 *
 * `prism-theme` ('light' | 'dark') is the only thing PRism puts in
 * localStorage. No tokens, no PII: the session is an httpOnly cookie.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('prism-theme');var r=document.documentElement;r.classList.remove('light','dark');r.classList.add(t==='light'?'light':'dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // THEME_SCRIPT swaps this class before React hydrates, so the server's
    // "dark" and the client's "light" legitimately differ. This suppresses the
    // mismatch warning for <html>'s own attributes only, not its children.
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
