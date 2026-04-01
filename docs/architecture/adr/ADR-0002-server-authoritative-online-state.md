# ADR-0002: Server-Authoritative Online State

- Status: Accepted
- Date: 2026-04-01
- Confidence: High

## Context

Online play requires consistent game state across clients under reconnects, disconnects, and concurrent actions.

## Decision

Use server-authoritative room state with:

- Client intent submission (not client state authority).
- Monotonic `stateVersion` for stale/gap detection.
- Per-room action serialization.
- Full-snapshot realtime updates (WS preferred, SSE fallback).
- Snapshot fetch resync path.

## Evidence

- `server/src/app.ts`
- `src/driver/remoteDriver.ts`
- `src/shared/onlineProtocol.ts`
- `docs/multiplayer-checklist.md`

## Consequences

- Improves consistency and anti-cheat baseline.
- Increases server orchestration complexity and transport test surface.
