import type { ProviderId } from './ai-provider';
import { providerFor, SELECTABLE_PROVIDERS } from './registry';

it('returns the provider for an id', () => {
  expect(providerFor('openai').id).toBe('openai');
  expect(providerFor('groq').id).toBe('groq');
});

it('offers the four bring-your-own providers, not Groq', () => {
  expect(SELECTABLE_PROVIDERS.map((p) => p.id)).toEqual(['openai', 'google', 'openrouter', 'anthropic']);
});

it('throws on an unknown id', () => {
  expect(() => providerFor('nope' as ProviderId)).toThrow('Unknown AI provider');
});
