# Track B: Bring Your Own API Key Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Groq on the server stays the default for every user. A user can optionally save their own provider API key, pick one of that provider's models, and have their reviews (and Design Studio) use it, with Groq as the automatic fallback.

**Architecture:** Extract the Groq HTTP call behind an `AiProvider` interface with no behaviour change (Task 2), add OpenAI-compatible and Anthropic providers with fixed base URLs (Task 4), store one encrypted key per user in a new `user_ai_settings` table (Task 3), and let `AiClientService` try the user's model first and fall back to the existing Groq chain (Task 5). Settings API (Task 6) and a Settings section (Task 7) expose it.

**Tech Stack:** NestJS 11, TypeORM (hand-applied DDL), Jest; Next.js 15 + Vitest.

## Global Constraints

- **Not a subscription.** API keys only, billed by the provider. UI copy must say so. No Claude/ChatGPT login, no local bridge.
- **Key lives on the server, encrypted with `CryptService`** (AES-256-CBC + MAC, `APP_KEY`). This deliberately differs from the concept's browser-local relay: webhook-triggered reviews run with nobody's browser open, so a browser-held key cannot work for them. Rotating `APP_KEY` makes saved keys unreadable, exactly like `users.github_token`; `resolve()` must treat an unreadable key as "no key" and fall back to Groq.
- **The key is never logged, never returned by any endpoint, never put in an audit log or error message.** The API exposes only a 4-character `key_hint`.
- **No SSRF surface in v1:** provider base URLs are constants in code, https only, `fetch(..., { redirect: 'error' })` so a key is never forwarded by a redirect. No user-supplied URL field.
- The Groq path is observable behaviour: model order, temperature 0.2, `response_format`, `max_completion_tokens: 8192`, `include_reasoning: false`, timeouts. Task 2 must change none of them. Golden fixtures stay frozen; no prompt changes anywhere in this plan.
- Any failure of the user's provider (401/403/429/5xx/timeout/unparseable) falls back to the Groq chain. The stored `ai_model_used` label names what actually answered (`<provider>/<model>`).
- The deadline cancels: pass the `AbortSignal` into every provider call. The derived job budget in `review.queue.ts` is never hard-coded (Task 5 updates its formula).
- `synchronize: false`. DDL goes into `prism-api/schema.sql` and is hand-applied. Status-like columns are `varchar`, not enums.
- Error bodies are contracts: 422 `{message, errors}`. Log with Nest `Logger`. Timestamps via existing helpers. `/api/v1` is untouched.
- Web: all API calls through `lib/api.ts` on the server; text >= 12px; colours from tokens; works at 390px; a Server Action's rejection or `ok: false` must show.
- Commits: one logical change, stage files by name, body says why, end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Gate per package before commit: `npm run typecheck && npm run lint && npm test` (narrow tests while editing, full suite once at the end).

## Out of scope (do not creep)

OpenRouter "Connect" button, "Sign in with ChatGPT", a "Tested" badge and per-model eval (parse rates on other models are unmeasured; record that in known-issues), custom base URLs, per-repository model choice, spend caps, Phase 0b batching (it will multiply calls per review; see Task 5 note).

## File Structure

| File | Responsibility |
|---|---|
| `prism-api/src/ai/providers/ai-provider.ts` (new) | `AiProvider`, `CompletionRequest/Result`, `ProviderId`, `AiCallContext` |
| `prism-api/src/ai/providers/http.ts` (new) | `sendJson()`: the one HTTP+`ai_call` log path, `AI_TIMEOUT_MS` |
| `prism-api/src/ai/providers/groq.provider.ts` (new) | Today's Groq call, moved verbatim; `GROQ_MODELS` |
| `prism-api/src/ai/providers/openai-compatible.provider.ts` (new) | OpenAI, Gemini (OpenAI endpoint), OpenRouter |
| `prism-api/src/ai/providers/anthropic.provider.ts` (new) | Anthropic Messages API |
| `prism-api/src/ai/providers/registry.ts` (new) | `providerFor(id)`, `SELECTABLE_PROVIDERS`, labels |
| `prism-api/src/database/entities/user-ai-settings.entity.ts` (new), `index.ts` | One row per user |
| `prism-api/src/ai/user-ai-settings.service.ts` (new) | save / resolve / describe / clear, encryption |
| `prism-api/src/ai/ai-client.service.ts` | Delegate to providers; own-model-first routing |
| `prism-api/src/modules/settings/ai-settings.controller.ts`, `dto/ai-settings.dto.ts` (new) | `/settings/ai` API |
| `prism-api/src/modules/review/review.queue.ts` (+ spec) | Budget formula |
| runners, `design.service.ts`, `fixes.service.ts` | pass `userId` |
| `prism-web/src/components/settings/AiModelSection.tsx` (new), `SettingsView.tsx`, `app/settings/actions.ts`, `page.tsx`, `lib/types.ts` | UI |
| `prism-api/schema.sql`, docs, ADR 0012, `CLAUDE.md` | same-commit docs |

---

### Task 1: ADR 0012, the decision comes before the code

**Files:**
- Create: `docs/adr/0012-optional-user-supplied-api-key.md`
- Modify: `docs/adr/0007-groq-is-the-only-ai-provider.md` (status line), `docs/adr/README.md`

- [ ] **Step 1: Write the ADR** with: Context (users want their own model; ADR 0007 said a second provider needs a superseding record and a re-measure), Decision (the Global Constraints above in prose: optional per-user API key, Groq remains the default and the fallback, server-side encryption and why not browser-local, fixed provider list, API key not subscription, fallback behaviour), Consequences (review quality on other models is **not measured**; `ai_model_used` shows what ran; job budget grows by one provider attempt; the user's code is sent to their chosen provider by their choice; a rotated `APP_KEY` silently drops saved keys back to Groq; Phase 0b multiplies calls and must respect lower provider rate limits), Alternatives (browser-held key relay: rejected, cannot serve webhooks and conflicts with CSP `connect-src 'self'`; subscription login: forbidden by Anthropic's terms, unclear for others; custom URL: SSRF surface).
- [ ] **Step 2:** In ADR 0007 change the status line to `Accepted, partly superseded by [0012](0012-optional-user-supplied-api-key.md): Groq remains the default provider; users may opt in to their own key.` Add the ADR to the index in `docs/adr/README.md`.
- [ ] **Step 3: Commit**

