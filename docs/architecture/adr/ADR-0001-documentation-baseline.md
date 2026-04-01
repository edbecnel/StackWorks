# ADR-0001: Living Architecture Documentation Baseline

- Status: Accepted
- Date: 2026-04-01
- Decision Drivers:
  - Fast-evolving architecture (UI shell migration, auth/security maturation, online hardening).
  - Need to reduce onboarding/debugging time in a multi-entry client + authoritative server codebase.
  - Need to prevent ambiguity between implemented behavior and target direction.

## Context

StackWorks has active refactors and incomplete production-oriented concerns. Static one-time architecture docs become stale quickly and can mislead changes.

## Decision

1. Use living architecture documentation under `docs/architecture/`.
2. Explicitly separate CURRENT/IMPLEMENTED from TARGET/PLANNED views.
3. Require status markers in major sections:
   - Status: Implemented
   - Status: In Progress
   - Status: Planned
   - Status: Deferred
   - Status: Unknown
4. Use confidence markers where claims are inferential:
   - Confidence: High / Medium / Low
5. Treat source-code mapping as first-class documentation (see `11-code-map.md`).
6. Require concrete file references for responsibilities and modification points.

## Consequences

### Positive

- Faster, safer changes with less guesswork.
- Lower risk of mixing target intent with current runtime reality.
- Better troubleshooting through code-path mapping.

### Trade-offs

- Docs require continuous maintenance effort.
- Some sections will intentionally contain Unknown/TODO markers until confirmed.

## Implementation Notes

- Update architecture docs in the same PR when architecture-affecting code changes.
- Add ADR stubs for major architecture decisions visible in codebase evolution.
