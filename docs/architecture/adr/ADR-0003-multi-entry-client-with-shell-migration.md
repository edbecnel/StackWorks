# ADR-0003: Preserve Multi-entry Client While Migrating UX Shell

- Status: Accepted
- Date: 2026-04-01
- Confidence: High

## Context

The project uses multiple HTML entry pages for variants and is undergoing UX shell refactoring.

## Decision

Maintain multi-entry Vite architecture while incrementally introducing shell-first UX:

- Keep per-game entry pages.
- Reuse shared modules for game/render/controller/UI.
- Use temporary compatibility layers where needed during migration.

## Evidence

- `vite.config.ts` multi-entry configuration.
- `src/*Main.ts` variant entry modules.
- `src/ui/shell/*` and `docs/refactor-ui-shell.md`.

## Consequences

- Reduces migration risk and preserves existing runtime behavior.
- Requires careful parity work to retire legacy UI pathways.
