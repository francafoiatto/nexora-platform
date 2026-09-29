# NEXORA — FINAL ENGINEERING REPORT

Date: 2026-09-29 · Scope: V1 intake, audit and correction; Golden Path G0–G7 · Environment: Windows 11, Node 24.15.0,
pnpm 9.15.0, Docker 29.8.0 / Compose 5.5.1, PostgreSQL 16 (container).

## 1. Executive Summary

The V1 candidate compiled, but it **did not work at runtime**: registration and login returned HTTP 500, half of the
project/task routes did not exist, and any `assigneeId` was accepted. It has been rebuilt into a modular, tested
v0.2 on the same stack. Every gate below was validated locally with command output. Nothing was published: no remote,
no push, no deployment.

| Evidence (final run on the committed state) | Result |
| --- | --- |
| `pnpm lint` (ESLint, zero warnings allowed) | exit 0 |
| `pnpm typecheck` | exit 0 |
| `pnpm test`: 138 tests (API 92 incl. 75 integration on real PostgreSQL · web 40 · contracts 6) | exit 0 |
| `pnpm build` (API + web) | exit 0 |
| `pnpm test:e2e --repeat-each=3` (7 specs × 3) | 21 passed |
| Gitleaks on the working tree and the full Git history | only the git-ignored local `apps/api/.env` flagged; history clean |

## 2. Initial V1 Audit

Package: 50 files, 302,111 bytes, no `.git`/`.env`/`node_modules`/build output/logs, no secrets or personal data
(verified by listing, grep and Gitleaks). Safe to import. Runtime findings (reproduced against a live API):

| # | Finding | Evidence | Severity |
| --- | --- | --- | --- |
| 1 | `register`/`login` → 500: `import bcrypt from 'bcryptjs'` compiled to CommonJS without `esModuleInterop` makes `bcrypt` undefined | `TypeError: Cannot read properties of undefined (reading 'hash')` | Critical |
| 2 | `ProjectDetailController`/`TaskDetailController` never registered: no project/task GET/PATCH/DELETE | Nest route map listed 13 routes, none for `/projects/:id` or `/tasks/:id` | Critical |
| 3 | `assigneeId` unvalidated (cross-workspace references; malformed ids reach the DB) | code review + ADR | High |
| 4 | `JWT_SECRET \|\| 'local-only-secret'` silent fallback | `app.module.ts` | High |
| 5 | `start` script pointed to `dist/main.js`; build emitted `dist/src/main.js` | `MODULE_NOT_FOUND` | High |
| 6 | CORS `origin: true` on HTTP and Socket.IO | code | Medium |
| 7 | Postgres published on `0.0.0.0`; `localhost` hit a different IPv6 listener on this machine | Prisma `P1001` | Medium |
| 8 | `migration_lock.toml` missing; redundant slug index; seed duplicated data on every run | `migrate diff` error; 2 runs → 2 projects/8 tasks | Medium |
| 9 | No activity writes, no error model, no logging, duplicate email → 401, PATCH required `title` | code | Medium |
| 10 | "lint" was `tsc`; 3 trivial tests; E2E only checked a heading | package scripts | High (quality) |
| 11 | Frontend in one `main.tsx`; Router/RHF/Zod/Socket.IO unused; decorative buttons; hardcoded user; **login pre-filled with demo credentials** | code | High |
| 12 | Empty `packages/tsconfig` and `packages/eslint-config`; `contracts` unused; ADR headings misnumbered; `LICENSE` without license text | files | Low |

The earlier independent audit's claims were revalidated. All were confirmed, and findings 1, 2, 5, 7 and 8 are new.

## 3. Architecture

pnpm monorepo: `apps/api` (NestJS 10, Prisma 6, Socket.IO), `apps/web` (React 18, Vite 6, TanStack Router/Query,
RHF + Zod), `packages/contracts` (shared enums/schemas/types). Browser → React → HTTP/WSS → NestJS/Socket.IO → Prisma →
PostgreSQL (Docker). No Redis, queues, cloud services or microservices. Details: `docs/architecture/overview.md`, ADR-001…006.

## 4. Changes Made

- Backend rebuilt into modules (`config`, `prisma`, `common`, `auth`, `workspaces` incl. `AccessService`, `projects`,
  `tasks`, `activities`, `realtime`, `health`) with DTOs, a global auth guard, one error envelope, request logging.
- Frontend rebuilt into routes, feature modules, UI primitives and query hooks, keeping V1's visual identity.
- Database: `migration_lock.toml`, incremental `0002_index_hardening`, idempotent and safe seed.
- Tooling: real ESLint, Jest unit + integration projects, Vitest/RTL, Playwright E2E (+ axe), CI workflow, `.gitattributes`.
- Docs: README, architecture, security model, API/realtime reference, revised ADRs, SECURITY.md, screenshots.
- Git: the pristine V1 import, then v0.2, so every change is reviewable as a diff; a third commit records the
  pre-publication identity and license review (§22).

