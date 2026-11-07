import { AnthropicProvider } from './anthropic.provider';
import type { AiProvider, ProviderId } from './ai-provider';
import { GroqProvider } from './groq.provider';
import {
  GOOGLE,
  OPENAI,
  OPENROUTER,
  OpenAiCompatibleProvider,
} from './openai-compatible.provider';

const PROVIDERS: Record<ProviderId, AiProvider> = {
  groq: new GroqProvider(),
  openai: new OpenAiCompatibleProvider(OPENAI),
  google: new OpenAiCompatibleProvider(GOOGLE),
  openrouter: new OpenAiCompatibleProvider(OPENROUTER),
  anthropic: new AnthropicProvider(),
};

export function providerFor(id: ProviderId): AiProvider {
  const provider = (PROVIDERS as Partial<Record<string, AiProvider>>)[id];

  if (!provider) {
    throw new Error('Unknown AI provider: ' + id);
  }

  return provider;
}

/** The providers a user can bring a key for. Groq is the default, not a choice. */
export const SELECTABLE_PROVIDERS = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'google', label: 'Google Gemini' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'anthropic', label: 'Anthropic Claude' },
] as const;
