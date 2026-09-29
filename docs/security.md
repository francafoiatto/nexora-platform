# Security model

## Trust boundaries

- The browser is untrusted. Every identifier it sends (workspace, project, task, assignee) is re-resolved on the server.
- The API authorizes every request; the database is only reachable by the API (locally bound to `127.0.0.1`).

## Authentication

- Passwords: bcrypt, cost 12 (`bcryptjs`). Length 8–72 (bcrypt's input limit). Hashes are never selected into responses
  (all user reads use an explicit `select` of `id, name, email`).
- Login returns the same `401 INVALID_CREDENTIALS` for unknown email and wrong password, and compares against a dummy
  hash when the email is unknown to reduce timing differences.
- Emails are trimmed and lower-cased; uniqueness is enforced by the database.
- Access tokens: JWT HS256, `sub` = user id, default lifetime 2h (`JWT_EXPIRES_IN`). Verification pins the algorithm
  (`alg: none` and foreign-key tokens are rejected — covered by tests) and reloads the user, so tokens of deleted users stop working.
- `/auth/login` and `/auth/register` are rate-limited (default 10/min per client → `429 RATE_LIMITED`).

### JWT secret policy

There is **no default secret**. The API refuses to start unless `JWT_SECRET` is set, at least 32 characters long, and not
a known placeholder (e.g. the V1 fallback `local-only-secret`). The same fail-fast validation covers `DATABASE_URL`,
`PORT`, `JWT_EXPIRES_IN` and `NODE_ENV` (`apps/api/src/config/env.ts`, unit-tested).

### Token storage (known trade-off)

The SPA keeps the access token in `localStorage` so sessions survive reloads and the same token can authenticate the
socket handshake. This exposes the token to any script injected into the page (XSS). Mitigations in place: React escapes
all rendered content, no `dangerouslySetInnerHTML`, no third-party scripts at runtime (fonts are self-hosted), short token
lifetime. Planned hardening: httpOnly refresh-token cookie + in-memory access token (see the final report).

## Authorization (tenant isolation)

All checks live in `AccessService` (`apps/api/src/workspaces/access.service.ts`):

| Resource | Resolution |
| --- | --- |
| Workspace | `WorkspaceMember(workspaceId, userId)` must exist |
| Project | `project.workspace.members` contains the user (single query) |
| Task | `task.project.workspace.members` contains the user (single query) |
| Assignee | `WorkspaceMember(task's workspaceId, assigneeId)` must exist — checked inside the write transaction |

- Non-members receive **404 NOT_FOUND** (not 403), so other tenants' IDs cannot be probed.
- Role checks: only `OWNER` can rename a workspace, add members, or delete projects (**403 FORBIDDEN** for members).
- Invalid UUIDs are rejected with `400` by `ParseUUIDPipe` before reaching the database.
- Unknown body properties are rejected (`forbidNonWhitelisted`), so fields such as `role` or `createdById` cannot be injected.

The integration suite `apps/api/test/isolation.int-spec.ts` proves the matrix: User B gets 404 for every read and write
on Workspace A / Project A / Task A, Workspace A is unchanged afterwards, and assigning Task A to User B fails with
`ASSIGNEE_NOT_MEMBER` until B is added to Workspace A. Mutation-testing the checks (removing them) makes these tests fail.

## Realtime

- The Socket.IO handshake is authenticated with the same JWT (`auth: { token }`); invalid tokens are rejected before `connection`.
- `workspace.join` checks membership on the server; denied joins return `{ ok: false, code: 'NOT_FOUND' }` and do not subscribe.
- Clients cannot broadcast: the gateway has no client→room relay; only the server emits after committed writes.
- Socket CORS uses the same allow-list as HTTP.

## Transport & headers

- CORS: explicit allow-list (`CORS_ORIGINS`), `*` rejected, required in production. Bearer tokens (no cookies), so `credentials: false`.
- `helmet` sets `nosniff`, frame, referrer and HSTS headers and removes `X-Powered-By`. CSP is disabled on the JSON API; the SPA's
  CSP belongs to the static host that serves it.

## Errors & logging

- Every error uses one envelope: `{ statusCode, code, message, details[], requestId }`. Unknown errors become
  `500 INTERNAL_ERROR` with a generic message; stack traces are logged server-side only.
- Request logs contain method, path (no query string), status, duration and request id — never headers, bodies, tokens or passwords.
- `LOG_FORMAT=json` emits one JSON object per line.

## Demo data

The seed creates fictional users on the non-routable `.local` domain with the published password `demo-password`, and
refuses to run with `NODE_ENV=production`.
