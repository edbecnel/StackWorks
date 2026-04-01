# Architecture Documentation PR Review Checklist

Status: Implemented  
Confidence: High

Use this checklist for PRs that change architecture-significant code or docs.

## Quick Scope Gate

- [ ] This PR changes architecture-significant code OR architecture docs.
- [ ] Changed areas are identified (client, server, shared contracts, runtime flows, auth/security, refactor seams).

## Living-Documentation Core Checks

- [ ] CURRENT vs TARGET state is clearly separated where relevant.
- [ ] Status markers are updated where behavior/state changed.
- [ ] Confidence markers are updated for inferred/uncertain statements.
- [ ] File/path references in docs were spot-checked and still resolve.

## Required Doc Sync Checks

- [ ] Runtime behavior changed: [docs/architecture/10-runtime-flows.md](../10-runtime-flows.md) updated.
- [ ] Files/modules moved/renamed: [docs/architecture/11-code-map.md](../11-code-map.md) updated.
- [ ] Refactor seam changed: [docs/architecture/12-refactor-hotspots.md](../12-refactor-hotspots.md) updated.
- [ ] Auth/security related code changed: [docs/architecture/08-auth-security-roadmap.md](../08-auth-security-roadmap.md) updated.

## ADR Decision Check

- [ ] ADR required: change introduces or reverses a significant architectural decision.
- [ ] ADR not required: change is implementation-level within existing decisions.
- [ ] If ADR required, add/update file under [docs/architecture/adr/](../adr/).

## API / Contracts Check (if applicable)

- [ ] Shared contracts changed (`src/shared/*`): corresponding architecture docs updated.
- [ ] Stable API surface changed: [docs/architecture/15-api-surface-current.md](../15-api-surface-current.md) updated.
- [ ] If unstable/experimental endpoints changed, docs explicitly mark omission or uncertainty.

## Variant Impact Check (if applicable)

- [ ] Variant-specific architecture changed: [docs/architecture/14-variant-delta-matrix.md](../14-variant-delta-matrix.md) updated.
- [ ] Duplication/override changes are called out and justified.

## Final Reviewer Decision

- [ ] Approved: docs align with code changes.
- [ ] Changes requested: missing doc updates listed in review comments.