```bash
git add docs/adr/0012-optional-user-supplied-api-key.md docs/adr/0007-groq-is-the-only-ai-provider.md docs/adr/README.md
git commit -m "Record the decision to allow an optional user-supplied API key"
```

---

### Task 2: Provider interface, Groq moved behind it (no behaviour change)

**Files:**
- Create: `ai/providers/ai-provider.ts`, `ai/providers/http.ts`, `ai/providers/groq.provider.ts`, `ai/providers/groq.provider.spec.ts` (all under `prism-api/src/`)
- Modify: `prism-api/src/ai/ai-client.service.ts`

**Interfaces:**
- Produces:

```ts
// ai/providers/ai-provider.ts
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
```

- [ ] **Step 1: Prove the current behaviour is pinned.** Run (in `prism-api/`) `npm test -- src/ai src/modules/review/` and keep the green output. These existing specs are the no-behaviour-change proof; do not edit them in this task.

- [ ] **Step 2: Failing test** `groq.provider.spec.ts`

```ts
import { GroqProvider, GROQ_MODELS } from './groq.provider';

describe('GroqProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends the exact payload the pipeline has always sent', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: '{"a":1}' } }] }), { status: 200 }),
    );

    const result = await new GroqProvider().complete({
      model: GROQ_MODELS[0]!,
      system: 'SYS',
      user: 'USR',
      context: 'pr_review',
      apiKey: 'gsk_test',
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);

    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer gsk_test' });
    expect(body).toMatchObject({
      model: GROQ_MODELS[0],
      temperature: 0.2,
      response_format: { type: 'json_object' },
      max_completion_tokens: 8192,
      include_reasoning: false,
      messages: [
        { role: 'system', content: 'SYS' },
        { role: 'user', content: 'USR' },
      ],
    });
    expect(result).toMatchObject({ ok: true, status: 200, content: '{"a":1}' });
  });

  it('reports a transport failure as a non-ok result instead of throwing', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('socket hang up'));

    const result = await new GroqProvider().complete({
      model: 'm', system: 's', user: 'u', context: 'pr_review', apiKey: 'k',
    });

    expect(result).toMatchObject({ ok: false, status: 0, content: null });
  });
});
```

- [ ] **Step 3:** `npm test -- src/ai/providers/groq` → FAIL (module missing).

- [ ] **Step 4: Implement.** Create `ai-provider.ts` with the interfaces above. Create `http.ts` by moving `AiClientService.post()` into an exported function with this signature and the same body (same `ai_call` log shapes for success and failure, same `signal?.throwIfAborted()` in the catch), plus `redirect: 'error'` on the `fetch` call:

```ts
export const AI_TIMEOUT_MS = 60_000;

export interface HttpResult {
  ok: boolean;
  status: number;
  body: string | null;
  json: unknown;
}

export async function sendJson(args: {
  provider: ProviderId;
  context: AiCallContext;
  model: string;
  url: string;
  headers: Record<string, string>;
  payload: unknown;
  signal?: AbortSignal;
  logger: Logger;
  usage: (json: unknown) => { prompt: number | null; completion: number | null };
}): Promise<HttpResult>;
```

Create `groq.provider.ts`: move `GROQ_MODELS`, `GROQ_ENDPOINT`, `GROQ_MAX_COMPLETION_TOKENS` and the doc comments about them from `ai-client.service.ts` (keep every comment); `GroqProvider.complete()` builds the identical payload from the old `callGroqRaw`, calls `sendJson({provider: 'groq', ...})`, and returns `{ ok, status, content: ok ? (json.choices?.[0]?.message?.content ?? '') : null, errorBody: ok ? null : body }`. `listModels()` returns `[...GROQ_MODELS]`.

In `ai-client.service.ts`: `export { GROQ_MODELS } from './providers/groq.provider'; export type { AiCallContext } from './providers/ai-provider'; export const GROQ_TIMEOUT_MS = AI_TIMEOUT_MS;` (these exports are imported by `review.queue.ts` and its spec, so they must keep resolving from here). Replace `callGroqRaw` and `post` with a private method that calls `this.groq.complete(...)` where `this.groq = new GroqProvider()` is created in the constructor and the key still comes from `configService.get('ai.groqKey')`; on `!result.ok` keep the existing warn line (`Groq call failed: ${status} ${errorBody.slice(0,500)}`) and the existing return shapes (`raw: null`, `rateLimited: status === 429`); on ok return `{ parsed: extractJson(content), raw: content }`. `callWithFallback` and `call` bodies stay as they are.

- [ ] **Step 5: Verify nothing moved.** Run `npm test -- src/ai src/modules/review/` and `npm run typecheck`. Expected: same green as Step 1 plus the two new tests. If any pre-existing test needed editing, the refactor changed behaviour: revert and find out why.

- [ ] **Step 6: Commit**

```bash
git add prism-api/src/ai/providers prism-api/src/ai/ai-client.service.ts
git commit -m "Move the Groq call behind an AiProvider interface, unchanged"
```

---

### Task 3: Per-user encrypted key storage

**Files:**
- Create: `database/entities/user-ai-settings.entity.ts`, `ai/user-ai-settings.service.ts`, `ai/user-ai-settings.service.spec.ts`
- Modify: `database/entities/index.ts`, `ai/ai.module.ts`, `prism-api/schema.sql`, `docs/database.md`

**Interfaces:**
- Produces:

