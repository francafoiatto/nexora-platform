# ADR-001: pnpm monorepo

- Status: Accepted (revised in v0.2)

## Context

The web app and API evolve together and share a vocabulary (task statuses, priorities, payload shapes, realtime events).

## Decision

One pnpm workspace with `apps/web`, `apps/api` and a single shared package, `packages/contracts`, consumed as TypeScript
source. Shared tooling lives at the root (`eslint.config.mjs`, `tsconfig.base.json`).

In v0.2 the empty `packages/tsconfig` and `packages/eslint-config` placeholders from V1 were removed: a package is only
added when it carries real shared code.

## Alternatives

- Separate repositories — more coordination overhead for a two-app product.
- Turborepo/Nx — not needed at this size; `pnpm -r` is sufficient.

## Consequences

- One lockfile, one CI pipeline.
- `contracts` has no build step; the API only uses it in tests (enum-parity check) to avoid compiling a foreign rootDir.
