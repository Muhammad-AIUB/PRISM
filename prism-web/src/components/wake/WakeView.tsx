'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { isHibernating } from '@/lib/wake';

const CHECK_EVERY_MS = 3_000;
const PING_EVERY_MS = 10_000;
const SLOW_AFTER_MS = 90_000;

function leave(next: string) {
  // replace(), so Back does not return to a page whose only job is done.
  window.location.replace(next);
}

/**
 * Starts a sleeping prism-api from the visitor's browser, then moves on.
 *
 * Two requests, for two different jobs. The ping goes straight to the API:
 * that is what makes Render start it, and its answer is unreadable (no-cors)
 * and not needed. The check goes through this site like every other call, and
 * is how the page learns the API is answering again. See src/lib/wake.ts.
 */
export default function WakeView({
  apiOrigin,
  next,
  onAwake = leave,
}: {
  apiOrigin: string;
  next: string;
  onAwake?: (next: string) => void;
}) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let done = false;

    const stop = () => {
      done = true;
      clearInterval(checkTimer);
      clearInterval(pingTimer);
      clearTimeout(slowTimer);
    };

    const ping = () => {
      fetch(`${apiOrigin}/health`, { mode: 'no-cors', cache: 'no-store' }).catch(() => {
        // Refused or offline. The next ping tries again.
      });
    };

    const check = async () => {
      try {
        const response = await fetch('/auth/me', { cache: 'no-store' });

        if (!done && !isHibernating(response)) {
          stop();
          onAwake(next);
        }
      } catch {
        // A dropped connection is not an answer. Keep waiting.
      }
    };

    const checkTimer = setInterval(() => void check(), CHECK_EVERY_MS);
    const pingTimer = setInterval(ping, PING_EVERY_MS);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);

    ping();
    void check();

    return stop;
  }, [apiOrigin, next, onAwake]);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center p-6 text-center"
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--accent)' }} aria-hidden />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Starting the server</h1>
      <p
        className="mt-2 max-w-md text-sm"
        style={{ color: 'var(--text-secondary)' }}
        role="status"
      >
        PRism&apos;s server sleeps when nobody is using it. Waking it takes about a minute, and
        this page continues on its own when it is ready.
      </p>
      {slow && (
        <>
          <p className="mt-6 max-w-md text-sm" style={{ color: 'var(--text-muted)' }}>
            This is taking longer than usual.
          </p>
          <a href={next} className="btn btn-secondary mt-3 min-h-[44px]">
            Try again
          </a>
        </>
      )}
    </div>
  );
}
