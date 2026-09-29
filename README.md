# Nexora
## Real-Time Operations Platform

Nexora V1 is a candidate local full-stack foundation for teams managing projects and tasks in real time. It is intentionally not production-ready or public-release-ready.

## Features
- JWT authentication, workspace membership authorization, projects and tasks
- Kanban board with TODO / IN_PROGRESS / REVIEW / DONE
- Activity feed and Socket.IO task events
- Responsive B2B SaaS shell, loading/error/empty states
- Prisma/PostgreSQL schema, seed data, tests and CI skeleton

## Getting started
```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm --filter @nexora/api prisma:generate
pnpm --filter @nexora/api prisma:migrate
pnpm --filter @nexora/api prisma:seed
pnpm dev
```
Open http://localhost:5173. Demo: `demo@nexora.local` / `demo-password`.

## Commands
`pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`. Actual validation is recorded in HANDOFF.md and the build report.

## Structure
- `apps/web`: React/Vite frontend
- `apps/api`: NestJS API, Prisma schema and seed
- `packages/contracts`: shared Zod contracts
- `docs`: architecture and ADRs

## Security
Passwords are hashed with bcrypt. JWT authentication and membership checks are server-side. Never commit `.env`, tokens, credentials or generated artifacts.

## Scope and roadmap
Billing, OAuth, chat, uploads, notifications, Redis, queues, microservices and cloud provisioning are intentionally out of scope. Future work is to audit and correct this candidate implementation before any release.

## License
MIT
