# ADR-004: Realtime with Socket.IO workspace rooms

- Status: Accepted (revised in v0.2)

## Context

Teammates must see board changes without reloading. V1 emitted task events from the API but the frontend never connected.

## Decision

- Socket.IO in the API process; one room per workspace (`workspace:{id}`).
- Handshake authenticated with the access token; joining a room requires a membership check.
- The server emits after the database commit; clients merge events into the TanStack Query cache idempotently (upsert
  by id, ignore stale `updatedAt`) and refetch after reconnecting.
- Events: `task.created|updated|deleted`, `project.created|updated|deleted`, `activity.created`.

## Alternatives

- Polling — simpler, but laggy and wasteful.
- Server-Sent Events — would work for server→client only; Socket.IO gives acks for the join handshake and fallbacks.
- A message broker — unnecessary for a single API instance.

## Consequences

- Horizontal scaling will need the Socket.IO Redis adapter (or sticky sessions + adapter). Not needed for v0.2.
- Events are not replayed; the reconnect refetch covers gaps.