Bugs found and fixed during validation (each now covered by a test):
- Delete-task confirmation was unreachable: the edit dialog's programmatic close was reported back as a user close.
- Revoked token → infinite render loop (heap exhaustion): `<Navigate>` with an inline `search` object re-navigated on every render.
- Keyboard users lost the first keystrokes in dialogs: effect-driven `reset()` ran on the next input event.
- A stale, asynchronously dispatched `close` event could close a dialog reopened right after Escape.
- Skip link lost focus through the router; dates rendered in the browser locale inside an English UI; the board widened
  the page at 1024 px.

## 5. Database

- Schema audited: UUID PKs preserved; FKs and cascades verified (workspace → members/projects/tasks/activity cascade;
  assignee `SET NULL`; creator/actor `RESTRICT`); unique `User.email`, `Workspace.slug`.
- `0002_index_hardening` (generated with `prisma migrate diff` against a shadow DB): drops redundant `Workspace_slug_idx`,
  adds `Task_createdById_idx`, `Activity_actorId_idx`.
- Applied to real PostgreSQL: `0001_init`, `0002_index_hardening` → "All migrations have been successfully applied";
  `migrate status` → "Database schema is up to date". Also applied to `nexora_test` and `nexora_e2e` on every run.
- Seed: fixed demo workspace slug and fictional users. It rebuilds only the demo workspace and refuses `NODE_ENV=production`.
  Two consecutive runs → identical counts (1 workspace, 4 users, 3 projects, 15 tasks, 31 activities).
- With your explicit consent, `prisma migrate reset` was run once on the local dev DB to remove V1 leftovers.

## 6. Security

- bcrypt cost 12; `passwordHash` never selected into responses; unknown-email logins compare against a dummy hash.
- JWT: HS256 pinned, `alg:none`/foreign-key/expired tokens and tokens of deleted users rejected (tests).
- **Config policy:** `JWT_SECRET` required, ≥ 32 chars, placeholders rejected, and the API exits with a readable error.
  Verified: missing secret → exit 1; `local-only-secret` in production → exit 1 (also reports missing `CORS_ORIGINS`).
- CORS allow-list (HTTP + Socket.IO; `*` rejected; required in production), `helmet`, rate-limited credential endpoints
  (429 verified), unknown fields rejected, UUID params validated, generic 500s without stack traces (verified).
- Local DB bound to `127.0.0.1`. Tests and E2E generate a random JWT secret per run.
- Documented trade-off: access token in `localStorage` (see `docs/security.md`).

## 7. Authorization & Isolation

`AccessService` resolves Task → Project → Workspace → Membership server-side; non-members get 404; owner-only actions
get 403. `test/isolation.int-spec.ts` (22 tests): User B is denied (404) every read and write on Workspace A / Project A /
Task A, including renaming, adding themselves as a member, and creating projects/tasks. The DB is unchanged afterwards.
Assigning Task A to User B → `400 ASSIGNEE_NOT_MEMBER` (also on create, for random UUIDs; malformed → 400), and it is
allowed once B joins. **Mutation testing:** removing the assignee check fails 3 tests; removing the membership check fails 9.
Realtime: User A cannot join Workspace B's room (test). UI: Tenant B opening Tenant A's URLs sees "Workspace not found" (E2E).

## 8. Backend

22 REST routes under `/api/v1` + 2 socket messages. Transactions wrap each mutation with its activity; realtime emits
after commit. Consistent error envelope `{statusCode, code, message, details[], requestId}` with codes documented in
`docs/api.md`. Request logs contain method/path/status/duration/request-id only; `LOG_FORMAT=json` for structured output.
Pagination: cursor-based activity feed; task lists bounded (500). Swagger at `/api/docs`: OpenAPI 3.0, 13 paths, 25 schemas,
bearer auth, verified HTTP 200 and asserted in `platform.int-spec.ts`.

## 9. Frontend

TanStack Router routes `/login`, `/register`, `/app`, `/app/:workspaceId`, `…/projects`, `…/projects/:projectId`,
`…/activity`, `…/settings`, with guards and safe post-login redirects. RHF + Zod forms (register, login, workspace create/
rename, add member, project create/edit, task create/edit) map server field errors onto inputs. TanStack Query with
centralized keys, 4xx no-retry policy, cache upserts and invalidation; only status moves are optimistic (with rollback, tested).
No axios in components. Loading, error (with retry) and empty states on every screen.

## 10. UI/UX

