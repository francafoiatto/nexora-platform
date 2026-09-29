# ADR-005: Frontend architecture and design system

- Status: Accepted (revised in v0.2)

## Context

V1 rendered the whole application from `main.tsx`: TanStack Router, React Hook Form, Zod and Socket.IO were installed
but unused, navigation and several buttons were decorative, and the user name was hardcoded.

## Decision

- **TanStack Router** (code-based route tree) with guards for authenticated and guest-only routes.
- **Feature folders**: each domain owns `api.ts` (requests + TanStack Query hooks) and its screens; components never import axios.
- **React Hook Form + Zod** (schemas from `@nexora/contracts`); server `details[]` are mapped onto fields.
- **Design system**: a small token-based CSS (`styles/global.css`) and primitives (`Button`, `Field`, `Dialog`, `States`),
  keeping V1's visual identity (dark surfaces, violet accent, DM Sans / Space Grotesk — now self-hosted).
- Native `<dialog>` for modals (focus containment, Escape, inert background); `lucide-react` icons.
- Every visible control does something; decorative controls were removed.

## Alternatives

- A component library (MUI, Chakra) — heavier, and would replace the existing identity.
- File-based routing — adds a code generator; the route tree is small.

## Consequences

- Accessibility is tested: RTL tests use roles/labels, and Playwright runs an axe WCAG 2.1 AA audit on every screen.
- Styling is plain CSS; if the surface grows, consider CSS modules to scope component styles.
