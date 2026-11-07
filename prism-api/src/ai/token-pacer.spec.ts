import { systemClock, TokenPacer, type PaceClock, type PaceProfile } from './token-pacer';

const PROFILE: PaceProfile = {
  tokensPerMinute: 8000,
  charsPerToken: 3.5,
  promptOverheadTokens: 800,
  assumedOutputTokens: 1200,
  maxWaitMs: 60_000,
};

function fakeClock(): PaceClock & { time: number; slept: number[] } {
  const clock = {
    time: 0,
    slept: [] as number[],
    now: () => clock.time,
    sleep: (ms: number) => {
      clock.slept.push(ms);
      clock.time += ms;

      return Promise.resolve();
    },
  };

  return clock;
}

describe('TokenPacer', () => {
  it('estimates input characters, prompt overhead and an assumed reply', () => {
    expect(new TokenPacer(PROFILE, fakeClock()).estimate(16_000)).toBe(4572 + 800 + 1200);
  });

  it('lets the first call go at once', async () => {
    const clock = fakeClock();

    expect(await new TokenPacer(PROFILE, clock).acquire(6572)).toBe(0);
    expect(clock.slept).toEqual([]);
  });

  it('holds a second large call until the first has left the minute window', async () => {
    const clock = fakeClock();
    const pacer = new TokenPacer(PROFILE, clock);

    await pacer.acquire(6572);
    const waited = await pacer.acquire(6572);

    expect(clock.slept).toEqual([60_000]);
    expect(waited).toBe(60_000);
  });

  it('lets two small calls share one minute', async () => {
    const clock = fakeClock();
    const pacer = new TokenPacer(PROFILE, clock);

    await pacer.acquire(3000);
    await pacer.acquire(3000);

    expect(clock.slept).toEqual([]);
  });

  it('counts a call only for the minute it was made in', async () => {
    const clock = fakeClock();
    const pacer = new TokenPacer(PROFILE, clock);

    await pacer.acquire(6572);
    clock.time += 61_000;
    await pacer.acquire(6572);

    expect(clock.slept).toEqual([]);
  });

  it('never waits longer than maxWaitMs, then lets the provider decide', async () => {
    const clock = fakeClock();
    const pacer = new TokenPacer({ ...PROFILE, maxWaitMs: 20_000 }, clock);

    await pacer.acquire(6572);
    const waited = await pacer.acquire(6572);

    expect(waited).toBe(20_000);
    expect(clock.slept).toEqual([20_000]);
  });

  it('admits a call bigger than the whole allowance when the window is empty', async () => {
    const clock = fakeClock();

    await new TokenPacer(PROFILE, clock).acquire(20_000);

    expect(clock.slept).toEqual([]);
  });

  it('does not pace a profile with no limit', async () => {
    const clock = fakeClock();
    const pacer = new TokenPacer({ ...PROFILE, tokensPerMinute: Number.POSITIVE_INFINITY }, clock);

    await pacer.acquire(1_000_000);
    await pacer.acquire(1_000_000);

    expect(clock.slept).toEqual([]);
  });
});

describe('systemClock.sleep', () => {
  it('rejects with the abort reason instead of finishing the wait', async () => {
    await expect(systemClock.sleep(10_000, AbortSignal.abort(new Error('job over')))).rejects.toThrow('job over');
  });

  it('resolves after the delay', async () => {
    await expect(systemClock.sleep(5)).resolves.toBeUndefined();
  });
});