```ts
export interface OwnModel { provider: ProviderId; model: string; apiKey: string }
export interface OwnModelSummary { provider: ProviderId; model: string; key_hint: string; updated_at: string | null }

class UserAiSettingsService {
  resolve(userId: number): Promise<OwnModel | null>;          // null when none or unreadable
  describe(userId: number): Promise<OwnModelSummary | null>;  // never includes the key
  save(userId: number, input: { provider: ProviderId; model: string; apiKey?: string }): Promise<void>;
  clear(userId: number): Promise<void>;
}
```

- [ ] **Step 1: DDL** appended to `schema.sql` next to the other tables, and applied by hand to local Postgres (never the production `.env`):

```sql
CREATE TABLE public.user_ai_settings (
    user_id bigint NOT NULL,
    provider character varying(32) NOT NULL,
    model character varying(191) NOT NULL,
    api_key text NOT NULL,
    key_hint character varying(8) NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);

ALTER TABLE ONLY public.user_ai_settings
    ADD CONSTRAINT user_ai_settings_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.user_ai_settings
    ADD CONSTRAINT user_ai_settings_user_id_foreign
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
```

The cascade matters: the account-deletion path is `users.delete(user.id)` in `profile.service.ts`, so the key disappears with the account. Document the table in `docs/database.md` (including "apply by hand in production before deploying the code").

- [ ] **Step 2: Entity** (match the style of `user.entity.ts`):

```ts
import { Column, Entity, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../transformers';

@Entity({ name: 'user_ai_settings' })
export class UserAiSettings {
  @PrimaryColumn({ type: 'bigint', transformer: bigintTransformer })
  userId!: number;

  @Column({ type: 'varchar' })
  provider!: string;

  @Column({ type: 'varchar' })
  model!: string;

  /** Ciphertext. Only UserAiSettingsService reads or writes it. */
  @Column({ type: 'text' })
  apiKey!: string;

  @Column({ type: 'varchar' })
  keyHint!: string;

  @Column({ type: 'timestamp', nullable: true })
  createdAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  updatedAt!: Date | null;
}
```

Export it from `entities/index.ts` and register it wherever `User` is registered in `TypeOrmModule.forFeature`/the data source entity list (grep `User,` in `*.module.ts` and the data-source config).

- [ ] **Step 3: Failing tests** `user-ai-settings.service.spec.ts` with a fake repository (an in-memory `Map`) and the real `CryptService` built from a 32-byte base64 `APP_KEY`:

```ts
it('stores the key encrypted and describes it by its last four characters only', async () => {
  await service.save(7, { provider: 'openai', model: 'gpt-4.1', apiKey: 'sk-abcdef123456' });

  expect(rows.get(7)!.apiKey).not.toContain('sk-abcdef123456');
  expect(await service.describe(7)).toMatchObject({ provider: 'openai', model: 'gpt-4.1', key_hint: '3456' });
  expect(JSON.stringify(await service.describe(7))).not.toContain('sk-abcdef');
});

it('resolves the plaintext key for the pipeline', async () => {
  await service.save(7, { provider: 'anthropic', model: 'm', apiKey: 'sk-ant-xyz9876' });

  expect(await service.resolve(7)).toEqual({ provider: 'anthropic', model: 'm', apiKey: 'sk-ant-xyz9876' });
});

it('keeps the existing key when the same provider is saved without one', async () => {
  await service.save(7, { provider: 'openai', model: 'a', apiKey: 'sk-aaaa1111' });
  await service.save(7, { provider: 'openai', model: 'b' });

  expect(await service.resolve(7)).toMatchObject({ model: 'b', apiKey: 'sk-aaaa1111' });
});

it('refuses a provider change without a new key', async () => {
  await service.save(7, { provider: 'openai', model: 'a', apiKey: 'sk-aaaa1111' });

  await expect(service.save(7, { provider: 'google', model: 'g' })).rejects.toThrow('API key');
});

it('treats an unreadable key (rotated APP_KEY) as no key instead of throwing', async () => {
  await service.save(7, { provider: 'openai', model: 'a', apiKey: 'sk-aaaa1111' });
  rows.get(7)!.apiKey = 'not-decryptable';

  expect(await service.resolve(7)).toBeNull();
});

it('clear removes the row', async () => {
  await service.save(7, { provider: 'openai', model: 'a', apiKey: 'sk-aaaa1111' });
  await service.clear(7);

  expect(await service.resolve(7)).toBeNull();
});
```

- [ ] **Step 4:** `npm test -- src/ai/user-ai-settings` → FAIL.

- [ ] **Step 5: Implement** `UserAiSettingsService` (`@Injectable()`, injects `@InjectRepository(UserAiSettings)` and `CryptService`). `save()` encrypts with `crypt.encrypt(apiKey)` and sets `keyHint = apiKey.slice(-4)`; without `apiKey` it requires an existing row with the same provider, else throws `new Error('An API key is required.')`. `resolve()` returns null if there is no row, if `crypt.decrypt(row.apiKey)` returns falsy or throws (catch, `Logger.warn('saved AI key unreadable for user <id>')`, never log the value), or if `row.provider` is not a known `ProviderId`. `describe()` formats `updated_at` with the existing `common/utils/iso8601.ts` helper. Add the provider and make sure the module that provides `CryptService` is imported by `AiModule` (grep `CryptService` in `*.module.ts`); export the service from `AiModule`.

- [ ] **Step 6:** `npm test -- src/ai` and `npm run typecheck` → PASS.

- [ ] **Step 7: Commit**

```bash
git add prism-api/schema.sql docs/database.md prism-api/src/database/entities/user-ai-settings.entity.ts prism-api/src/database/entities/index.ts prism-api/src/ai/user-ai-settings.service.ts prism-api/src/ai/user-ai-settings.service.spec.ts prism-api/src/ai/ai.module.ts
git commit -m "Store one encrypted AI provider key per user"
```

(Add whichever module/data-source file you touched in Step 2 to `git add`.)

---

### Task 4: OpenAI-compatible and Anthropic providers

