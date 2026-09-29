# API and realtime reference

The interactive OpenAPI documentation is served at **`/api/docs`** (JSON: `/api/docs-json`) when `SWAGGER_ENABLED` is on
(default outside production). This page summarizes conventions and the realtime protocol, which OpenAPI does not cover.

Base path: `/api/v1`. All endpoints except `auth/register`, `auth/login` and `health` require `Authorization: Bearer <accessToken>`.

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/register` | `{ name, email, password }` → `201 { accessToken, expiresIn, user }`; `409 EMAIL_TAKEN` |
| POST | `/auth/login` | `{ email, password }` → `200 { accessToken, expiresIn, user }`; `401 INVALID_CREDENTIALS` |
| GET | `/auth/me` | Current user |
| GET | `/health` | `{ status, database, uptimeSeconds }`; `503` when the database is down |
| GET / POST | `/workspaces` | List mine (with my role) / create (creator becomes OWNER) |
| GET / PATCH | `/workspaces/:workspaceId` | Get / rename (OWNER) |
| GET | `/workspaces/:workspaceId/summary` | Dashboard metrics across all projects |
| GET / POST | `/workspaces/:workspaceId/members` | List / add an existing account by email (OWNER) |
| GET | `/workspaces/:workspaceId/activities?limit&cursor` | Newest first; `{ items, nextCursor }` |
| GET / POST | `/workspaces/:workspaceId/projects` | List (with `taskCounts`) / create |
| GET / PATCH / DELETE | `/projects/:projectId` | Delete is OWNER-only and cascades tasks (`204`) |
| GET / POST | `/projects/:projectId/tasks` | List (newest first, ≤ 500) / create |
| GET / PATCH / DELETE | `/tasks/:taskId` | Partial update; `null` clears `description`, `assigneeId`, `dueDate` |

## Errors

```json
{
  "statusCode": 400,
  "code": "ASSIGNEE_NOT_MEMBER",
  "message": "Assignee must be a member of this workspace",
  "details": [{ "field": "assigneeId", "message": "Assignee must be a member of this workspace" }],
  "requestId": "6f1c2b1e-4a3d-4c1b-9a51-2f5a3e0c9b7d"
}
```

| Code | Status | When |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Body/query/param validation; `details[]` lists fields |
| `ASSIGNEE_NOT_MEMBER` | 400 | Assignee is not a member of the task's workspace |
| `UNAUTHORIZED` | 401 | Missing/invalid/expired token |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `FORBIDDEN` | 403 | Member attempting an owner-only action |
| `NOT_FOUND` | 404 | Missing resource **or** not a member (indistinguishable by design) |
| `EMAIL_TAKEN` / `CONFLICT` | 409 | Duplicate email / already a member |
| `RATE_LIMITED` | 429 | Too many login/register attempts |
| `INTERNAL_ERROR` | 500 | Unexpected error (details are logged, never returned) |

Every response carries `X-Request-Id` (a valid incoming one is reused), which also appears in server logs.

## Realtime (Socket.IO)

Connect to the API origin (path `/socket.io`) with the access token:

```ts
const socket = io(API_ORIGIN, { auth: { token: accessToken } });
socket.emit('workspace.join', { workspaceId }, (ack) => {
  // ack: { ok: true } | { ok: false, code: 'VALIDATION_ERROR' | 'NOT_FOUND' }
});
```

Connections without a valid token fail with `connect_error` (`UNAUTHORIZED`). Joining requires membership.

Server → client events (all payloads include `workspaceId`):

| Event | Payload |
| --- | --- |
| `task.created` / `task.updated` | `{ projectId, task }` (same shape as the REST `TaskDto`) |
| `task.deleted` | `{ projectId, taskId }` |
| `project.created` / `project.updated` | `{ project }` |
| `project.deleted` | `{ projectId }` |
| `activity.created` | `{ activity }` |

Events are emitted only after the database transaction commits. The author of a change also receives it; clients should
upsert by id. After reconnecting, clients should refetch, as events are not replayed.

## Activity actions

`workspace.created`, `workspace.updated`, `member.added`, `project.created`, `project.updated`, `project.deleted`,
`task.created`, `task.updated` (`metadata.changes` lists fields), `task.status_changed` (`metadata.from`/`to`), `task.deleted`.
No-op updates record nothing.
