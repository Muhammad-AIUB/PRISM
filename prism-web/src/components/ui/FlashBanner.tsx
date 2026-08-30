'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Port of the Inertia FlashBanner.
 *
 * Success banners clear themselves after 5s; error banners stay until
 * dismissed, because the user needs time to actually read them.
 */
export default function FlashBanner({
  type = 'success',
  message,
  autoDismissMs,
}: {
  type?: 'success' | 'error';
  message?: string | null;
  autoDismissMs?: number;
}) {
  const [visible, setVisible] = useState(Boolean(message));

  // A new message re-opens a banner the user had dismissed.
  useEffect(() => {
    setVisible(Boolean(message));
  }, [message]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const ms = autoDismissMs ?? (type === 'success' ? 5000 : null);

    if (!ms) {
      return;
    }

    const id = setTimeout(() => setVisible(false), ms);

    return () => clearTimeout(id);
  }, [visible, type, autoDismissMs]);

  if (!visible || !message) {
    return null;
  }

  const palette =
    type === 'success'
      ? { bg: 'rgba(34,197,94,0.10)', fg: 'var(--success)', border: 'rgba(34,197,94,0.30)' }
      : { bg: 'rgba(239,68,68,0.10)', fg: 'var(--danger)', border: 'rgba(239,68,68,0.30)' };

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className="anim-fade-in flex items-start gap-3 rounded-md px-4 py-2 text-sm"
      style={{
        backgroundColor: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.border}`,
      }}
    >
      <span className="min-w-0 flex-1">{message}</span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        className="-mr-1 shrink-0 rounded p-1 transition hover:bg-hover active:scale-95"
        style={{ color: palette.fg }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