**Files:**
- Create: `ai/providers/openai-compatible.provider.ts`, `anthropic.provider.ts`, `registry.ts` and one spec each (under `prism-api/src/`)

**Interfaces:**
- Consumes: `AiProvider`, `sendJson`, `AI_TIMEOUT_MS`
- Produces: `providerFor(id: ProviderId): AiProvider`; `SELECTABLE_PROVIDERS: readonly { id: Exclude<ProviderId, 'groq'>; label: string }[]`

- [ ] **Step 1: Failing tests**

`openai-compatible.provider.spec.ts`:

```ts
import { OpenAiCompatibleProvider, OPENAI, GOOGLE, OPENROUTER } from './openai-compatible.provider';

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const req = { model: 'm', system: 'S', user: 'U', context: 'pr_review' as const, apiKey: 'k-123456' };

afterEach(() => jest.restoreAllMocks());

it('calls the fixed OpenAI URL with a bearer key, and no temperature (newer models reject it)', async () => {
  const f = jest.spyOn(global, 'fetch').mockResolvedValue(ok({ choices: [{ message: { content: '{}' } }] }));

  await new OpenAiCompatibleProvider(OPENAI).complete(req);

  const [url, init] = f.mock.calls[0]!;
  const body = JSON.parse((init as RequestInit).body as string);
  expect(url).toBe('https://api.openai.com/v1/chat/completions');
  expect((init as RequestInit).redirect).toBe('error');
  expect(body.temperature).toBeUndefined();
  expect(body.max_completion_tokens).toBe(8192);
  expect(body.response_format).toEqual({ type: 'json_object' });
});

it('uses max_tokens and temperature 0.2 for OpenRouter, without JSON mode', async () => {
  const f = jest.spyOn(global, 'fetch').mockResolvedValue(ok({ choices: [{ message: { content: '{}' } }] }));

  await new OpenAiCompatibleProvider(OPENROUTER).complete(req);

  const body = JSON.parse((f.mock.calls[0]![1] as RequestInit).body as string);
  expect(f.mock.calls[0]![0]).toBe('https://openrouter.ai/api/v1/chat/completions');
  expect(body.max_tokens).toBe(8192);
  expect(body.temperature).toBe(0.2);
  expect(body.response_format).toBeUndefined();
});

it('lists OpenAI chat models only, sorted', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(
    ok({ data: [{ id: 'text-embedding-3-small' }, { id: 'gpt-4.1' }, { id: 'whisper-1' }, { id: 'o3-mini' }, { id: 'gpt-4o-audio-preview' }] }),
  );

  expect(await new OpenAiCompatibleProvider(OPENAI).listModels('k')).toEqual(['gpt-4.1', 'o3-mini']);
});

it('strips the models/ prefix Gemini adds and keeps gemini ids', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(ok({ data: [{ id: 'models/gemini-2.5-flash' }, { id: 'models/embedding-001' }] }));

  expect(await new OpenAiCompatibleProvider(GOOGLE).listModels('k')).toEqual(['gemini-2.5-flash']);
});

it('rejects with a clear error when the provider refuses the key', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{"error":"bad key"}', { status: 401 }));

  await expect(new OpenAiCompatibleProvider(OPENAI).listModels('k')).rejects.toMatchObject({ status: 401 });
});
```

`anthropic.provider.spec.ts`:

```ts
it('posts to the Messages API with x-api-key and a version header', async () => {
  const f = jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ content: [{ type: 'text', text: '{"a":1}' }] }), { status: 200 }),
  );

  const result = await new AnthropicProvider().complete({
    model: 'claude-x', system: 'S', user: 'U', context: 'pr_review', apiKey: 'sk-ant-1234',
  });

  const [url, init] = f.mock.calls[0]!;
  const body = JSON.parse((init as RequestInit).body as string);
  expect(url).toBe('https://api.anthropic.com/v1/messages');
  expect((init as RequestInit).headers).toMatchObject({ 'x-api-key': 'sk-ant-1234', 'anthropic-version': '2023-06-01' });
  expect(body).toMatchObject({ model: 'claude-x', system: 'S', max_tokens: 8192, messages: [{ role: 'user', content: 'U' }] });
  expect(result.content).toBe('{"a":1}');
});
```

`registry.spec.ts`: `providerFor('openai').id === 'openai'`; `SELECTABLE_PROVIDERS.map(p => p.id)` equals `['openai','google','openrouter','anthropic']`; `providerFor` throws on an unknown id.

- [ ] **Step 2:** `npm test -- src/ai/providers` → FAIL.

- [ ] **Step 3: Implement.**

`openai-compatible.provider.ts`:

```ts
export interface CompatConfig {
  id: Exclude<ProviderId, 'groq' | 'anthropic'>;
  baseUrl: string; // https only, a constant, never user input
  jsonMode: boolean;
  sendTemperature: boolean;
  maxTokensField: 'max_tokens' | 'max_completion_tokens';
  keepModel: (id: string) => boolean;
  normaliseModel: (id: string) => string;
}

export const OPENAI: CompatConfig = {
  id: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  jsonMode: true,
  sendTemperature: false,
  maxTokensField: 'max_completion_tokens',
  keepModel: (id) =>
    /^(gpt-|o\d|chatgpt-)/.test(id) && !/(audio|realtime|transcribe|tts|image|embedding|moderation|search)/.test(id),
  normaliseModel: (id) => id,
};

export const GOOGLE: CompatConfig = {
  id: 'google',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  jsonMode: true,
  sendTemperature: true,
  maxTokensField: 'max_tokens',
  keepModel: (id) => /^gemini/.test(id),
  normaliseModel: (id) => id.replace(/^models\//, ''),
};

export const OPENROUTER: CompatConfig = {
  id: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  jsonMode: false,
  sendTemperature: true,
  maxTokensField: 'max_tokens',
  keepModel: () => true,
  normaliseModel: (id) => id,
};
```

