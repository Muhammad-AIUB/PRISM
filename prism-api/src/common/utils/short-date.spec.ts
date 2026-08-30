import { formatShortDate } from './short-date';

/**
 * Carbon's format('M d, Y'), shown to people on the Security → My Data screen.
 */
describe('formatShortDate', () => {
  it('renders as "Aug 30, 2026"', () => {
    expect(formatShortDate(new Date('2026-08-30T16:45:00Z'))).toBe('Aug 30, 2026');
  });

  it('zero-pads the day, because PHP `d` is two digits', () => {
    expect(formatShortDate(new Date('2026-01-05T00:00:00Z'))).toBe('Jan 05, 2026');
  });

  it('formats in UTC, not the host timezone', () => {
    // 23:30Z on the 31st is already the 1st in Dhaka; Laravel's app timezone
    // is UTC, so this must stay the 31st.
    expect(formatShortDate(new Date('2026-12-31T23:30:00Z'))).toBe('Dec 31, 2026');
  });

  it.each([[null], [undefined]])('returns null for %p', (value) => {
    expect(formatShortDate(value)).toBeNull();
  });

  it('covers every month name', () => {
    const names = Array.from({ length: 12 }, (_unused, month) =>
      formatShortDate(new Date(Date.UTC(2026, month, 1)))?.split(' ')[0],
    );

    expect(names).toEqual([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]);
  });
});
