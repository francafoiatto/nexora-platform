# Nexora V1 Handoff

## Purpose
Candidate implementation for Claude Code inspection. This ZIP is not an authority and is not production-ready.

## Implemented
Monorepo scaffold, Prisma domain model, NestJS API foundation, React shell/Kanban, Socket.IO wiring, seed, docs, CI and test structure.

## Architecture / Important decisions
See `docs/architecture/overview.md` and ADRs. Local PostgreSQL is the only infrastructure dependency. JWT and bcryptjs were selected for a small local foundation.

## Security model
Every private resource must resolve project → workspace → membership server-side. Password hashes are excluded from responses. Socket rooms require authenticated membership.

## Database / Realtime / UI/UX
Prisma models are in `apps/api/prisma/schema.prisma`; realtime room conventions are in API gateway; frontend uses query hooks and cache invalidation.

## Tests executed
See `BUILD_REPORT.md`. Each command is recorded as `COMMAND → ACTUAL RESULT`; unexecuted commands are marked `NOT VERIFIED`.

## Known issues / limitations / technical debt
Candidate-level implementation; migrations may require a running Docker daemon, E2E requires browsers, and some production hardening (refresh token rotation, rate limits, CSRF strategy, observability) remains for audit.

## Files requiring review
`apps/api/src`, `apps/api/prisma`, `apps/web/src`, package manifests and all auth/authorization paths.

## Recommended Claude Code inspection order
UNDERSTAND → INSPECT → PLAN → VALIDATE → CORRECT → VERIFY → DOCUMENT.

## Suggested next steps
Install dependencies, start PostgreSQL, run schema/seed, run checks, audit authorization and add integration coverage before any deployment decision.