`complete()` posts `{ model, messages:[system,user], [maxTokensField]: 8192, ...(sendTemperature && {temperature: 0.2}), ...(jsonMode && {response_format:{type:'json_object'}}) }` to `${baseUrl}/chat/completions` through `sendJson` with `Authorization: Bearer <key>`, and returns `{ok, status, content: ok ? choices[0].message.content ?? '' : null, errorBody}`. `listModels()` GETs `${baseUrl}/models` with the same timeout, `redirect: 'error'`, and bearer key; on a non-2xx it `throw Object.assign(new Error('provider rejected the request'), { status })` (the message must not contain the key or the response body); otherwise returns `data.map(m => normaliseModel(m.id)).filter(keepModel)` de-duplicated and sorted ascending.

`anthropic.provider.ts`: `complete()` posts `{ model, max_tokens: 8192, temperature: 0.2, system, messages: [{ role: 'user', content: user }] }` to `https://api.anthropic.com/v1/messages` with headers `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`; content is the concatenation of `content[].text` for blocks with `type === 'text'`; usage is `usage.input_tokens` / `usage.output_tokens`. `listModels()` GETs `https://api.anthropic.com/v1/models?limit=100` with the same two headers, returns `data[].id` sorted, same error rule. (Anthropic has no JSON mode here; `extractJson` in the caller already strips fences and prose.)

`registry.ts`: a `Record<ProviderId, AiProvider>` built once, `providerFor(id)` throwing `Error('Unknown AI provider: ' + id)`, and

```ts
export const SELECTABLE_PROVIDERS = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'google', label: 'Google Gemini' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'anthropic', label: 'Anthropic Claude' },
] as const;
```

- [ ] **Step 4:** `npm test -- src/ai/providers` and `npm run typecheck` → PASS.

- [ ] **Step 5: Owner check against the real services (not automated, do before Task 7).** With one throwaway key per provider you already hold, run a one-off script (kept in the scratchpad, not committed) that calls `listModels` and one `complete` with the system prompt `Reply with JSON {"ok":true}` and prints the status and content length only. Confirm the four base URLs, the Gemini OpenAI endpoint and the Anthropic header version still work today. If one has changed, fix its constants and test in this task before moving on.

- [ ] **Step 6: Commit**

```bash
git add prism-api/src/ai/providers
git commit -m "Add OpenAI, Gemini, OpenRouter and Anthropic providers with fixed URLs"
```

---

### Task 5: Route a user's own model first, Groq as the fallback

**Files:**
- Modify: `ai/ai-client.service.ts`, `ai/ai-client.service.spec.ts`, `ai/fixes.service.ts`, `modules/review/pr-review.runner.ts`, `commit-review.runner.ts`, `modules/design/design.service.ts`, `modules/review/review.queue.ts`, `modules/review/review.queue.spec.ts`

**Interfaces:**
- Consumes: `UserAiSettingsService.resolve`, `providerFor`
- Produces: `callWithFallback(system, user, context, signal?, options?: { userId?: number })` and `call(model, system, user, context, signal?, options?: { userId?: number })`. Without `options` both behave exactly as today.

- [ ] **Step 1: Failing tests.** The snippet uses `client`, `userAi`, `fetchMock` and `mockFetchOnce(body, status = 200)`; define them in the new `describe` if the spec's existing setup names them differently: `fetchMock = jest.spyOn(global, 'fetch')`, `mockFetchOnce = (body, status = 200) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }))`, `userAi = { resolve: jest.fn() }`, `client = new AiClientService(config, userAi as never)` with the same `config` the existing tests use. (Append to `ai-client.service.spec.ts`; construct the service with a fake `UserAiSettingsService { resolve: jest.fn() }` as the new second constructor argument and update the existing construction calls to pass `{ resolve: async () => null }`, which is the only edit allowed to existing tests):

```ts
describe('own model', () => {
  const own = { provider: 'openai' as const, model: 'gpt-4.1', apiKey: 'sk-test-1234' };

  it('uses the user model first and labels the result with it', async () => {
    userAi.resolve.mockResolvedValue(own);
    mockFetchOnce({ choices: [{ message: { content: '{"overall_score": 90, "summary": "ok"}' } }] }); // OpenAI

    const result = await client.callWithFallback('S', 'U', 'pr_review', undefined, { userId: 7 });

    expect(result.model).toBe('openai/gpt-4.1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('api.openai.com');
  });

  it('falls back to Groq when the user key is rejected', async () => {
    userAi.resolve.mockResolvedValue(own);
    mockFetchOnce({ error: 'bad key' }, 401);                                         // OpenAI refuses
    mockFetchOnce({ choices: [{ message: { content: '{"overall_score": 80}' } }] }); // Groq answers

    const result = await client.callWithFallback('S', 'U', 'pr_review', undefined, { userId: 7 });

    expect(result.model).toBe(`groq/${GROQ_MODELS[0]}`);
  });

  it('falls back to Groq when the user model returns text that is not JSON', async () => {
    userAi.resolve.mockResolvedValue(own);
    mockFetchOnce({ choices: [{ message: { content: 'I am sorry, I cannot do that.' } }] });
    mockFetchOnce({ choices: [{ message: { content: '{"overall_score": 80}' } }] });

    const result = await client.callWithFallback('S', 'U', 'pr_review', undefined, { userId: 7 });

    expect(result.model).toBe(`groq/${GROQ_MODELS[0]}`);
  });

  it('never consults user settings when no userId is given', async () => {
    mockFetchOnce({ choices: [{ message: { content: '{"overall_score": 80}' } }] });

    await client.callWithFallback('S', 'U', 'pr_review');

    expect(userAi.resolve).not.toHaveBeenCalled();
  });

  it('routes the fixes pass by the model label, and only for the saved provider', async () => {
    userAi.resolve.mockResolvedValue(own);
    mockFetchOnce({ choices: [{ message: { content: '{"fixes": []}' } }] });

    await client.call('openai/gpt-4.1', 'S', 'U', 'pr_review', undefined, { userId: 7 });

    expect(String(fetchMock.mock.calls[0]![0])).toContain('api.openai.com');
  });

  it('does not send a different provider label to the saved key', async () => {
    userAi.resolve.mockResolvedValue(own);

    expect(await client.call('anthropic/claude-x', 'S', 'U', 'pr_review', undefined, { userId: 7 })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

`review.queue.spec.ts`: change the expected worst case to `GROQ_TIMEOUT_MS * (GROQ_MODELS.length + 2)`.

- [ ] **Step 2:** `npm test -- src/ai/ai-client src/modules/review/review.queue` → FAIL.

- [ ] **Step 3: Implement** in `AiClientService`: add `private readonly userAi: UserAiSettingsService` to the constructor (DI-provided by `AiModule`). Add at the top of `callWithFallback`, after `strongSystem` is built:

```ts
    const own = options.userId ? await this.userAi.resolve(options.userId) : null;

    if (own) {
      signal?.throwIfAborted();

      const provider = providerFor(own.provider);
      const response = await provider.complete({
        model: own.model,
        system: strongSystem,
        user,
        context,
        apiKey: own.apiKey,
        signal,
      });
      const parsed = response.ok ? extractJson(response.content ?? '') : null;

      if (parsed) {
        return { model: `${own.provider}/${own.model}`, parsed, raw: response.content };
      }

      // Never the key, never the provider's body: the status is enough to debug.
      this.logger.warn(
        `Own model ${own.provider}/${own.model} gave no usable answer (status ${response.status}); falling back to Groq`,
      );
    }
