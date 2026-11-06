# Security

How PRism protects users' code, tokens and accounts, what it trusts, and where the gaps
are. To report a vulnerability, read [SECURITY.md](../SECURITY.md). Defects that are already
known are listed in [known-issues.md](known-issues.md).

## What PRism holds, and what it does not

| Data | Stored? | Where, for how long |
|---|---|---|
| Your source repository | **No.** Never cloned | |
| The diff of a pull request or commit | Cached only | Redis, 1 hour. Not purged on account deletion ([G9](known-issues.md#integrity-gaps)) |
| Short code snippets from fixes | Yes | `reviews.suggested_fixes`, kept until the account is deleted |
| Your GitHub access token | Yes, **encrypted** | `users.github_token`, AES-256-CBC with an HMAC |
| Your Slack webhook URL | Yes, plaintext | `users.slack_webhook_url` |
| API tokens | Only a SHA-256 hash | `personal_access_tokens.token` |
| Webhook secrets | Yes, plaintext | `repositories.webhook_secret` (the HMAC key for that repository) |
| An audit trail of your actions | Yes | `audit_logs`, shown to you at `/security/audit-log` |

The app tells the user the same thing at `/security` and `/security/my-data`.

## Trust boundaries

```mermaid
flowchart TB
    subgraph untrusted [Untrusted]
        BR[Browser]
        GHW[Webhook sender]
        MODEL[Model output]
        PAYLOAD[Webhook payload fields]
    end
    subgraph web [prism-web]
        MW[middleware: CSP nonce, request id]
        SA[Server components and actions]
    end
    subgraph api [prism-api]
        RL[RateLimitGuard]
        AG[Auth guards]
        V[ValidationPipe whitelist]
        SVC[Services]
    end
    BR --> MW --> SA --> RL
    GHW -->|HMAC| RL
    RL --> AG --> V --> SVC
    MODEL -->|validated against the diff| SVC
    PAYLOAD -->|scalar-only text()| SVC
```

Three inputs are treated as hostile by design:

1. **Webhook bodies.** Authenticated by HMAC, and even then every field is coerced through a
   scalar-only helper, so an object where GitHub documents a string cannot become
   `"[object Object]"` in a title, author, branch or commit SHA.
2. **Model output.** Findings are accepted only if they resolve to a line the model was
   shown. Design blueprints are normalised: types coerced, strings and lists capped, entries
   without their defining field dropped.
3. **The browser.** It receives no secret it does not need and never calls the API directly.

## Authentication

### Sign-in: GitHub OAuth only

There is no password sign-in, so there is no password to steal or stuff. The flow:

1. `GET /auth/github` generates 32 random bytes as `state`, stores them in the
   `prism_oauth_state` cookie (`httpOnly`, `SameSite=Lax`, `secure` in production, 10 minutes)
   and redirects to GitHub with scopes `repo read:user`.
2. `GET /auth/github/callback` compares the returned `state` to the cookie in constant time
   and clears the cookie, exchanges the code (15 second timeout), reads the profile, falls back
   to `/user/emails` when the email is private, upserts the user by `github_id`, encrypts the
   token, records a `login` audit row, sets the session cookie and redirects.
3. Both routes are limited to 10 requests per minute.

The `repo` scope is broad. PRism needs it to read diffs of private repositories, post comments
and install webhooks, and GitHub OAuth apps cannot request less for that combination. Teams
that need per-repository permissions need a GitHub App, which does not exist yet.

### Browser session

- A JWT (HS256) signed with `JWT_SECRET`, claims `{sub: userId, username}`, lifetime
  `SESSION_TTL_DAYS` (30).
- Set as `prism_session`: `httpOnly`, `SameSite=Lax`, `secure` in production, path `/`.
- `WebAuthGuard` verifies the signature, checks the token is not revoked, then **loads the
  user row** rather than trusting the claims. A deleted account therefore stops working at
  once, even with an unexpired token. Any failure is `401 Unauthenticated.`
- `OptionalWebAuthGuard` is used only by `GET /security`. It never rejects.
- **Logout is real.** `POST /auth/logout` stores `session:revoked:{sha256(jwt)}` in Redis until
  the token's own expiry, so a copied cookie stops working too. The revocation check **fails
  open** on a Redis error (an outage must not sign everyone out); the signature is still
  verified. Any new guard that reads the session must check revocation.

### API tokens

`Authorization: Bearer {id}|{plaintext}`. The plaintext is 40 alphanumerics, shown once; the
database keeps `sha256(plaintext)`. The guard loads the row by id, compares hashes in constant
time, refuses expired tokens, and records `last_used_at` without waiting. Every failure is
the same `401 Unauthenticated.`

Tokens are all-powerful within their user: `abilities` is stored (`["*"]`) but never enforced
([G6](known-issues.md#integrity-gaps)). The format is fixed by tokens already deployed in MCP
configs.

## Authorisation

- Reviews and repositories belong to a user through `repositories.user_id`. A request for a
  resource owned by someone else is `403` on `/api/v1` and on browser routes.
- `prism-web` folds `400`, `403` and `404` into one not-found page. A separate "forbidden"
  screen would confirm that a given review id exists.
- Design ids: missing, expired, malformed and foreign all return one identical `404`.
- The raw-diff route (`GET /reviews/:id/diff`) fetches from GitHub with the *owner's* token on
  the server and passes GitHub's status through; the token never reaches the browser.

## Secrets and encryption

| Secret | Protection | If lost or rotated |
|---|---|---|
| `APP_KEY` | Environment only | Every stored `github_token` becomes permanently unreadable; users must sign in again |
| `JWT_SECRET` | Environment only (`generateValue` on Render) | Everyone is signed out |
| `users.github_token` | AES-256-CBC, MAC checked in constant time **before** decrypting | n/a |
| Webhook secrets | Per repository, random, 40 characters | Re-connect the repository |
| Groq and GitHub client secrets | Environment only | Rotate at the provider and redeploy |

The token envelope is fixed by the rows already in the database; see
[database.md](database.md#usersgithub_token). A token preview on `/security/my-data` shows only
the first 4 and last 4 characters and the length.

## Webhooks

The only authentication is an HMAC-SHA256 of the **raw** request body under the repository's
secret, compared in constant time against `X-Hub-Signature-256`. IP allow-listing was removed
because Render's edge masks GitHub's address. `rawBody: true` is what makes the digest
possible, so do not add middleware that re-serialises the body before the controller. Limits:
60 requests per minute, 100 kB body.

## HTTP hardening

**prism-api** sends helmet's headers with a Content-Security-Policy of
`default-src 'none'; frame-ancestors 'none'`. The API never serves a page, so a response that
somehow rendered in a browser could not run script, load anything or be framed. There is no CORS.
Request bodies are validated with `whitelist` and `forbidNonWhitelisted`.

**prism-web** sets a CSP per request in `src/middleware.ts`:

```text
default-src 'self'
script-src 'self' 'nonce-<per request>' 'strict-dynamic'          (+ 'unsafe-eval' in development)
style-src 'self' 'unsafe-inline'
img-src 'self' data: blob: https://github.com https://avatars.githubusercontent.com
font-src 'self'
connect-src 'self'                                                  (+ the API origin on /waking; + ws: in development)
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

An injected `<script>` has no nonce and does not run. `style-src` keeps `'unsafe-inline'`
because components set inline `style` attributes; CSS cannot execute code, and the script
policy is what stops XSS. Fonts are self-hosted, so no third-party font origin is allowed.
Rules for contributors: an inline script must read the nonce from the `x-nonce` request header
(as `layout.tsx` does for the theme script), and a new third-party origin must be added to the
policy deliberately.

Cookie-authenticated state changes are made by Next.js Server Actions, which the framework
protects with an Origin check, and the session cookie is `SameSite=Lax`.

## Rate limiting and abuse controls

| Control | Limit |
|---|---|
| Global, per verified session user or per IP | 100 per minute (`API_RATE_LIMIT`) |
| Webhook | 60 per minute |
| OAuth routes | 10 per minute |
| Design generation | 10 per user per hour, in Redis, **fails closed** |
| Request body | 100 kB |
| Diff read from GitHub | 2,000,000 bytes |

The limiter verifies the session cookie before keying a bucket, so a forged or expired cookie
falls back to the IP bucket and cannot be used to drain another user's allowance. API-token
callers are keyed by IP on purpose: an unverified token must not mint a fresh bucket per
request. Counters are in process memory and `trust proxy` is `true`, so a forged
`X-Forwarded-For` can evade the IP bucket ([T14](known-issues.md#t14)).

## Data subject controls

- **View:** `/security/my-data` lists the profile, a token preview, counts, designs and
  repositories. `/security/audit-log` shows the last 200 actions.
- **Export:** each review exports to PDF.
- **Delete:** `DELETE /security/my-data` with `{"confirm":"DELETE"}` removes the user and, by
  cascade, everything keyed to them, after removing the GitHub webhooks and clearing Redis
  behind an erasure marker. Details and gaps in [database.md](database.md#account-deletion).
- **Revoke:** revoking PRism at GitHub does not currently trigger any cleanup; there is no
  handler for it.

## Supply chain

- CI runs `npm audit --omit=dev --audit-level=high` for all three packages on every pull request.
- `.npmrc` sets `ignore-scripts=true` and `audit=true`, so installing dependencies does not run
  their lifecycle scripts.
- `mcp-server` has no lockfile on purpose (it is a published package whose users resolve its
  ranges fresh), and CI installs it the same way to audit what users would get.

## Logging

The logger does not write tokens. The access log records the **path only**, because the OAuth
callback carries a one-time `code` in its query string. Some warnings do include up to 200 to
500 characters of a model's output or of an upstream error body, and those can quote code from
a diff, so treat the log drain as sensitive. Each line carries a request or job id
([operations.md](operations.md#following-one-request)).

## Threat summary

| Threat | Mitigation | Residual risk |
|---|---|---|
| Forged webhook | HMAC over the raw body, constant-time compare | Connection state is revealed by the 404-before-401 order ([T12](known-issues.md#t12)) |
| Stolen DB dump | Tokens encrypted; API tokens hashed | Webhook secrets and Slack URLs are plaintext |
| Stolen session cookie | `httpOnly`, server-side revocation on logout, user row re-read per request | A cookie is valid until it expires or is revoked |
| XSS | Nonce CSP with `strict-dynamic`, no inline script without a nonce | `style-src 'unsafe-inline'` |
| Review-id enumeration | 403 and 404 folded into one page; design ids indistinguishable | `/api/v1` returns a distinct 403 to token holders |
| Prompt injection through a diff | Output is validated against the diff and cannot trigger any action beyond text in a comment | A hostile diff can still make a review say misleading things about that diff |
| Hung or abusive upstream | Per-call timeouts, a cancelling job budget, a diff size cap | Groq's free-tier limits |
| Cross-user data after deletion | Erasure marker plus atomic Redis scripts | Diff caches survive up to an hour |
