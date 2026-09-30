# Deployment

## Current production (verified 2026-09-30)

| Component | Where | URL / identifier |
| --- | --- | --- |
| Web | Cloudflare Pages, project `nexora-platform` (provider domain, no custom domain) | https://nexora-platform-dwy.pages.dev |
| API | Railway, project `nexora-platform`, environment `production`, service `api` | https://api-production-547f.up.railway.app (docs: `/api/docs`, health: `/api/v1/health`) |
| Database | Railway PostgreSQL 16, service `Postgres`, volume `postgres-volume`, private network only | not publicly reachable |

Release flow:

```
push to main ─► GitHub Actions (lint · typecheck · test · build, E2E)
                    │ all checks pass
                    ▼
         Railway api redeploys (Wait for CI; only when watched API files change)
                    │ entrypoint: prisma migrate deploy → node
                    ▼
               Railway PostgreSQL (private network)

Web: pnpm --filter @nexora/web build (VITE_API_URL set) ─► wrangler pages deploy ─► Cloudflare Pages (production branch main)
```

Topology (ADR-006):

```
Browser ── HTTPS ──► Cloudflare Pages (static React build: apps/web/dist)
   │
   └──── HTTPS / WSS ──► Railway: NestJS API + Socket.IO (apps/api, Docker image, 1 replica)
                              │
                              ▼
                         Railway PostgreSQL
```

The web app and the API are on different origins: the browser calls the API directly (CORS allow-list), and
Socket.IO connects to the API origin over WSS.

## Environment contract

### API (Railway service)

| Variable | Production value | Notes |
| --- | --- | --- |
| `NODE_ENV` | `production` | Enables JSON logs and requires `CORS_ORIGINS`; Swagger off unless `SWAGGER_ENABLED=true` |
| `DATABASE_URL` | reference to the Railway PostgreSQL variable | Never copied into files |
| `JWT_SECRET` | random, ≥ 32 chars (48 random bytes, base64url) | Generated once and stored only in Railway; the API refuses to start without it |
| `JWT_EXPIRES_IN` | `2h` (default) | |
| `CORS_ORIGINS` | the Cloudflare Pages URL, e.g. `https://<project>.pages.dev` | Comma-separated allow-list, applied to HTTP **and** Socket.IO. `*` is rejected. (Plural name because it is a list.) |
| `TRUST_PROXY` | `1` | Railway terminates TLS in one proxy hop; this makes `req.ip` the real client for rate limiting |
| `SWAGGER_ENABLED` | `true` | Public API docs (showcase decision, see below) |
| `PORT` | provided by Railway | The API reads it; `HOST` defaults to `0.0.0.0` |
| `AUTH_RATE_LIMIT` | `10` (default) | Login/register attempts per minute per client IP |
| `LOG_FORMAT` | `json` (default in production) | |

### Web (Cloudflare Pages, build time)

| Variable | Value | Notes |
| --- | --- | --- |
| `VITE_API_URL` | `https://<api-domain>/api/v1` | Baked into the bundle at build time |
| `VITE_SOCKET_URL` | *(unset)* | Socket.IO defaults to the origin of `VITE_API_URL` |

The build also emits `dist/_redirects` (SPA fallback `/* /index.html 200`, so deep links like
`/app/:workspaceId/projects/:projectId` survive a refresh) and `dist/_headers` (CSP whose `connect-src` is `'self'` plus
the API origin over `https` and `wss`, and `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`, long
caching for hashed assets).

### Origins

| Environment | Web origin | API | CORS_ORIGINS |
| --- | --- | --- | --- |
| Development | `http://localhost:5173` | proxied by Vite (same origin) | default `http://localhost:5173, http://127.0.0.1:5173` |
| E2E | `http://127.0.0.1:5174` | proxied by `vite preview` | `http://127.0.0.1:5174` |
| Production | Cloudflare Pages URL | Railway public domain | exactly the Pages URL |

## Railway (API)

- **Source:** GitHub `francafoiatto/nexora-platform`, branch `main`, with **Wait for CI** (check suites) enabled. A push to
  `main` deploys only after the GitHub Actions checks succeed.
- **Build:** `apps/api/Dockerfile` (context = repository root; installs only the API workspace, generates the Prisma client,
  builds). Service variable `RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile` selects it.
- **Service settings and `railway.json`:** Railway evaluates the [`railway.json`](../railway.json) watch patterns on GitHub
  pushes (a docs-only push was skipped with "No changes to watched files"). The deployment manifest, however, never showed
  the file's other values applied. The effective settings are therefore set on the service itself: health check
  `/api/v1/health` (timeout 120 s), Dockerfile via the variable above, 1 replica. `railway.json` records the intended values.
- **Verified gating:** push `24b8cbb`. The deployment stayed WAITING, CI passed at 15:02:43 UTC, and the deployment
  reached SUCCESS at 15:03:09 UTC.
