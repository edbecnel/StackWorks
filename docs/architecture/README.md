# StackWorks Architecture Documentation

Status: Implemented  
Confidence: High

## Purpose

These architecture docs are living technical documentation for the current StackWorks codebase.

Primary goals:

- Help developers understand the system at multiple levels.
- Make code locations discoverable quickly.
- Support troubleshooting and safe feature work.
- Keep CURRENT behavior separate from PLANNED intent.

Scope boundaries:

- Source of truth is code in `src/`, `server/src/`, `stockfish-server/`, build config, and test coverage.
- Product strategy docs are only used as directional context when clearly aligned with code.

## Reading Order

1. [01-system-overview.md](./01-system-overview.md)
2. [02-context-view.md](./02-context-view.md)
3. [03-container-view-current.md](./03-container-view-current.md)
4. [04-container-view-target.md](./04-container-view-target.md)
5. [05-client-architecture-current.md](./05-client-architecture-current.md)
6. [06-client-architecture-target.md](./06-client-architecture-target.md)
7. [07-server-architecture-current.md](./07-server-architecture-current.md)
8. [08-auth-security-roadmap.md](./08-auth-security-roadmap.md)
9. [09-shared-domain-and-contracts.md](./09-shared-domain-and-contracts.md)
10. [10-runtime-flows.md](./10-runtime-flows.md)
11. [11-code-map.md](./11-code-map.md)
12. [12-refactor-hotspots.md](./12-refactor-hotspots.md)
13. [13-risks-tech-debt-and-gaps.md](./13-risks-tech-debt-and-gaps.md)
14. [14-variant-delta-matrix.md](./14-variant-delta-matrix.md)
15. [15-api-surface-current.md](./15-api-surface-current.md)
16. [Reviewer checklist template](./templates/architecture-doc-review-checklist.md)
17. ADR index — [ADR-0001: Living Documentation Baseline](./adr/ADR-0001-documentation-baseline.md), [ADR-0002: Server-Authoritative Online State](./adr/ADR-0002-server-authoritative-online-state.md), [ADR-0003: Multi-Entry Client With Shell Migration](./adr/ADR-0003-multi-entry-client-with-shell-migration.md), [ADR-0004: Shared Rules Engine Across Client and Server](./adr/ADR-0004-shared-rules-engine-across-client-and-server.md)

## Status Legend

- Status: Implemented
- Status: In Progress
- Status: Planned
- Status: Deferred
- Status: Unknown

Usage rule:

- Each major area should explicitly declare one status.
- If mixed, split the area into sub-sections instead of averaging statuses.

## Confidence Legend

- Confidence: High
- Confidence: Medium
- Confidence: Low

Confidence guidance:

- High: verified directly in code paths and/or tests.
- Medium: inferred from multiple code hints but not fully explicit.
- Low: directionally suggested by naming/docs/comments only.

## Living Documentation Rules

Status: Implemented  
Confidence: High

1. Update docs in the same PR when architecture-relevant code changes.
2. Prefer concrete file paths over abstract descriptions.
3. Keep CURRENT and TARGET in separate sections/files.
4. Mark uncertain statements as Status: Unknown with TODO owner.
5. Link runtime behavior to tests where available.
6. Avoid prose-only claims without code anchors.

## How To Use During Refactoring

Status: Implemented  
Confidence: High

1. Start in [11-code-map.md](./11-code-map.md) to find the real code entry points.
2. Check [12-refactor-hotspots.md](./12-refactor-hotspots.md) to identify transitional seams.
3. Validate assumptions against [05-client-architecture-current.md](./05-client-architecture-current.md) and [07-server-architecture-current.md](./07-server-architecture-current.md).
4. If a planned direction is needed, consult [04-container-view-target.md](./04-container-view-target.md) and [06-client-architecture-target.md](./06-client-architecture-target.md).
5. For risk-sensitive changes, review [08-auth-security-roadmap.md](./08-auth-security-roadmap.md) and [13-risks-tech-debt-and-gaps.md](./13-risks-tech-debt-and-gaps.md).

## Documentation Maintenance Checklist

- [ ] Every major subsystem includes: Responsibility, Status, Confidence, Key files/folders, Inputs, Outputs, Dependencies, Common modification points.
- [ ] New endpoints/events/types are reflected in docs.
- [ ] New refactor seams are added to hotspot/risk docs.
- [ ] ADR stubs are created for major irreversible decisions.
- [ ] Unknowns have TODO markers.
