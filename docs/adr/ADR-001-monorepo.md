# ADR-000: Monorepo

## Context
Nexora V1 needs a coherent candidate foundation.

## Decision
Use pnpm workspaces for web, api and shared contracts.

## Alternatives
Separate repositories.

## Consequences
Simpler local coordination; CI must understand workspace boundaries.