V1's dark, violet-accented identity kept and completed: login, register, onboarding, dashboard (workspace-wide metrics,
status distribution, recent activity, project progress), projects, board (quick add, per-column add, full task dialog with
status/priority/assignee/due date/delete), activity (grouped by day, paginated), settings (rename, members). All
decorative controls were removed, and the user's name and role come from the API. Fonts are self-hosted (no third-party requests).

Responsive + accessibility: validated at 375/768/1024/1440 px with zero horizontal page overflow. Mobile uses a top bar and
drawer, with the board snap-scrolling inside its own container. axe-core WCAG 2.1 A/AA audit of login, register, onboarding,
dashboard, projects, board, task dialog, activity and settings: 0 violations (E2E). Keyboard: skip link, focus into
dialogs, Escape and focus restoration, keyboard-only task creation (E2E). Native `<dialog>` for modality. Touch targets
≥ 36 px (40 px on coarse pointers).

## 11. Realtime

Socket handshake authenticated; membership-checked `workspace.join` with ack; events `task.created|updated|deleted`,
`project.*`, `activity.created`. Client: idempotent cache upserts (no duplicates from self-echo), stale-version guard,
workspace filtering, resync after reconnect, and a live-status indicator. Evidence: API realtime integration tests (5), web
hook tests (9), E2E with two browser contexts (create, move, bidirectional edit, delete; no reload, no duplicates) passing
in every repetition.

## 12. Tests

| Suite | Count | Notes |
| --- | --- | --- |
| API unit (Jest) | 17 | config policy, error mapping, slug, contracts↔Prisma enum parity |
| API integration (Jest + PostgreSQL `nexora_test`) | 75 | auth, workspaces, projects, tasks, activity, isolation matrix, realtime, platform |
| Web (Vitest + RTL) | 40 | login/register validation & API errors, guards, board loading/empty/error, create/edit/move/delete, realtime cache, dialog |
| Contracts (Vitest) | 6 | form schemas |

## 13. E2E

Playwright against the built API (port 3100) and the production web bundle (`vite preview`, 5174) on an isolated
`nexora_e2e` DB: golden path (register → workspace → project → task → edit → status → board → quick add → activity →
logout → deep-link → login → persistence → dashboard), delete confirmation, two-context realtime, tenant URL isolation,
axe audit, keyboard, mobile 375 px. Final run: **21/21 passed with `--repeat-each=3`**, plus 10/10 for the keyboard spec alone.

## 14. Validation Evidence

`pnpm install` ✔ · `docker compose up -d` ✔ · healthcheck `healthy` / `pg_isready` accepting ✔ · `prisma generate` ✔ ·
migrations applied (dev/test/e2e) ✔ · seed ×2 idempotent ✔ · lint/typecheck/test/build exit 0 ✔ · E2E 21/21 ✔ ·
`GET /api/v1/health` → `{"status":"ok","database":"up"}` ✔ · Swagger 200 ✔ · browser validation of every screen with zero
console errors ✔ · realtime validated (tests + two-browser E2E) ✔ · responsive at 4 widths ✔ · `pnpm dev` starts both apps ✔.

## 15. CI

`.github/workflows/ci.yml`: `validate` (install → prisma generate → lint → typecheck → test with a PostgreSQL service →
build) and `e2e` (Playwright + Chromium, report artifact on failure); least-privilege permissions, concurrency cancel.
At the time of this report it had **not been executed on GitHub** (publication was out of scope); its steps were
reproduced locally on Node 24 / Windows.

**Update — GitHub CI validation (after this report, following publication on 2026-09-29):**

