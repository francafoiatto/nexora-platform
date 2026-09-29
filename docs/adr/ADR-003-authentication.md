# ADR-002: Authentication

## Context
Nexora V1 needs a coherent candidate foundation.

## Decision
Use short-lived JWT access tokens and bcrypt password hashing for V1.

## Alternatives
OAuth or sessions.

## Consequences
Simple local flow; refresh-token rotation is future hardening.
