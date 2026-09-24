import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { absoluteTime, relativeTime } from './time';

const NOW = new Date('2026-09-24T12:00:00+00:00');

function ago(seconds: number): string {
  return new Date(NOW.getTime() - seconds * 1000).toISOString();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('relativeTime', () => {
  it('renders a dash for a missing timestamp', () => {
    expect(relativeTime(null)).toBe('—');
    expect(relativeTime(undefined)).toBe('—');
    expect(relativeTime('')).toBe('—');
  });

  it('returns an unparseable string unchanged rather than "Invalid Date"', () => {
    expect(relativeTime('not a date')).toBe('not a date');
  });

  it.each([
    [0, 'just now'],
    [59, 'just now'],
    [60, '1m ago'],
    [3599, '59m ago'],
    [3600, '1h ago'],
    [86_399, '23h ago'],
    [86_400, '1d ago'],
    [604_799, '6d ago'],
  ])('%is ago is "%s"', (seconds, expected) => {
    expect(relativeTime(ago(seconds))).toBe(expected);
  });

  it('reads the API format with an explicit +00:00 offset', () => {
    expect(relativeTime('2026-09-24T11:00:00+00:00')).toBe('1h ago');
  });

  it('falls back to a date, or a date and time, after a week', () => {
    const old = ago(604_800);
    const date = new Date(old);

    expect(relativeTime(old)).toBe(date.toLocaleDateString());
    expect(relativeTime(old, 'datetime')).toBe(date.toLocaleString());
  });
});

describe('absoluteTime', () => {
  it('is empty for a missing timestamp and passes through garbage', () => {
    expect(absoluteTime(null)).toBe('');
    expect(absoluteTime('nope')).toBe('nope');
  });

  it('formats a valid timestamp in the local format', () => {
    const iso = '2026-09-24T11:00:00+00:00';

    expect(absoluteTime(iso)).toBe(new Date(iso).toLocaleString());
  });
});