```

The existing Groq loop follows unchanged. In `call()`: if `model` starts with `groq/` or contains no `/`, behave as today; otherwise split at the first `/` into `providerId` and `rest`, require `options.userId`, `resolve()` it, require `own.provider === providerId && own.model === rest`, else return `null` without any HTTP call; on a match call `providerFor(...).complete(...)` and return `extractJson(content)`.

Update `fixes.service.ts` (read lines 60-100): add an optional trailing `userId?: number` to `generate()` and pass `{ userId }` as the new last argument of its `this.aiClient.call(...)`. In both runners pass `repository.userId` to `callWithFallback(..., signal, { userId: repository.userId })` and to `this.fixes.generate(..., userId)`. In `design.service.ts` (~line 153) pass `{ userId: user.id }` using whatever the surrounding variable for the user is called. In `review.queue.ts` change the formula to `GROQ_TIMEOUT_MS * (GROQ_MODELS.length + 2)` and extend its comment with one sentence: "+2 = the fixes pass and one attempt on the user's own model before the Groq chain."

- [ ] **Step 4:** `npm test -- src/ai src/modules/review/ src/modules/design` , `npm run typecheck`, `npm run lint` → PASS. Golden fixtures untouched (`git status` shows nothing under `test/fixtures/`).

- [ ] **Step 5: Commit**

```bash
git add prism-api/src/ai/ai-client.service.ts prism-api/src/ai/ai-client.service.spec.ts prism-api/src/ai/fixes.service.ts prism-api/src/modules/review/pr-review.runner.ts prism-api/src/modules/review/commit-review.runner.ts prism-api/src/modules/design/design.service.ts prism-api/src/modules/review/review.queue.ts prism-api/src/modules/review/review.queue.spec.ts
git commit -m "Try the user's own model first and fall back to the Groq chain"
```

Note for the future Phase 0b plan: batching multiplies provider calls per review; the budget formula and the lower rate limits of personal keys must be revisited there.

---

### Task 6: Settings API for the key and model

**Files:**
- Create: `modules/settings/ai-settings.controller.ts`, `modules/settings/ai-settings.service.ts`, `modules/settings/dto/ai-settings.dto.ts`, `modules/settings/ai-settings.service.spec.ts`
- Modify: `modules/settings/settings.module.ts`, `docs/api-reference.md`

**Interfaces:**
- Consumes: `UserAiSettingsService`, `providerFor`, `SELECTABLE_PROVIDERS`, `AuditLogService.record(userId, action, description, metadata)`, `GROQ_MODELS`
- Produces (all under `@UseGuards(WebAuthGuard)`, path `settings/ai`):
  - `GET /settings/ai` → `{ default: { provider: 'groq', models: string[] }, own: OwnModelSummary | null, providers: { id, label }[] }`
  - `POST /settings/ai/models` body `{ provider, api_key? }` → `{ models: string[] }`
  - `PUT /settings/ai` body `{ provider, model, api_key? }` → `{ message, own: OwnModelSummary }`
  - `DELETE /settings/ai` → `{ message }`

- [ ] **Step 1: DTO**

```ts
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const PROVIDERS = ['openai', 'google', 'openrouter', 'anthropic'];

export class ListAiModelsDto {
  @IsIn(PROVIDERS) provider!: string;
  @IsOptional() @IsString() @MaxLength(512) api_key?: string;
}

export class SaveAiSettingsDto extends ListAiModelsDto {
  @IsString() @IsNotEmpty() @MaxLength(191) model!: string;
}
```

- [ ] **Step 2: Failing tests** `ai-settings.service.spec.ts` (fake `UserAiSettingsService`, fake `providerFor` via `jest.mock('../../ai/providers/registry')`, fake `AuditLogService`):

```ts
it('lists models using the typed key', async () => {
  provider.listModels.mockResolvedValue(['gpt-4.1']);

  expect(await service.models(user, { provider: 'openai', api_key: 'sk-new' })).toEqual({ models: ['gpt-4.1'] });
  expect(provider.listModels).toHaveBeenCalledWith('sk-new', expect.anything());
});

it('lists models with the saved key when none is typed and the provider matches', async () => {
  userAi.resolve.mockResolvedValue({ provider: 'openai', model: 'a', apiKey: 'sk-saved' });
  provider.listModels.mockResolvedValue(['gpt-4.1']);

  await service.models(user, { provider: 'openai' });

  expect(provider.listModels).toHaveBeenCalledWith('sk-saved', expect.anything());
});