- **Watch patterns:** every input copied into the API image (`apps/api/**`, `packages/contracts/**`, root
  `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `tsconfig.base.json`, `.dockerignore`) plus
  `railway.json`. Changes elsewhere (web, docs) do not redeploy the API.
- **Migrations:** the container entrypoint ([`apps/api/scripts/start-production.sh`](../apps/api/scripts/start-production.sh))
  runs `prisma migrate deploy` and then `exec`s the API. It only applies pending migrations and never resets data. It is
  idempotent and lock-protected, so it lives in the image rather than in platform settings. The demo seed is **never**
  run in production (the seed also refuses `NODE_ENV=production`).
- **Health check:** `GET /api/v1/health` (200 when the database is reachable, 503 otherwise).
- **Database network:** PostgreSQL is reachable only on Railway's private network (no public TCP proxy).
- **Replicas:** 1. See the limitations below.
- **Shutdown:** SIGTERM triggers Nest shutdown hooks (HTTP server and Prisma disconnect); verified to exit 0.

Forbidden against the production database: `prisma migrate reset`, `prisma db push`, running the seed.

## Cloudflare Pages (web)

The project uses **Direct Upload** (not the Cloudflare Git integration). The bundle is built from a CI-green commit and
uploaded with the commit recorded:

```bash
git checkout <ci-green-sha>                     # clean working tree
VITE_API_URL=https://api-production-547f.up.railway.app/api/v1 pnpm --filter @nexora/web build
wrangler pages deploy apps/web/dist --project-name nexora-platform --branch main \
  --commit-hash <ci-green-sha> --commit-dirty=false
```

| Setting | Value |
| --- | --- |
| Project / production branch | `nexora-platform` / `main` |
| Build | `pnpm --filter @nexora/web build` (`tsc --noEmit && vite build`) from the repository root |
| Output directory | `apps/web/dist` |
| Public build variable | `VITE_API_URL` (Socket.IO uses its origin; no server secrets in the bundle) |
| SPA routing | `_redirects` (`/* /index.html 200`) generated by the build; deep links return 200 |
| Headers | `_headers` generated by the build (CSP with `connect-src` limited to the API over https/wss, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`) |

The API's `CORS_ORIGINS` is exactly `https://nexora-platform-dwy.pages.dev`. Preview deployments
(`<hash>.nexora-platform-dwy.pages.dev`) are intentionally **not** allowed by the API.

## Production verification (2026-09-30)

Run against the live URLs with synthetic users, all passing:

- **Smoke:** register → `/me` → workspace → project → task → edit → status → reload → logout → login → data persisted.
- **Realtime:** a second member received `task.created`, `task.updated`, `task.deleted` and `activity.created` over
  `wss://api-production-547f.up.railway.app/socket.io/`.
- **Isolation:** an outsider got 404 for workspace/project/task reads and writes and for adding itself as a member.
  Assigning A's task to the outsider returned `400 ASSIGNEE_NOT_MEMBER`. The socket join was refused (`NOT_FOUND`) and
  an unauthenticated socket was rejected.
- **CORS:** only the Pages origin receives `Access-Control-Allow-Origin` (HTTP and Socket.IO); arbitrary, preview,
  localhost and placeholder origins do not.
- **HTTPS:** TLS 1.3 on both domains; HTTP redirects to HTTPS.
- **UI:** 375 / 768 / 1024 / 1440 px with no horizontal overflow, keyboard skip link and dialog focus working, no console errors.
- **Logs:** no errors or restarts, no secrets. Warnings are only the expected 4xx responses and denied room joins.

Synthetic data left in production (the API has no user/workspace deletion): users `nexora-smoke-{a,b,c}-muoat4b9@example.test`
and workspace `SMOKE-muoat4b9 Workspace A` with its memberships and activity. Its project and tasks were deleted.

## Open items

- The Cloudflare GitHub App is installed on the repository but not used (Direct Upload), so it leaves a check suite in
  `queued` on every commit. It does not block Railway. Remove its repository access, or adopt the Cloudflare Git integration.
- Browsers do not apply CORS to the WebSocket upgrade. Today the socket is protected by the mandatory JWT on the handshake
  and the membership check on room joins. Rejecting non-allow-listed `Origin` headers at upgrade time would add defence in depth.

## Decisions

- **Swagger (`/api/docs`) is public.** It documents only the public contract; every data endpoint still requires a
  bearer token, there are no administrative endpoints, and no secrets appear in the document.
- **Single API instance.** Rate limiting (`@nestjs/throttler`) and Socket.IO rooms are in memory. That is correct with
  exactly one replica, but scaling out requires a shared store (e.g. Redis) and the Socket.IO Redis adapter.
- **Access token in `localStorage`** (known limitation, see `docs/security.md`). It is mitigated by a strict CSP (no inline
  scripts, `connect-src` limited to the API), React escaping, and no `dangerouslySetInnerHTML`.
