import { randomString, watchedBranchesFor, webhookEventsFor } from './repository.helpers';

describe('webhookEventsFor', () => {
  it.each([
    ['pr_only', ['pull_request']],
    ['commit_only', ['push']],
    ['both', ['pull_request', 'push']],
  ])('subscribes %s to %p', (mode, expected) => {
    expect(webhookEventsFor(mode)).toEqual(expected);
  });

  it('falls back to pull_request for an unrecognised mode', () => {
    // Laravel's match() default arm — the column is varchar + CHECK, so a
    // value written outside the app is possible.
    expect(webhookEventsFor('something-else')).toEqual(['pull_request']);
  });
});

describe('watchedBranchesFor', () => {
  it('defaults an empty or absent list to main and master', () => {
    // Not "watch everything": a push to any other branch is ignored.
    expect(watchedBranchesFor(null)).toEqual(['main', 'master']);
    expect(watchedBranchesFor([])).toEqual(['main', 'master']);
    expect(watchedBranchesFor(undefined)).toEqual(['main', 'master']);
  });

  it('keeps an explicit list as given', () => {
    expect(watchedBranchesFor(['develop', 'release'])).toEqual(['develop', 'release']);
  });

  it('drops empty entries, as array_filter does', () => {
    expect(watchedBranchesFor(['develop', '', 'main'])).toEqual(['develop', 'main']);
  });
});

describe('randomString', () => {
  it('returns exactly the requested length', () => {
    expect(randomString(40)).toHaveLength(40);
    expect(randomString(1)).toHaveLength(1);
    expect(randomString()).toHaveLength(40);
  });

  it('stays alphanumeric — the value is copied into GitHub webhook config', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(randomString(40)).toMatch(/^[A-Za-z0-9]{40}$/);
    }
  });

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 200 }, () => randomString(40)));

    expect(seen.size).toBe(200);
  });
});
