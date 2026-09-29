# ADR-002: Modular NestJS API with centralized authorization

- Status: Accepted (revised in v0.2)

## Context

V1 kept every controller in one file (`resources.ts`), two controllers were never registered (no task/project
get/update/delete routes existed at runtime), and authorization checks were duplicated per controller.

## Decision

- One NestJS module per domain: `auth`, `workspaces`, `projects`, `tasks`, `activities`, `realtime`, `health`, plus
  `config`, `prisma` and `common`.
- Controllers are thin; services own business rules; DTOs (class-validator + Swagger decorators) define the contract.
- Authentication is a **global guard**: routes are private unless marked `@Public()`.
- Tenant authorization is centralized in `AccessService`; services call it before touching data.
- Mutations and their activity entries share one Prisma transaction; realtime events are emitted after commit.
- A single error envelope with stable machine-readable codes (see `docs/api.md`).

## Alternatives

- Per-route guards with metadata-driven resource resolution — more indirection for four resource types.
- Microservices — no scaling or team-boundary need.

## Consequences

- New endpoints are secure by default and must opt into public access explicitly.
- Integration tests boot the real module graph and HTTP pipeline (`configureApp`) against PostgreSQL.
