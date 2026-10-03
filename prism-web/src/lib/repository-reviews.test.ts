import { describe, expect, it } from 'vitest';
import { reviewsQuery } from './repository-reviews';

/**
 * The API answers 422 to a kind or page it does not accept, and a 422 on a
 * page load renders the error screen. A hand-edited URL should fall back to
 * the defaults instead, so only acceptable values are forwarded.
 */
describe('reviewsQuery', () => {
  it('is empty when the URL carries nothing', () => {
    expect(reviewsQuery({})).toBe('');
  });

  it('forwards a valid kind and page', () => {
    expect(reviewsQuery({ kind: 'commits', page: '3' })).toBe('?kind=commits&page=3');
  });

  it.each(['pr', 'PRS', ''])('drops kind %j', (kind) => {
    expect(reviewsQuery({ kind })).toBe('');
  });

  it.each(['0', '-1', '1.5', 'abc', '01', '99999999999999999999'])('drops page %j', (page) => {
    expect(reviewsQuery({ page })).toBe('');
  });

  it('drops a repeated parameter rather than guessing which one was meant', () => {
    expect(reviewsQuery({ kind: ['prs', 'commits'], page: ['1', '2'] })).toBe('');
  });
});
