import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Dismissable flash banner for Inertia success/error messages.
 * - Click the X to close
 * - Success banners auto-dismiss after `autoDismissMs` (default 5s)
 * - Error banners stay until clicked away (user should read them)
 */
export default function FlashBanner({ type = 'success', message, autoDismissMs }) {
    const [visible, setVisible] = useState(!!message);

    // Reset visibility when a new message arrives.
    useEffect(() => {
        setVisible(!!message);
    }, [message]);

    // Auto-dismiss (default 5s for success; off for error unless explicit).
    useEffect(() => {
        if (!visible) return;
        const ms = autoDismissMs ?? (type === 'success' ? 5000 : null);
        if (!ms) return;
        const id = setTimeout(() => setVisible(false), ms);
        return () => clearTimeout(id);
    }, [visible, type, autoDismissMs]);

    if (!visible || !message) return null;

    const palette = type === 'success'
        ? { bg: 'rgba(34,197,94,0.10)',  fg: 'var(--success)', border: 'rgba(34,197,94,0.30)' }
        : { bg: 'rgba(239,68,68,0.10)',  fg: 'var(--danger)',  border: 'rgba(239,68,68,0.30)' };

    return (
        <div
            role={type === 'error' ? 'alert' : 'status'}
            className="anim-fade-in flex items-start gap-3 rounded-md px-4 py-2 text-sm"
            style={{ backgroundColor: palette.bg, color: palette.fg, border: `1px solid ${palette.border}` }}
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
