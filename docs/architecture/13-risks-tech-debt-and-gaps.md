# 13 - Risks, Tech Debt, and Gaps

Confidence: High

Related:

- [07-server-architecture-current.md](./07-server-architecture-current.md)
- [08-auth-security-roadmap.md](./08-auth-security-roadmap.md)
- [11-code-map.md](./11-code-map.md)
- [12-refactor-hotspots.md](./12-refactor-hotspots.md)
- [15-api-surface-current.md](./15-api-surface-current.md)

## Risk Register

### R1: Large Orchestration Modules Become Bottlenecks

- Severity: High
- Confidence: High
- Status: Implemented
- Area:
  - `server/src/app.ts`
  - Large variant entry modules such as `src/indexMain.ts`, `src/chessMain.ts`, `src/damaMain.ts`
- Risk:
  - Mixed responsibilities increase change blast radius and regression risk.
- Signals:
  - Many concerns in single files (routing, auth, realtime, persistence wiring, UI bootstrapping).
- Recommendation:
  - Incremental extraction by concern (transport/auth/persistence helpers; launcher modules).

### R2: Transitional UI Paths Increase Divergence Risk

- Severity: High
- Confidence: High
- Status: In Progress
- Area:
  - `src/ui/shell/gameShell.ts`
  - `src/ui/panelLayoutMode.ts`
- Risk:
  - Legacy and shell modes can drift in behavior/feature parity.
- Recommendation:
  - Add parity checklist tests and explicit removal gate criteria.

### R3: Session Volatility and Auth Hardening Gap

- Severity: High
- Confidence: High
- Status: In Progress
- Area:
  - `server/src/auth/sessionStore.ts`
  - `server/src/app.ts`
- Risk:
  - In-memory sessions are lost on restart; some hardening items still open.
- Recommendation:
  - Move sessions to durable store and broaden endpoint-level abuse controls.

### R4: LocalStorage Key Proliferation and State Fragmentation

- Severity: Medium
- Confidence: Medium
- Status: In Progress
- Area:
  - `src/indexMain.ts`
  - `src/*Main.ts`
  - `src/config/shellState.ts`
- Risk:
  - Difficult migrations and inconsistent behavior across variants/pages.
- Recommendation:
  - Introduce documented key ownership conventions and migration utilities.

### R5: Transport Complexity (WS/SSE/Polling) Increases Edge-case Surface

- Severity: Medium
- Confidence: High
- Status: Implemented
- Area:
  - `src/driver/remoteDriver.ts`
  - `server/src/app.ts`
- Risk:
  - More fallback paths increase testing and maintenance burden.
- Recommendation:
  - Keep transport fallback policy explicit and test matrix current.

### R6: Ops/Deployment Coupling To Filesystem and Single-instance Constraints

- Severity: Medium
- Confidence: Medium
- Status: Implemented
- Area:
  - `render.yaml`
  - `README.md` Render notes
- Risk:
  - Persistence and deployment constraints can limit scaling/failover flexibility.
- Recommendation:
  - Document operational runbooks and future migration options if scaling needs increase.

## High Coupling Areas

- `server/src/app.ts` couples HTTP routes, room mutation rules, presence, persistence scheduling, auth, and stockfish routes.
- Variant entry files couple DOM wiring + preference logic + shell + controller initialization.

## Mixed-Responsibility Areas

- `src/indexMain.ts`: launcher state, auth/account UI, lobby interactions, variant navigation.
- `server/src/app.ts`: multiple subsystem boundaries in one file.

## Unfinished Concerns

- Auth/session hardening completion.
- Some shell refactor parity/removal milestones.
- Ops hardening and broader abuse controls.

## Recommendations (Prioritized)

1. Extract server route groups into cohesive modules while preserving existing API contracts.
2. Define shell parity acceptance criteria and lock legacy removal behind tests.
3. Implement durable session backend and document auth security controls.
4. Consolidate launcher/shell state ownership and LS key migration strategy.
5. Keep architecture docs updated alongside refactor PRs.
