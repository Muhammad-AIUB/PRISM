/**
 * Carbon's `toIso8601String()` emits an explicit "+00:00" offset:
 *   2026-06-12T11:28:00+00:00
 * JavaScript's `Date#toISOString()` emits milliseconds and a "Z":
 *   2026-06-12T11:28:00.000Z
 *
 * Those are different strings. The MCP client compares and displays them, so
 * reproduce Laravel's exact format rather than the JS default.
 */
export function toIso8601String(date: Date | null | undefined): string | null {
  if (!date) {
    return null;
  }

  return `${date.toISOString().slice(0, 19)}+00:00`;
}
