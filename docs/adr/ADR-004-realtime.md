# ADR-003: Realtime

## Context
Nexora V1 needs a coherent candidate foundation.

## Decision
Use Socket.IO rooms scoped to authenticated workspaces.

## Alternatives
Polling or broker infrastructure.

## Consequences
Low operational complexity; membership checks are mandatory.
