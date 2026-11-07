export type AiCallContext = 'commit_review' | 'pr_review' | 'design_advice';
export type ProviderId = 'groq' | 'openai' | 'google' | 'openrouter' | 'anthropic';

export interface CompletionRequest {
  model: string;
  system: string;
  user: string;
  context: AiCallContext;
  apiKey: string;
  signal?: AbortSignal;
}

export interface CompletionResult {
  ok: boolean;
  status: number;
  /** Model text; null when the call failed. */
  content: string | null;
  /** Provider error body for the warn log; never shown to a user. */
  errorBody: string | null;
}

export interface AiProvider {
  readonly id: ProviderId;
  complete(request: CompletionRequest): Promise<CompletionResult>;
  listModels(apiKey: string, signal?: AbortSignal): Promise<string[]>;
}
