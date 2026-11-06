# Security policy

PRism holds users' GitHub access tokens and reads their code, so security reports are taken
seriously. This is a small project maintained by one person; reports are handled on a
best-effort basis.

## Reporting a vulnerability

**Please do not open a public issue or pull request for a security problem.**

Contact the maintainer privately through the links on <https://www.mjubayer.dev/> or on their
GitHub profile, <https://github.com/Muhammad-AIUB>, and ask for a private channel before you
share details. Include:

- what you found and where (a route, a file, a deployed URL);
- the impact you believe it has;
- steps to reproduce, or a proof of concept that does not touch other people's data;
- the commit or deployment you tested.

The maintainer aims to acknowledge a report promptly, to fix confirmed issues, to explain when
something is not a vulnerability, and to credit you if you want it. There is no bug bounty.

## Scope

In scope: this repository (`prism-api`, `prism-web`, `mcp-server`), and the deployment at
<https://prism-web-fgts.onrender.com>.

Examples of what matters most here: anything that exposes or lets someone forge a GitHub token, a
session or an API token; authentication or authorisation bypass; one user reading another's reviews,
designs or data; a forged webhook being accepted; cross-site scripting or a CSP bypass; data surviving
account deletion; and secrets in logs or responses.

Out of scope: denial of service by volume against the free-tier hosts; findings that need a
compromised account or device; missing best-practice headers with no demonstrable impact; the
behaviour of Render, Neon, Upstash, Groq or GitHub themselves; and issues already listed in
[docs/known-issues.md](docs/known-issues.md) (though an exploit for one is welcome).

Please test only against your own accounts and repositories, and do not access, modify or delete
data that is not yours.

## Supported versions

Only the latest commit on `main` is supported. There are no release branches.

## How PRism handles your data

What is stored, what is trusted, and how it is protected are in
[docs/security.md](docs/security.md). Users can inspect their data at `/security/my-data` and delete
it, including their account, from the same page.
