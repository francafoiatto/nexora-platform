# Nexora architecture

## System context

```
Browser (untrusted)
  │  HTTPS  /api/v1/*          Bearer JWT
  │  WSS    /socket.io         handshake auth: { token }
  ▼
NestJS 10 API ──────────────── Socket.IO gateway (same process)
  │ Prisma 6
  ▼
PostgreSQL 16
```

Locally, PostgreSQL runs in Docker Compose (bound to `127.0.0.1`). In development the Vite server proxies `/api` and
`/socket.io` to the API, so the browser talks to a single origin. No other infrastructure (Redis, queues, cloud services)
is required. A possible production topology (static web host + one API container + managed PostgreSQL) is described in
[ADR-006](../adr/ADR-006-local-and-production-infrastructure.md).

| | Local | Production |
| --- | --- | --- |
| Web | Vite dev server (proxies `/api`, `/socket.io`) | Cloudflare Pages (static build, CSP headers) |
| API | `nest start --watch` | Railway container (Dockerfile), 1 replica, HTTPS/WSS |
| Database | PostgreSQL in Docker Compose (`127.0.0.1`) | Railway PostgreSQL, private network only |
| Migrations | `pnpm db:migrate` | `prisma migrate deploy` in the container entrypoint |

Current production limits: 1 API instance, in-memory rate limiting, single-instance Socket.IO, and the access token in
`localStorage`. Details: [docs/deployment.md](../deployment.md).

## Monorepo

| Path | Role |
| --- | --- |
| `apps/api` | NestJS API, Prisma schema/migrations/seed, Jest unit + integration tests |
| `apps/web` | React SPA, Vitest/RTL tests, Playwright E2E |
| `packages/contracts` | Shared enums, zod form schemas, API response and realtime event types (consumed as TS source) |

`packages/contracts` exists because both apps need the same vocabulary. The API's class-validator DTOs remain the
authoritative validation; the zod schemas mirror their limits for client-side UX, and an API unit test
(`test/contracts-parity.spec.ts`) fails if the database enums and the shared enums drift apart.

## Backend (`apps/api/src`)

| Module | Responsibility |
| --- | --- |
| `config/` | Parses and validates environment once at startup (`parseConfig`); fails fast, no silent fallbacks |
| `prisma/` | `PrismaService` (global) and the `Tx` transaction type |
| `common/` | Error envelope + codes, global exception filter, validation pipe, request logger, JSON logger, `@Public()` / `@CurrentUser()` |
| `auth/` | Register / login / me, bcrypt, `TokenService` (issue/verify JWT), global `AuthGuard`, rate limiting on credential endpoints |
| `workspaces/` | `AccessService` (**all tenant authorization**), workspaces, members, dashboard summary |
| `projects/` | Project CRUD with task counts |
| `tasks/` | Task CRUD, assignee validation, status-change semantics |
| `activities/` | Activity recording (inside the mutation's transaction) and cursor-paginated feed |
| `realtime/` | Socket.IO gateway (handshake auth, membership-checked rooms), `RealtimeService` publisher, CORS-aware adapter |
| `health/` | `GET /api/v1/health` with a database probe |

Request pipeline: `helmet` → CORS allow-list → request logger (request id) → global `AuthGuard` (routes are private by
default) → `ValidationPipe` (whitelist + forbid unknown fields) → controller → service → `AllExceptionsFilter`.

### Write path (example: move a task)

1. `AuthGuard` verifies the JWT and loads the user (a deleted user's token stops working).
2. `AccessService.requireTask(taskId, userId)` resolves task → project → workspace → membership in one query; non-members get **404**.
3. In one transaction: assignee check (if changed), `UPDATE task`, `INSERT activity` (`task.status_changed` with from/to).
4. After commit: `RealtimeService` emits `task.updated` and `activity.created` to room `workspace:{id}`.

### Data model

`User` ─< `WorkspaceMember` >─ `Workspace` ─< `Project` ─< `Task`; `Workspace` ─< `Activity`.

- UUID primary keys (`@default(uuid())`, stored as text).
- Cascades: deleting a workspace removes members, projects, tasks and activity; deleting a project removes its tasks.
- `Task.assigneeId` → `ON DELETE SET NULL`; task creator and activity actor → `RESTRICT` (history is preserved).
- Indexes: `WorkspaceMember(userId)`, `Project(workspaceId)`, `Task(projectId,status)`, `Task(assigneeId)`, `Task(createdById)`,
  `Activity(workspaceId,createdAt)`, `Activity(actorId)`; unique `User.email`, `Workspace.slug`.
- Migrations: `0001_init` (V1) and `0002_index_hardening` (drops a redundant slug index, adds FK indexes).
- Activity metadata is denormalized (titles/names) so the feed stays readable after entities are deleted.

## Frontend (`apps/web/src`)

```
main.tsx            bootstrap (QueryClient, Router, fonts, styles)
router.tsx          TanStack Router route tree + guards
lib/                api-client (axios + error normalization), session store, query client/keys, formatting, form helpers
components/ui/      Button, Field (input/textarea/select with label+error), Dialog (native <dialog>), States, Badges
components/layout/  AppShell (sidebar/drawer, workspace switcher, live indicator), Logo
features/<domain>/  api.ts (requests + TanStack Query hooks) and pages/components per domain:
                    auth, workspaces, dashboard, projects, tasks, activity, realtime
styles/global.css   design tokens and component styles
test/               test setup, API transport mock, socket mock, fixtures
```

### Routes

| Path | Screen |
| --- | --- |
| `/login`, `/register` | Auth (redirect to `/app` when already signed in) |
| `/app` | Redirects to the last/first workspace, or onboarding when the user has none |
| `/app/:workspaceId` | Dashboard |
| `/app/:workspaceId/projects` | Projects |
| `/app/:workspaceId/projects/:projectId` | Project board |
| `/app/:workspaceId/activity` | Activity feed |
| `/app/:workspaceId/settings` | Rename workspace, members |

`/app/*` requires a session; losing it (sign-out, expired/revoked token → 401) redirects to `/login?redirect=…`, and
only in-app paths are accepted as redirect targets.

### Data & cache

- Components never call axios directly; each feature's `api.ts` exposes hooks.
- Query keys are centralized (`lib/query.ts`); workspace-scoped keys share the `['workspaces', id]` prefix.
- Retries: none for 4xx, up to 2 for network/5xx; mutations never retry.
- Mutations write results into the cache (`upsertTask`, `upsertProject`) and invalidate derived counters (summary, project counts).
- Only task **status moves** are optimistic (with rollback) — they have no server-derived fields.

### Realtime

`useWorkspaceRealtime(workspaceId)` (mounted by the app shell) connects the singleton socket, requests
`workspace.join` on every (re)connect, and merges events into the cache:

- `task.*` → idempotent upsert/remove by id (the author's own echo never duplicates), stale versions ignored by `updatedAt`;
- `project.*` → project list/detail; `activity.created` → prepended once to the feed;
- events are filtered by `workspaceId`; after a reconnect the workspace queries are refetched to cover missed events.

The sidebar shows the connection state (Live / Connecting / Offline / unavailable).
