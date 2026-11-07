import { GROQ_MODELS, GROQ_TIMEOUT_MS } from '../../ai/ai-client.service';
import { REQUEST_TIMEOUT_MS as GITHUB_TIMEOUT_MS } from '../../github/github-client.service';
import { BATCH_CONFIG, BATCH_WORST_CASE_MS, GROQ_FREE_PACE, jobBudgetMs } from './batching.config';

describe('batching config', () => {
  it('starts from the spike defaults', () => {
    expect(BATCH_CONFIG).toEqual({ batchChars: 16_000, maxBatches: 8 });
  });

  it('gives one batch the own-model attempt plus the whole Groq chain', () => {
    expect(BATCH_WORST_CASE_MS).toBe(GROQ_TIMEOUT_MS * (GROQ_MODELS.length + 1));
  });

  it('derives the budget from the spike formula plus the pacing wait', () => {
    const n = 8;
    const spike = GROQ_TIMEOUT_MS * (n * (GROQ_MODELS.length + 1) + 1) + 2 * GITHUB_TIMEOUT_MS + 30_000;

    expect(jobBudgetMs(n)).toBe(spike + n * GROQ_FREE_PACE.maxWaitMs);
  });

  it('grows by one batch worst case and one pacing wait per batch', () => {
    expect(jobBudgetMs(5) - jobBudgetMs(4)).toBe(BATCH_WORST_CASE_MS + GROQ_FREE_PACE.maxWaitMs);
  });
});