it('answers a rejected key with a 422 {message, errors}, never echoing the key', async () => {
  provider.listModels.mockRejectedValue(Object.assign(new Error('x'), { status: 401 }));

  const error = await service.models(user, { provider: 'openai', api_key: 'sk-secret-9999' }).catch((e) => e);

  expect(error.getStatus()).toBe(422);
  expect(error.getResponse()).toMatchObject({ errors: { api_key: [expect.stringContaining('rejected')] } });
  expect(JSON.stringify(error.getResponse())).not.toContain('sk-secret-9999');
});

it('refuses to save a model the provider does not list', async () => {
  provider.listModels.mockResolvedValue(['gpt-4.1']);

  await expect(
    service.save(user, { provider: 'openai', model: 'made-up', api_key: 'sk-x' }),
  ).rejects.toMatchObject({ response: { errors: { model: expect.any(Array) } } });
  expect(userAi.save).not.toHaveBeenCalled();
});

it('saves, then audits without the key', async () => {
  provider.listModels.mockResolvedValue(['gpt-4.1']);
  userAi.describe.mockResolvedValue({ provider: 'openai', model: 'gpt-4.1', key_hint: '9999', updated_at: null });

  await service.save(user, { provider: 'openai', model: 'gpt-4.1', api_key: 'sk-secret-9999' });

  expect(userAi.save).toHaveBeenCalledWith(user.id, { provider: 'openai', model: 'gpt-4.1', apiKey: 'sk-secret-9999' });
  expect(JSON.stringify(audit.record.mock.calls)).not.toContain('sk-secret-9999');
});

