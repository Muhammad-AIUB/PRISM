# 0012. Optional user-supplied API key

Status: Accepted
Date: 2026-11-07

## Context

Users want to review with their own model. [ADR 0007](0007-groq-is-the-only-ai-provider.md) said a second
provider needs a superseding record and a re-measure of the whole chain.

## Decision

- Groq stays the **default and the fallback** for every user and for every review. Its model order,
  temperature and parameters are unchanged and still measured behaviour.
- A user may **optionally** save one API key for a fixed list of providers (OpenAI, Google Gemini via its
  OpenAI-compatible endpoint, OpenRouter, Anthropic) and pick one of that provider's models. Reviews, the
  fixes pass and Design Studio then try that model first.
- **API key only.** Not a ChatGPT or Claude subscription, no login with a consumer account, no local bridge.
  Usage is billed by the provider to the user.
- **The key is stored on the server**, encrypted with `CryptService` (AES-256-CBC + MAC, `APP_KEY`), in
  `user_ai_settings`. Reviews are triggered by webhooks with nobody's browser open, so a browser-held key
  cannot serve them. The API exposes only a 4-character hint. The key is never logged, audited or put in
  an error message.
- **Provider base URLs are constants** (https), and requests use `redirect: 'error'`: there is no
  user-supplied URL, so no SSRF surface, and a redirect can never forward the key.
- Any failure of the user's provider (401/403/429/5xx, timeout, unparseable answer) falls back to the Groq
  chain. `ai_model_used` records what actually answered, as `<provider>/<model>`.

## Consequences

- Review quality and JSON parse rates on user-chosen models are **not measured**.
- The job budget grows by one provider attempt (`review.queue.ts`).
- The user's code is sent to their chosen provider, by their choice. The settings screen says so.
- Rotating `APP_KEY` silently makes saved keys unreadable; they are treated as absent and reviews run on
  Groq.
- A revoked or exhausted personal key falls back silently; the user sees only the model label on the review.
- Phase 0b batching multiplies calls per review and must respect the lower rate limits of personal keys.

## Alternatives considered

- **Browser-held key relay.** Rejected: cannot serve webhook-triggered reviews and conflicts with CSP
  `connect-src 'self'`.
- **Subscription login.** Forbidden by Anthropic's terms, unclear for others.
- **Custom base URL.** Rejected: SSRF surface.
