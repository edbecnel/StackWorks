# ADR-0004: Shared Rules Engine Across Client and Server

- Status: Accepted
- Date: 2026-04-01
- Confidence: High

## Context

Online authoritative validation and client-side UX both need consistent rule behavior.

## Decision

Use shared TypeScript rules/domain modules (`src/game/*`) on both client and server.

## Evidence

- Server imports from `../../src/game/*` in `server/src/app.ts`.
- Shared serialization and protocol modules under `src/shared/*`.

## Consequences

- Reduces client/server divergence risk.
- Requires disciplined version compatibility and deterministic rule behavior.
