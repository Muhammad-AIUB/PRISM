<div align="center">

# 🔍 PRism

### AI-Powered Code Review Platform

*An intelligent, self-hostable alternative to CodeRabbit and Greptile — built with engineering depth, not just features.*

[![Laravel](https://img.shields.io/badge/Laravel-11-FF2D20?logo=laravel)](https://laravel.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-Upstash-DC382D?logo=redis)](https://upstash.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

---

## 🎯 The Problem

Modern software teams face three painful realities in code review:

1. **Senior bandwidth is scarce.** Junior PRs sit in queues for hours, sometimes days. Velocity dies.
2. **Existing AI tools are expensive.** CodeRabbit charges **$24/dev/month**, Greptile is even higher. Small teams and developers in emerging markets can't afford it.
3. **Generic reviewers miss framework-specific issues.** N+1 Eloquent queries, missing Laravel validation, React key-prop bugs — most AI tools don't catch them.

**PRism solves all three.** It's a self-hostable, production-grade AI code reviewer that runs on free infrastructure, understands language-specific anti-patterns, and posts actionable feedback directly on every pull request — automatically, within seconds.

---

## ✨ What PRism Does

When a developer opens a pull request on a connected repository, PRism:

1. **Receives** the GitHub webhook (HMAC-verified, IP-whitelisted)
2. **Fetches** the unified diff via GitHub API
3. **Detects** the languages involved (PHP, JS/TS, Python, Go, Ruby, Java)
4. **Analyzes** the code through three engineering lenses:
   - 🔒 **Security** — SQL injection, hardcoded secrets, missing auth checks
   - ⚡ **Performance** — N+1 queries, missing indexes, memory leaks
   - 🧹 **Code Quality** — SOLID violations, dead code, naming issues
5. **Generates** an overall quality score (0–100)
6. **Produces** concrete code fixes — not just complaints, but `before → after` snippets
7. **Posts** a summary comment back to the PR on GitHub
8. **Notifies** the developer via email (Resend) and Slack
9. **Displays** everything in a beautiful dashboard with score trends over time

All of this — with zero recurring cost on free tiers.

---

## 🏗️ Architecture

```
                    ┌─────────────────┐
                    │   GitHub PR     │
                    │   (opened)      │
                    └────────┬────────┘
                             │ webhook (HMAC + IP verified)
                             ▼
        ┌────────────────────────────────────────┐
        │  Laravel App (Inertia.js + React)      │
        │  ├─ Webhook Controller                 │
        │  ├─ Rate Limiter (60/min per IP)       │
        │  └─ Security Headers Middleware        │
        └────────────────┬───────────────────────┘
                         │ dispatch job
                         ▼
        ┌────────────────────────────────────────┐
        │  Queue Worker (Redis-backed)           │
        │  ├─ Fetch diff (cached 1hr)            │
        │  ├─ Detect languages                   │
        │  ├─ Build language-specific prompt     │
        │  ├─ Call OpenRouter AI                 │
        │  ├─ Parse & score                      │
        │  └─ Generate auto-fixes (2nd AI call)  │
        └────────┬──────────────┬────────────────┘
                 │              │
        ┌────────▼─────┐  ┌────▼──────────────┐
        │  PostgreSQL  │  │  Notifications    │
        │  (Neon.tech) │  │  ├─ Email (Resend)│
        │              │  │  ├─ Slack Webhook │
        │  Encrypted   │  │  └─ GitHub Comment│
        │  tokens      │  └───────────────────┘
        └──────────────┘
                 │
                 ▼
        ┌──────────────────┐
        │  React Dashboard │
        │  + Review Page   │
        └──────────────────┘
```

---

## 🚀 Features

### Core Review Pipeline
- 🤖 **AI-powered code analysis** through three lenses (Security / Performance / Code Quality)
- 📊 **Overall quality score** (0–100) with color-coded visual indicator
- 🛠️ **Auto-fix suggestions** — side-by-side `current code` vs `suggested fix` with one-click copy
- 🔄 **Re-analyze button** — re-run the full pipeline on the latest commit
- 🌐 **Language-aware rules** — different checks for PHP, JS/TS, Python, Go, Ruby, Java
- 💬 **Automatic PR comments** — summary posted to GitHub on completion

### User Experience
- 🎨 **Modern dark UI** built with Tailwind + Inter font + lucide-react icons
- 📱 **Fully responsive** — mobile, tablet, laptop, desktop, ultra-wide
- 📈 **Score trend chart** — track code quality across last 30 PRs (Chart.js)
- 🏷️ **Severity filter** — focus on Critical / Warning / Suggestion separately
- 📄 **PDF export** — download a polished review report for offline sharing
- 🔍 **Diff viewer** — color-coded diff (green/red/accent) with monospace formatting
- 🌗 **Dark/light mode toggle with localStorage persistence (FOUC-free)**

### Notifications
- 📧 **Email notifications** via Resend (3000/month free)
- 💬 **Slack notifications** with rich attachments, color-coded by score
- ⚙️ **User-controlled preferences** — opt in/out per channel

### Security
- 🔐 **AES-256 encrypted GitHub tokens** at rest (Laravel Crypt)
- ✅ **HMAC-SHA256 webhook signature verification**
- 🛡️ **GitHub IP whitelist** with CIDR matching (cached 24h)
- 🚦 **Multi-tier rate limiting** — webhook 60/min, API 100/min, auth 10/min
- 🔒 **Security headers** — CSP, HSTS, X-Frame-Options, Permissions-Policy
- 🚪 **GitHub OAuth-only login** — no password attack surface

### Performance
- ⚡ **Redis caching** (Upstash) — GitHub API responses cached 5min, diffs 1hr
- 📑 **Composite database indexes** on every hot foreign-key path
- 🔗 **Eager loading enforced** — zero N+1 queries on dashboard
- 🎯 **Selective column projection** via explicit `->select()`

### Reliability & Observability
- 🔁 **Job retry with exponential backoff** — `[60s, 180s, 600s]`, 3 attempts
- 📝 **Structured JSON logging** with `X-Request-Id` tracing
- 🏥 **Health check endpoint** (`/health`) — DB, Redis, Queue status
- 📊 **AI call metrics** — model, duration, token usage logged per call

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Laravel 11, PHP 8.4 |
| **Frontend** | Inertia.js + React 18 |
| **Database** | PostgreSQL 16 (Neon.tech) |
| **Cache & Queue** | Redis (Upstash) |
| **AI** | OpenRouter (DeepSeek V4 Flash — free) |
| **Auth** | Laravel Socialite + GitHub OAuth |
| **Email** | Resend |
| **Styling** | Tailwind CSS + lucide-react |
| **Charts** | Chart.js + react-chartjs-2 |
| **PDF** | barryvdh/laravel-dompdf |

---

## 📊 What Got Solved (Engineering Highlights)

### Solved Problems

| Problem | Solution | Impact |
|---|---|---|
| GitHub tokens stored in plaintext | Laravel `encrypted` cast (AES-256) | Tokens unreadable even with DB dump |
| Webhook endpoint open to abuse | HMAC verify + GitHub IP whitelist + rate limit | Triple-layer DDoS & spoof protection |
| Repeated GitHub API calls | Redis caching with TTL | ~80% reduction in upstream calls |
| Job failure cascades | `tries=3`, exponential backoff, `failed()` handler | Auto-recovery without data loss |
| N+1 query risk on dashboard | Eager loading + composite indexes | Sub-50ms dashboard load |
| Untraceable production errors | Structured JSON logs + `X-Request-Id` | Debug single request across services |
| Generic AI review missing framework issues | Language-specific rule injection | Catches Laravel N+1, React key-prop, etc. |
| Email failures crashing reviews | Try-catch with `Log::warning`, no rethrow | Notifications fail-safe |

### Architectural Decisions

- **Service-based monolith over microservices** — appropriate for current scale; clear bounded contexts allow extraction later if needed
- **Inertia.js over separate API + SPA** — single deploy, single auth flow, no CORS pain
- **Sync queue for dev, Redis queue for prod** — same code path, different driver
- **Self-hostable from day one** — no vendor lock-in, runs on free tier infrastructure

---

## 🔮 Roadmap — Future Enhancements

### Near-term (high-impact, low-effort)
- [ ] **Merge risk indicator** — automatically block merges below score 40 via GitHub Status API
- [ ] **One-click "Post Fix to GitHub"** — turn suggested_fix into an inline PR comment
- [ ] **Developer insight dashboard** — per-author trend: "your top 3 recurring mistakes"
- [ ] **Team leaderboard** — weekly code quality ranking for orgs

### Mid-term (medium-effort, differentiating)
- [ ] **Configurable review profiles** — strict / balanced / relaxed per repo
- [ ] **Custom rules YAML** — let teams define their own coding standards
- [ ] **Multi-AI fallback** — DeepSeek → Llama → Mistral chain on failure
- [ ] **Inline PR annotations** — line-level comments via GitHub Reviews API (not just summary)
- [ ] **Webhook retry UI** — re-trigger from failed deliveries dashboard

### Long-term (platform expansion)
- [ ] **GitLab + Bitbucket support** — same pipeline, different SCM adapters
- [ ] **CI/CD integration** — block deploys on PRism score thresholds
- [ ] **Historical regression detection** — flag when score drops vs prior PRs on the file
- [ ] **Team analytics API** — exportable JSON for engineering metrics dashboards
- [ ] **Self-hosted LLM support** — Ollama / LocalAI for fully air-gapped deployments
- [ ] **Public API** — let developers integrate PRism into their own tools

### Performance & Scale (when traffic justifies)
- [ ] **Horizontal queue scaling** — multiple workers with Laravel Horizon
- [ ] **Read replicas** for analytics queries
- [ ] **CDN for static assets** — Cloudflare integration
- [ ] **Database partitioning** by `created_at` for review_comments table
- [ ] **Cache warming** — pre-fetch repo lists on user login
- [ ] **Diff chunking** — handle huge PRs (>10k lines) by splitting and merging analyses

### Developer Experience
- [ ] **Docker Compose setup** — one-command local development
- [ ] **GitHub Action for self-deployment** — push-to-deploy template
- [ ] **OpenAPI spec** for the internal API
- [ ] **Storybook** for React component library

---

## 📐 Engineering Decisions Documented

These are the deliberate trade-offs made during development — not bugs, choices:

| Decision | Trade-off | Why |
|---|---|---|
| Sync queue in dev, async in prod | Slower dev feedback | Same code path, simpler debugging |
| OAuth-only login | No traditional signup | Eliminates password storage entirely |
| Service-based monolith | Not microservices | Right size for stage; can extract later |
| OpenRouter free tier | Occasional model deprecation | Zero cost; abstracted behind config |
| Bypass IP whitelist in non-prod | Tunnels keep working | Locks down only in real production |
| In-house CIDR matching | Could use Symfony IpUtils | Reduces dependency footprint |

---

## 🤝 Acknowledgements

Built with engineering depth inspired by real production systems:
- **Hexagonal Architecture** principles (separation of core logic from external drivers)
- **OWASP Top 10** security checklist applied throughout
- **Twelve-Factor App** methodology for config and process management

---

<div align="center">

**Built to demonstrate that production-grade engineering doesn't require enterprise budgets.**

If you found this project interesting, I'd love to connect.

</div>