| | |
| --- | --- |
| GitHub Actions CI | **PASS** |
| Run | [36633167601](https://github.com/francafoiatto/nexora-platform/actions/runs/36633167601) |
| Commit | `09df98b0995bcf5314b9bf65523e696201554db9` |
| Environment | ubuntu-24.04, Node v22.23.2, PostgreSQL 16 service container |
| Unit/Integration | 138 PASS (API 92, web 40, contracts 6) |
| Playwright E2E | 7 PASS |

This first real run confirmed Node 22 / Linux compatibility. No CI correction was needed.

## 16. Documentation

`README.md`, `SECURITY.md`, `docs/architecture/overview.md`, `docs/security.md`, `docs/api.md`, ADR-001…006 (revised),
`docs/history/` (V1 build report and handoff, preserved), `docs/screenshots/` (13 real captures from the running app with
seeded fictional data; reproducible via `apps/web/scripts/capture-screenshots.mjs`).

## 17. Security Audit

- Gitleaks (working tree): 1 finding, `apps/api/.env` (local dev secret) — git-ignored, never committed.
- Gitleaks (staged V1 import and v0.2 commit, then full history): no leaks.
- Tracked files reviewed: only `*.env.example` env files; no build output, logs, reports or test artifacts.
- No personal data, customer data, private URLs, or absolute local paths in tracked files. Screenshots show fictional demo data only.
- Dependencies are from the public npm registry (lockfile integrity hashes).

## 18. Git Status

Local repository only, branch `main`, `git remote -v` → empty, working tree clean. After the pre-publication review (§22)
every commit's author and committer is `Robson França Foiatto <robson@francafoiatto.com>`, set in the repository's local
Git config (the global config is unchanged).

## 19. Known Limitations

- Access token in `localStorage` (XSS exposure), no refresh token and no server-side revocation.
- Rate limiting and Socket.IO rooms are in-memory: a single API instance only.
- Members cannot be removed and roles cannot be changed; no invitations for users without an account; no password reset or email verification.
- Task lists are capped at 500 per project (no per-column pagination); no drag-and-drop (status changes via the card select, keyboard-accessible).
- Dark theme only. The web bundle is 505 kB (159 kB gzip) without route splitting.
- ~~CI not executed on GitHub; Node 22/Linux not exercised locally.~~ Resolved later: GitHub CI passed on Node 22 / ubuntu-24.04 (see §15).

## 20. Technical Debt

Route-level code splitting; refresh-token rotation (httpOnly cookie) and CSP at the web host; Socket.IO Redis adapter and
shared rate-limit store before scaling out; member management (remove, change role); per-column board pagination;
optional `@db.Uuid` column types (ids are UUIDs stored as `text`); type-aware ESLint rules.

## 21. Recommended Next Steps

1. After the human publication review, create the repository and let CI run on GitHub (identity and copyright are settled, §22).
2. Add refresh tokens and a CSP header on the static host before real users.
3. Add member management and invitations.
4. Add route-based code splitting and per-column pagination.
5. Prepare deployment (container image, managed PostgreSQL, `migrate deploy` release step), still per ADR-006.

## 22. Pre-Publication Identity & License Review (2026-09-29)

- **Git identity** (repository-local config only): `Robson França Foiatto <robson@francafoiatto.com>`.
- **History rewrite** (local, never pushed): `git filter-branch --env-filter` changed only the author and committer of both
  existing commits. Trees, messages, order and dates are identical (verified), and only the hashes changed:
  `f0c9852 → 47956c6` (V1 import), `2c78636 → b2c3dbf` (v0.2). The `refs/original` backup and the reflog were removed and
  unreachable objects pruned, so the old commit objects no longer exist locally. This review is recorded in a third commit.
- **Legacy identity**: the previous author email existed only in commit metadata. After the rewrite it is absent from all
  files, current and historical, and from all commit metadata.
- **Copyright**: `LICENSE` → `Copyright (c) 2026 Robson França Foiatto`; the MIT text is unchanged. The V1 import commit keeps
  V1's original `LICENSE` as part of the unmodified V1 snapshot. No package manifest has an author field.
- **Re-validation after the rewrite**: `pnpm lint` → 0, `pnpm typecheck` → 0, `pnpm test` → 0 (138 tests: API 92, web 40,
  contracts 6), `pnpm build` → 0. **E2E was not re-run**: only `LICENSE` and this report changed, and neither is
  functional. The E2E results in §13 are from the earlier run.
- **Gitleaks after the rewrite**: full history and current tree scanned, no leaks.

---

## Gate Matrix

| Gate | Result | Evidence |
| --- | --- | --- |
| G0 Foundation | **PASS** | install, Docker healthy, migrations + lock, env policy, real lint, CI config, `.gitattributes` |
| G1 Identity | **PASS** | auth integration tests (register/login/me/invalid/duplicate/expired/alg:none/deleted user/429) |
| G2 Workspaces | **PASS** | workspace tests, roles 403, members, summary, isolation matrix |
| G3 Projects & Tasks | **PASS** | CRUD + validation + activity tests; assignee rule; mutation-tested |
| G4 Frontend | **PASS** | 40 web tests, E2E golden path, browser validation, 4 widths, axe 0 violations |
| G5 Realtime | **PASS** | gateway tests, hook tests, two-browser E2E |
| G6 Quality | **PASS** | 138 tests + 21/21 E2E, lint 0 warnings, typecheck, build |
| G7 Public Release Readiness | **PASS** | security audit clean, docs, license, SECURITY.md, CI config, no remote. See the caveats in §15, §18 and §19 |

## Publication State

REPOSITORY PUBLISHED = NO
GIT REMOTE CONFIGURED = NO
REMOTE PUSH PERFORMED = NO
DEPLOYMENT PERFORMED = NO

## Final Verdict

PUBLIC RELEASE READY = PASS

The code, tests and documentation are ready to publish, with the documented limitations. The Git identity and copyright
holder were settled in the pre-publication review (§22).
