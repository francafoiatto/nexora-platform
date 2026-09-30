# NEXORA V1 — HANDOFF

Status: **V1 released, development cycle closed (2026-09-30).** A new cycle starts only with explicit authorization.
(`docs/history/V1_HANDOFF.md` is a different document: the handoff of the original external candidate implementation,
kept for history.)

## Product

NEXORA is a real-time operations platform for teams (B2B SaaS). V1 provides:

- accounts;
- multi-tenant workspaces with owner/member roles;
- projects;
- a Kanban board (create, edit, assign, prioritize, schedule, move, delete tasks);
- live updates between teammates;
- an activity feed;
- a workspace dashboard.

It also serves as a public showcase of full-stack engineering and production practice.

## Repository

- **Repository:** https://github.com/francafoiatto/nexora-platform (public, MIT, © 2026 Robson França Foiatto), branch `main`.
- **Application baseline:** `24b8cbb4cf182588369f33b8a4538a4d62b0342e`, the source running in production for both API and web.
  Commits after it change documentation only.
- **History:** the V1 candidate import (`47956c6`) followed by the reworked implementation. See `docs/reports/FINAL_ENGINEERING_REPORT.md`.

## Architecture

- **Monorepo (pnpm):**
  - `apps/web`: React 18, Vite, TanStack Router/Query, React Hook Form + Zod;
  - `apps/api`: NestJS 10, Prisma 6, Socket.IO;
  - `packages/contracts`: shared enums, schemas and types.
- **Data:** PostgreSQL 16. Tenant chain: Task → Project → Workspace → Membership.
- **Realtime:** Socket.IO in the API process, one room per workspace. The handshake is authenticated with the JWT; room
  joins require membership; events are emitted after commit (`task.*`, `project.*`, `activity.created`).
- **Details:** `docs/architecture/overview.md`, `docs/api.md`, ADR-001…006.

## Production

| Component | Provider | URL |
| --- | --- | --- |
| Web | Cloudflare Pages, project `nexora-platform`, provider domain | https://nexora-platform-dwy.pages.dev |
| API | Railway, project `nexora-platform`, env `production`, service `api` (1 replica) | https://api-production-547f.up.railway.app (`/api/docs`, `/api/v1/health`) |
| Database | Railway PostgreSQL, service `Postgres`, volume `postgres-volume` | private network only |

- The Railway workspace also contains unrelated projects. NEXORA is isolated at project level (own services, database, volume and secrets) and must never touch them.
- No custom domain, and no other Cloudflare products.

## CI/CD

- **GitHub Actions** (`.github/workflows/ci.yml`), on push and PR:
  - `lint · typecheck · test · build`, with a PostgreSQL 16 service;
  - `e2e (Playwright)`.
- **API (Railway):** deploys from GitHub `main` with **Wait for CI**. A deployment waits until the checks succeed and is
  skipped when no watched API file changed (`railway.json` watch patterns). Verified with real pushes (docs/deployment.md).
- **Web (Cloudflare Pages):** **Direct Upload.** Build locally from a CI-green SHA with `VITE_API_URL`, then
  `wrangler pages deploy … --branch main --commit-hash <sha>`. The Cloudflare Git integration is not used.

## Security

- **Authentication:** bcrypt (cost 12) and HS256 JWT (2 h). `JWT_SECRET` is required, ≥ 32 characters, with no fallback,
  and the API refuses to start without it. Login/register are rate-limited per client IP (`TRUST_PROXY=1` behind Railway).
- **Authorization:** every resource is resolved server-side through `AccessService`. Non-members get 404; owner-only
  actions return 403; an assignee must be a member of the workspace (`ASSIGNEE_NOT_MEMBER`).
- **Transport:** HTTPS/WSS only; CORS limited to exactly the Pages origin; a strict CSP on the web host.
- **Database:** never publicly exposed (no TCP proxy). Secrets live only in Railway variables and never in the repository or docs.
- **Details:** `docs/security.md`, `SECURITY.md`.

