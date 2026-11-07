/**
 * Keeps a multi-call review inside a provider's per-minute token allowance.
 *
 * Groq's free tier allows about 8,000 tokens a minute per model, which a
 * 16,000-character batch alone nearly fills. Without pacing, batch two meets a
 * 429 by design and a review that needed no retry fails its way into one. Pure
 * apart from the injected clock, so tests run on a fake one and take no time.
 *
 * It only ever delays; it never refuses. A wait is capped at `maxWaitMs`, after
 * which the call goes ahead and the provider decides, because a pacer that
 * blocked forever would spend the job budget on sleeping.
 */
export interface PaceProfile {
  /** The provider's tokens-per-minute allowance. Infinity means do not pace. */
  tokensPerMinute: number;
  /** Characters per token used to estimate a prompt. An assumption, not a measurement. */
  charsPerToken: number;
  /** The system prompt and framing every call carries. */
  promptOverheadTokens: number;
  /** What a reply is expected to cost. Unknown until measured against a live key. */
  assumedOutputTokens: number;
  /** The longest one call may be held back. */
  maxWaitMs: number;
}

export interface PaceClock {
  now(): number;
  /** Rejects with the signal's reason when it aborts. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export const systemClock: PaceClock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve, reject) => {
      const fail = (): void =>
        reject(signal?.reason instanceof Error ? signal.reason : new Error(String(signal?.reason)));

      if (signal?.aborted) {
        fail();

        return;
      }

      const onAbort = (): void => {
        clearTimeout(timer);
        fail();
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      signal?.addEventListener('abort', onAbort, { once: true });
    }),
};

const WINDOW_MS = 60_000;

export class TokenPacer {
  private readonly spent: { at: number; tokens: number }[] = [];

  constructor(
    private readonly profile: PaceProfile,
    private readonly clock: PaceClock = systemClock,
  ) {}

  /** Tokens one call is expected to cost, given the characters it sends. */
  estimate(inputChars: number): number {
    return (
      Math.ceil(inputChars / this.profile.charsPerToken) +
      this.profile.promptOverheadTokens +
      this.profile.assumedOutputTokens
    );
  }

  /** Resolves when the call may go. Returns how long it was held back, in ms. */
  async acquire(tokens: number, signal?: AbortSignal): Promise<number> {
    if (!Number.isFinite(this.profile.tokensPerMinute)) {
      return 0;
    }

    const started = this.clock.now();

    for (;;) {
      const now = this.clock.now();

      while (this.spent.length > 0 && now - (this.spent[0]?.at ?? now) >= WINDOW_MS) {
        this.spent.shift();
      }

      const used = this.spent.reduce((sum, entry) => sum + entry.tokens, 0);
      const waited = now - started;
      const oldest = this.spent[0];

      // An empty window always admits one call, even one bigger than the whole
      // allowance: nothing it could wait for would make it fit.
      if (!oldest || used + tokens <= this.profile.tokensPerMinute || waited >= this.profile.maxWaitMs) {
        this.spent.push({ at: now, tokens });

        return waited;
      }

      await this.clock.sleep(Math.min(oldest.at + WINDOW_MS - now, this.profile.maxWaitMs - waited), signal);
    }
  }
}
