# 05 - Client Architecture (Current)

Status: Implemented  
Confidence: High

Related:

- [03-container-view-current.md](./03-container-view-current.md)
- [06-client-architecture-target.md](./06-client-architecture-target.md)
- [10-runtime-flows.md](./10-runtime-flows.md)
- [11-code-map.md](./11-code-map.md)
- [14-variant-delta-matrix.md](./14-variant-delta-matrix.md)

## Client Subsystems

### Start Page / Launcher Surface

- Responsibility: Variant selection, mode selection (local/online), account/profile UI entry, lobby actions, launch parameter persistence.
- Status: Implemented
- Confidence: High
- Key files/folders:
  - `src/index.html`
  - `src/indexMain.ts`
  - `src/ui/shell/appShell.ts`
- Inputs:
  - User launcher choices, stored prefs, auth state.
- Outputs:
  - Query-param launch URLs and persisted launcher/session state.
- Dependencies:
  - `src/variants/variantRegistry.ts`, `src/shared/*`.
- Common modification points:
  - Start-page event handlers and launch flow logic in `src/indexMain.ts`.

### Variant Page Runtimes

- Responsibility: Each game page boots board/UI/controller/driver for a specific variant family.
- Status: Implemented
- Confidence: High
- Key files/folders:
  - `src/main.ts` (Lasca classic)
  - `src/chessMain.ts`
  - `src/columnsChessMain.ts`
  - `src/damaMain.ts`
  - `src/damascaMain.ts`
  - `src/columnsDraughtsMain.ts`
  - `src/lasca8x8Main.ts`
- Inputs:
  - DOM content loaded event, URL launch mode, local preferences.
- Outputs:
  - Initialized game state and interactive UI.
- Dependencies:
  - Shared game/controller/render modules.
- Common modification points:
  - Per-variant LS key logic and shell/nav binding.

### Domain + Rules Runtime (Client Side)

- Responsibility: State transitions, move application, history/notation, game-over checks.
- Status: Implemented
- Confidence: High
- Key files/folders:
  - `src/game/*`
  - `src/chessMoveHistoryNotation.ts`
  - `src/chessPgnAnnotations.ts`
- Inputs:
  - Move intents and turn/lifecycle actions.
- Outputs:
  - Next game state/history and notations.
- Dependencies:
  - Variant metadata and shared types.
- Common modification points:
  - Rule-specific modules under `src/game/`.

### Rendering + Interaction Layer

- Responsibility: SVG board rendering, highlights, board viewport/flip, touch/drag, overlays.
- Status: Implemented
- Confidence: High
- Key files/folders:
  - `src/render/*`
  - `src/ui/holdDrag.ts`
  - `src/ui/boardViewportMode.ts`
  - `src/ui/panelLayoutMode.ts`
- Inputs:
  - Current game state, pointer/touch events, preference toggles.
- Outputs:
  - Rendered board visuals and interaction feedback.
- Dependencies:
  - Theme manager and controller.
- Common modification points:
  - `renderGameState.ts`, highlight styles, viewport mode controls.

### Driver and Network Access Layer

- Responsibility: Switch local vs remote mode; handle online API + realtime + resync.
- Status: Implemented
- Confidence: High
- Key files/folders:
  - `src/driver/createDriver.ts`
  - `src/driver/localDriver.ts`
  - `src/driver/remoteDriver.ts`
  - `src/shared/onlineProtocol.ts`
- Inputs:
  - URL/search params and game actions from controller.
- Outputs:
  - Local state commits or remote authoritative updates.
- Dependencies:
  - Server API contract and wire serialization.
- Common modification points:
  - Online connect/reconnect/resync logic in `remoteDriver.ts`.

### UI Shell and Transitional Layout Layer

- Responsibility: App/game shell navigation, panel pairing, compact menu mode, legacy coexistence handling.
- Status: In Progress
- Confidence: High
- Key files/folders:
  - `src/ui/shell/gameShell.ts`
  - `src/ui/shell/appShell.ts`
  - `src/ui/shell/playHub.ts`
  - `src/config/shellState.ts`
  - `docs/refactor-ui-shell.md`
- Inputs:
  - Shell state, panel layout settings, route context.
- Outputs:
  - Shell overlays/nav and panel composition decisions.
- Dependencies:
  - Existing page-side panel DOM.
- Common modification points:
  - Desktop panel mode, compact overlay behavior, play hub actions.

## Routing / Navigation Approach (Current)

- Status: Implemented
- Confidence: High
- Multi-page HTML entry model (not SPA), configured in `vite.config.ts` rollup inputs.
- Start page routes to variant pages through URL params and launcher intent storage.
- Variant pages parse mode and online params to initialize local or remote drivers.

## State Management Approach (Current)

- Status: Implemented
- Confidence: High
- Primary state is module-local runtime state in controllers/drivers, not a global Redux-like store.
- Persistence is mostly localStorage key/value by feature and variant.
- Shell state is persisted separately in `stackworks.shell.state` (`src/config/shellState.ts`).

## Network/API Access Layer (Current)

- Status: Implemented
- Confidence: High
- `RemoteDriver` encapsulates online API and realtime paths.
- Transport preference: WS -> SSE fallback -> snapshot fetch/resync fallback.
- API calls use typed contracts from `src/shared/onlineProtocol.ts`.
- Auth session fetch helpers in `src/shared/authSessionClient.ts`.

## UI/Game Feature Organization (Current)

- Status: Implemented
- Confidence: High
- Game logic in `src/game/`.
- Rendering in `src/render/`.
- Control orchestration in `src/controller/`.
- UX components in `src/ui/`.
- Variant identity/configuration in `src/variants/`.

## Where To Look When...

- Launch flow or wrong variant page: `src/indexMain.ts`, `src/variants/variantRegistry.ts`.
- Online desync/reconnect behavior: `src/driver/remoteDriver.ts`.
- Move input behavior (click/drag/touch): `src/controller/gameController.ts`, `src/ui/holdDrag.ts`.
- Layout/panel mode issues: `src/ui/panelLayoutMode.ts`, `src/ui/shell/gameShell.ts`.
- Theme/board style issues: `src/theme/*`, `src/render/checkerboardTheme.ts`.

## Refactor Hotspots and Temporary Structures

### Legacy vs Shell Panel Pair Coexistence

- Status: In Progress
- Confidence: High
- Evidence:
  - `src/ui/shell/gameShell.ts` (`stackworks.gameShell.desktopPanelMode`, legacy toggle behavior).
- Risk:
  - Duplicate UI pathways can diverge functionally.

### Start Page Feature Consolidation into Shell/Play Hub

- Status: In Progress
- Confidence: High
- Evidence:
  - `src/ui/shell/playHub.ts` contains reserved sections and placeholder modes.
- Risk:
  - Intent and implementation may drift if launcher logic remains split.

### Variant-specific Preference Key Proliferation

- Status: In Progress
- Confidence: Medium
- Evidence:
  - Numerous variant-specific LS keys across `*Main.ts` files.
- Risk:
  - Inconsistent behavior and harder migration cleanup.