## Testing

- **Automated suites** (all in CI):
  - API unit and integration on real PostgreSQL: 95, including the tenant-isolation matrix and realtime rooms;
  - web (Vitest + RTL): 42;
  - contracts: 6;
  - Playwright E2E: 7, covering the golden path, two-browser realtime, isolation by URL, a WCAG 2.1 AA axe audit,
    keyboard use and mobile.
- **Production verification (2026-09-30):** smoke, WSS realtime, tenant isolation over HTTP and sockets, CORS, HTTPS,
  375/768/1024/1440 px and log review, all passing (`docs/deployment.md`).

## Known Limitations (accepted for V1)

1. The access token is stored in `localStorage`; there is no refresh token and no server-side revocation.
2. Rate limiting is in memory.
3. Socket.IO rooms are in memory and designed for a single API instance.
4. Production runs exactly one API replica.

This architecture is intentionally sized for the V1 showcase scale. Scaling out requires a shared store (e.g. Redis)
for rate limiting and the Socket.IO adapter, together with a token strategy review.

Other gaps (member removal, invitations, password reset, board pagination, code splitting) are listed in the
engineering report §19–§21.

## Operational Notes

- **Health:** `GET /api/v1/health` returns 200 `{status:"ok",database:"up"}`, or 503 when the DB is unreachable; it is the Railway health check.
- **Migrations:** `prisma migrate deploy` runs in the container entrypoint on every start (idempotent). Applied:
  `0001_init`, `0002_index_hardening`. Never run `prisma migrate reset` or `db push` against production.
- **Seed:** demo seed is local/dev only and refuses `NODE_ENV=production`; it has never run in production.
- **Secrets:** `DATABASE_URL` (reference to the Railway Postgres), `JWT_SECRET` (random, 48 bytes) and the other
  variables live in Railway only. The contract is in `docs/deployment.md`.
- **Synthetic validation data** (intentionally left, no safe deletion path in the app):
  - users `nexora-smoke-{a,b,c}-muoat4b9@example.test`;
  - workspace `SMOKE-muoat4b9 Workspace A` (its project and tasks were deleted).
- **Housekeeping (human action):** the "Cloudflare Workers and Pages" GitHub App still has access to this repository
  and leaves a never-finishing queued check on each commit. It is unused (Direct Upload) and does not block Railway.
  Remove the repository from that app under GitHub → Settings → Applications → Installed GitHub Apps.

## Future Direction (NOT implemented)

A possible evolution of NEXORA into an **Engineering Operations Hub**:

- GitHub integration: repositories, PR monitoring, CI and deployment status;
- Golden Path tracking and engineering gates;
- agent-assisted operational updates;
- multi-project operational dashboards.

A candidate first internal integration is ANTHEVO.

**Architectural rule:** NEXORA stays decoupled from the products it observes and integrates only through controlled
interfaces (APIs, GitHub, webhooks, events). It never depends on another product's private database.

No issues, branches, schemas or code exist for this; it is direction only.

## Resume Instructions

Before changing anything in a future session:

1. **Repository:** `git status`, `git log`, and confirm `main` = `origin/main` and a green CI on HEAD.
2. **Railway** (project `nexora-platform` only):
   - `api` and `Postgres` deployment status;
   - deployed SHA;
   - source `main`, Wait for CI;
   - variables by **name** only;
   - Postgres has no public URL.
3. **Production:** `GET /api/v1/health`; the Pages URL and a deep link return 200; CORS allows only the Pages origin.
4. **Cloudflare:** `wrangler whoami` (account `nevora2026@outlook.com`), and `wrangler pages deployment list --project-name nexora-platform`.
5. **Local validation:**
   - `pnpm db:up`
   - `pnpm validate`
   - `pnpm test:e2e`
6. **Rules:**
   - never reset or seed production;
   - never expose Postgres;
   - never touch other projects in the workspace;
   - never add secrets to the repo;
   - never deploy a commit without green CI.