it('index never returns a key', async () => {
  userAi.describe.mockResolvedValue({ provider: 'openai', model: 'm', key_hint: '9999', updated_at: null });

  expect(JSON.stringify(await service.index(user))).not.toMatch(/sk-/);
});
```

- [ ] **Step 3:** `npm test -- src/modules/settings/ai-settings` → FAIL.

- [ ] **Step 4: Implement** `AiSettingsService` (`index`, `models`, `save`, `clear`) and the controller. `models()`/`save()` obtain the key from `dto.api_key` or, when absent, from `userAi.resolve(user.id)` only if its provider equals `dto.provider`; if neither exists throw 422 `errors.api_key = ['Enter your API key.']`. Calls to the provider pass `AbortSignal.timeout(AI_TIMEOUT_MS)`. A thrown `{status: 401|403}` becomes 422 `errors.api_key = ['<Label> rejected this API key.']`; any other failure becomes 422 `errors.api_key = ['Could not reach <Label>. Try again in a minute.']`. Build the 422 with `new UnprocessableEntityException({ message: <first error>, errors })`, the same body shape `common/validation/validation-errors.ts` produces. `save()` validates `dto.model` against the freshly listed models before calling `userAi.save`, then `auditLog.record(user.id, 'ai_settings_saved', 'Saved a personal AI model', { provider, model })` (no key). `clear()` calls `userAi.clear` and records `ai_settings_cleared`. `index()` returns `{ default: { provider: 'groq', models: [...GROQ_MODELS] }, own: await userAi.describe(user.id), providers: SELECTABLE_PROVIDERS }`. Register the controller and service in `settings.module.ts` (import `AiModule` for `UserAiSettingsService`). Document the four routes in `docs/api-reference.md`, and note the global `RateLimitGuard` already keys signed-in traffic per user, which is what throttles `/models`.

- [ ] **Step 5:** `npm test -- src/modules/settings` , `npm run typecheck`, `npm run lint` → PASS.

- [ ] **Step 6: Commit**

```bash
git add prism-api/src/modules/settings prism-api/src/ai docs/api-reference.md
git commit -m "Add the settings API for a personal AI provider key and model"
```

---

### Task 7: Settings screen

**Files:**
- Create: `prism-web/src/components/settings/AiModelSection.tsx`, `AiModelSection.test.tsx`
- Modify: `prism-web/src/components/settings/SettingsView.tsx`, `prism-web/src/app/settings/actions.ts`, `prism-web/src/app/settings/page.tsx`, `prism-web/src/lib/types.ts`

**Interfaces:**
- Produces (types): `AiSettings { default: { provider: 'groq'; models: string[] }; own: { provider: string; model: string; key_hint: string; updated_at: string | null } | null; providers: { id: string; label: string }[] }`
- Produces (actions, all return `ActionResult` as in `actions.ts`): `listAiModels(provider, apiKey?) -> ActionResult & { models?: string[] }`, `saveAiSettings({ provider, model, apiKey? })`, `clearAiSettings()`

- [ ] **Step 1: Failing tests** `AiModelSection.test.tsx` (Vitest + Testing Library; mock the three actions with `vi.mock('@/app/settings/actions')`):

```tsx
const base: AiSettings = {
  default: { provider: 'groq', models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'] },
  own: null,
  providers: [{ id: 'openai', label: 'OpenAI' }, { id: 'anthropic', label: 'Anthropic Claude' }],
};

it('says the default model is used when nothing is saved', () => {
  render(<AiModelSection settings={base} />);

  expect(screen.getByText(/PRism's default model/i)).toBeInTheDocument();
});

it('states plainly that this is an API key and not a subscription', () => {
  render(<AiModelSection settings={base} />);

  expect(screen.getByText(/not a ChatGPT or Claude subscription/i)).toBeInTheDocument();
});

it('loads the provider models after a key is entered, and only then enables Save', async () => {
  listAiModels.mockResolvedValue({ ok: true, message: '', models: ['gpt-4.1'] });
  render(<AiModelSection settings={base} />);

  await userEvent.selectOptions(screen.getByLabelText('Provider'), 'openai');
  await userEvent.type(screen.getByLabelText('API key'), 'sk-test-1234');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

  await userEvent.click(screen.getByRole('button', { name: 'Load models' }));
  await userEvent.selectOptions(await screen.findByLabelText('Model'), 'gpt-4.1');

  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
});

it('shows the provider error when the key is rejected', async () => {
  listAiModels.mockResolvedValue({ ok: false, message: 'OpenAI rejected this API key.', errors: { api_key: ['OpenAI rejected this API key.'] } });
  render(<AiModelSection settings={base} />);

  await userEvent.selectOptions(screen.getByLabelText('Provider'), 'openai');
  await userEvent.type(screen.getByLabelText('API key'), 'bad');
  await userEvent.click(screen.getByRole('button', { name: 'Load models' }));

  expect(await screen.findByText('OpenAI rejected this API key.')).toBeInTheDocument();
});

it('shows a saved model with only the key hint, and offers to switch back', () => {
  render(<AiModelSection settings={{ ...base, own: { provider: 'openai', model: 'gpt-4.1', key_hint: '9999', updated_at: null } }} />);

  expect(screen.getByText(/gpt-4\.1/)).toBeInTheDocument();
  expect(screen.getByText(/ending 9999/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Use PRism's default/i })).toBeInTheDocument();
});
```

- [ ] **Step 2:** In `prism-web/` run `npm test -- AiModelSection` → FAIL.

- [ ] **Step 3: Implement.** Types in `lib/types.ts`. Actions in `actions.ts` using `apiSend`/`apiGet` exactly as the existing actions do (`POST /settings/ai/models`, `PUT /settings/ai`, `DELETE /settings/ai`, `revalidatePath('/settings')`, errors through the existing `toResult`). `page.tsx` loads `/settings/ai` with the same server-side helper it uses for `/settings` and passes it to `SettingsView`, which renders `<AiModelSection settings={...} />` as a new card under the Slack section. The component is a client component: provider `<select>` (label "Provider"), password-type `<input>` (label "API key", `autoComplete="off"`), "Load models" button (disabled while empty or loading), model `<select>` (label "Model") filled from the response, "Save" disabled until a model is chosen, and, when `settings.own` exists, a summary line `Using <provider label> · <model> · key ending <key_hint>` with a "Use PRism's default (Groq)" button that calls `clearAiSettings`. Always-visible copy, in this wording:

  - "By default PRism reviews your code with its own Groq models. You can use your own AI provider instead."
  - "This takes an API key, not a ChatGPT or Claude subscription. API usage is billed separately by the provider."
  - "If you save a key, the code of your reviews is sent to that provider. If it fails, PRism falls back to its default model."

  The key input is cleared after a successful save and is never rendered back. Every action result with `ok: false` shows its `message` in a `role="alert"` element. Use `grid-cols-1` on small screens, token colours only, controls >= 44px high.

- [ ] **Step 4:** `npm test -- AiModelSection`, `npm run typecheck`, `npm run lint` → PASS.

- [ ] **Step 5: Commit**

```bash
git add prism-web/src/components/settings prism-web/src/app/settings prism-web/src/lib/types.ts
git commit -m "Let users connect their own AI provider key from Settings"
```

---

### Task 8: Docs, full gate, one end-to-end check

**Files:**
- Modify: `docs/review-pipeline.md`, `docs/security.md`, `docs/configuration.md` (note: no new env var), `docs/known-issues.md`, `docs/frontend.md` (if the settings page is described there), `docs/code-map.md`, `CLAUDE.md`

- [ ] **Step 1: Docs in the same change.** `review-pipeline.md`: own model first, Groq fallback, `ai_model_used` label format, budget `+2`. `security.md`: key storage and handling rules (encrypted, hint only, never logged, `redirect: 'error'`, fixed URLs, `APP_KEY` rotation drops saved keys to Groq). `known-issues.md`: add "Review quality and JSON parse rates on user-supplied models are not measured" and "a revoked or exhausted personal key silently falls back to Groq; the user only sees the model label on the review". `code-map.md`: rows for `ai/providers/`, `user-ai-settings.service.ts`, `modules/settings/ai-settings.*`, `AiModelSection.tsx` (and the new table under `database/`). `CLAUDE.md`: change the "Groq only..." bullet to "Groq is the default and the fallback; a user may add their own provider API key ([ADR 0012](docs/adr/0012-optional-user-supplied-api-key.md))", keep the rule that the Groq order and temperature are measured.

- [ ] **Step 2: Full gate, once.** In `prism-api/` and `prism-web/`: `npm run typecheck && npm run lint && npm test`. Expected: green.

- [ ] **Step 3: One end-to-end check (this task touches modules and DI wiring, so the stack is booted once, per `docs/development.md`, with `127.0.0.1` connection strings).** Apply the Task 3 DDL to local Postgres, start Redis and the API on 3999, then in the browser: save a real personal key and model on `/settings`, trigger a review on a test repository, confirm the review's model label is `<provider>/<model>`; then enter a wrong key via the API and confirm the next review is labelled `groq/...`; delete the saved setting and confirm the Settings page shows the default state. Check `docker`/API logs contain no key material (`grep` the log for the key's first 6 characters). Stop the server.

- [ ] **Step 4: Commit**

```bash
git add docs/review-pipeline.md docs/security.md docs/configuration.md docs/known-issues.md docs/code-map.md CLAUDE.md
git commit -m "Document the optional personal AI key and its limits"
```

## Self-review notes (already applied)

- Spec coverage: default Groq for all (kept, Task 2/5), optional own key (3, 6, 7), model list from the provider's API and selection (4, 6, 7), API key not subscription (copy in Task 7, ADR), fallback (5), no key leakage (3, 4, 6, 8 grep), ADR 0007 supersession (1), budget (5).
- Type names used across tasks: `ProviderId`, `OwnModel`, `OwnModelSummary`, `AiProvider.complete/listModels`, `providerFor`, `SELECTABLE_PROVIDERS`, `UserAiSettingsService.resolve/describe/save/clear`, `options.userId`: consistent.
- Known unknowns kept visible, not hidden: Task 4 Step 5 re-verifies the four provider endpoints against the real services; quality on non-Groq models is unmeasured (ADR + known-issues).
