# ADR-006: Local infrastructure now, production target documented only

- Status: Accepted

## Context

The project must run fully locally, with no cloud side effects, while keeping a credible path to production.

## Decision

- Local: Docker Compose PostgreSQL 16 bound to `127.0.0.1`; API and web run with Node.js.
- Tests use isolated databases on the same server: `nexora_test` (API integration) and `nexora_e2e` (Playwright).
- Production target (not provisioned): static hosting for `apps/web/dist`, one container for `apps/api`
  (`node dist/main.js`, `NODE_ENV=production`, explicit `CORS_ORIGINS`, JSON logs), managed PostgreSQL with
  `prisma migrate deploy` run as a release step.

## Alternatives

- Provision cloud resources now — explicitly out of scope; no deployments are performed.

## Consequences

- A production deployment still needs: TLS termination, secret management for `JWT_SECRET`/`DATABASE_URL`, backups,
  and a Socket.IO adapter if more than one API instance runs.
