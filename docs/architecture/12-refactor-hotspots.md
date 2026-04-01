# 12 - Refactor Hotspots

Status: In Progress  
Confidence: High

Related:

- [05-client-architecture-current.md](./05-client-architecture-current.md)
- [06-client-architecture-target.md](./06-client-architecture-target.md)
- [11-code-map.md](./11-code-map.md)
- [13-risks-tech-debt-and-gaps.md](./13-risks-tech-debt-and-gaps.md)

## Hotspot 1: Legacy UI vs Shell UI Coexistence

- Responsibility:
  - Transitional compatibility while migrating to shell-first UX.
- Status: In Progress
- Confidence: High
- Key files/folders:
  - `src/ui/shell/gameShell.ts`
  - `src/ui/panelLayoutMode.ts`
  - `docs/refactor-ui-shell.md`
- Inputs:
  - Panel mode, viewport mode, shell state.
- Outputs:
  - Either legacy panel pair or shell panel pair pathways.
- Dependencies:
  - Existing page panel sections and controls.
- Common modification points:
  - Desktop panel mode toggles and compact menu behavior.
- Temporary adapters/compat layers:
  - `stackworks.gameShell.desktopPanelMode` and env-based hiding options.
- Follow-up docs needed:
  - TODO: define explicit criteria for removing legacy mode.

## Hotspot 2: Start Page Launcher Logic vs Shell Play Hub

- Responsibility:
  - Bridge existing launcher behavior with evolving shell navigation model.
- Status: In Progress
- Confidence: High
- Key files/folders:
  - `src/indexMain.ts`
  - `src/ui/shell/playHub.ts`
  - `src/config/shellState.ts`
- Inputs:
  - Launch settings, bot settings, online action mode.
- Outputs:
  - URL intents and persisted cross-page state.
- Dependencies:
  - Variant registry, auth session helpers, online resume records.
- Common modification points:
  - LocalStorage keys and action handler wiring.
- Temporary adapters/compat layers:
  - Duplicate state channels (launcher keys + shell state model).
- Follow-up docs needed:
  - TODO: choose canonical ownership per launch/settings state key.

## Hotspot 3: Online Reliability Hardening in Active Evolution

- Responsibility:
  - Keep realtime consistency under disconnect/reorder/concurrency.
- Status: In Progress
- Confidence: High
- Key files/folders:
  - `src/driver/remoteDriver.ts`
  - `server/src/app.ts`
  - `docs/multiplayer-checklist.md`
- Inputs:
  - Realtime transport events and concurrent action requests.
- Outputs:
  - Resync decisions and authoritative snapshots.
- Dependencies:
  - `stateVersion`, room action queue, persistence model.
- Common modification points:
  - CAS checks, burst handling, reconnect watchdog logic.
- Temporary adapters/compat layers:
  - WS/SSE plus snapshot fetch fallback all coexisting.
- Follow-up docs needed:
  - TODO: capture eventual transport support policy when finalized.

## Hotspot 4: Auth/Security Maturity Gap

- Responsibility:
  - Evolve from baseline auth implementation to production-hardening.
- Status: In Progress
- Confidence: Medium
- Key files/folders:
  - `server/src/app.ts`
  - `server/src/auth/sessionStore.ts`
  - `docs/multiplayer-checklist.md`
- Inputs:
  - Auth/session/profile requests.
- Outputs:
  - Account identity and session context.
- Dependencies:
  - File store and runtime memory sessions.
- Common modification points:
  - Session persistence and security policy checks.
- Temporary adapters/compat layers:
  - Cookie + bearer fallback behavior with in-memory server sessions.
- Follow-up docs needed:
  - TODO: document finalized persistent session architecture.

## Hotspot 5: Naming/Structure Drift During Product Repositioning

- Responsibility:
  - Keep code navigable while product language and UX evolve.
- Status: In Progress
- Confidence: Medium
- Key files/folders:
  - Variant/game naming in `src/variants/variantRegistry.ts`
  - Product/strategy docs under `docs/`
- Inputs:
  - Product naming changes and UX goals.
- Outputs:
  - Updated labels/help/start-page text.
- Dependencies:
  - Existing persisted keys and page URLs.
- Common modification points:
  - UI labels and help pages.
- Temporary adapters/compat layers:
  - Alias handling in variant registry.
- Follow-up docs needed:
  - TODO: maintain a naming convention note if more aliases are introduced.
