# ADR-003: Authentication with short-lived JWT access tokens

- Status: Accepted (revised in v0.2)

## Context

The product needs email/password accounts for HTTP and WebSocket clients. V1 used a silent fallback secret
(`process.env.JWT_SECRET || 'local-only-secret'`) and its bcrypt import crashed at runtime.

## Decision

- bcrypt (cost 12) for passwords; HS256 JWT access tokens (default 2h) carrying only `sub`.
- The same token authenticates REST (`Authorization: Bearer`) and the Socket.IO handshake.
- **Explicit configuration policy:** `JWT_SECRET` is required, ≥ 32 chars and not a known placeholder; the API refuses to
  start otherwise. No environment gets a default secret.
- Rate limiting on `login`/`register` via `@nestjs/throttler` (in-memory).

## Alternatives

- Server-side sessions — needs a session store and CSRF handling; revisit with refresh tokens.
- OAuth/OIDC — out of scope for v0.2.

## Consequences

- Simple, stateless verification; revocation is limited to user deletion or secret rotation until refresh tokens exist.
- The SPA stores the token in `localStorage` (XSS trade-off documented in `docs/security.md`).
- In-memory rate limiting is per API instance; a shared store is needed when scaling horizontally.
