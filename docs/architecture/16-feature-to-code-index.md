# 16 - Feature-to-Code Index (Maintainer Lookup)

Status: Implemented  
Confidence: High

Related:

- [10-runtime-flows.md](./10-runtime-flows.md)
- [11-code-map.md](./11-code-map.md)
- [12-refactor-hotspots.md](./12-refactor-hotspots.md)
- [14-variant-delta-matrix.md](./14-variant-delta-matrix.md)
- [15-api-surface-current.md](./15-api-surface-current.md)
- [08-auth-security-roadmap.md](./08-auth-security-roadmap.md)

Purpose:

- Practical, maintainer-oriented lookup from user-visible features and development concerns to primary code areas.
- Prioritizes modification starting points and break/fix triage anchors over exhaustive coverage.

Usage notes:

- `Primary client files/folders` and `Primary server files/folders` list the highest-signal first stops.
- `Shared types/contracts involved` references protocol/domain seams that usually carry cross-layer impact.
- `Logic split` explicitly separates shared vs specialized vs variant-specific logic.

## Quick Navigation Matrix

<a id="table-16-1"></a>

Table cross-reference: [Rendered table view](./tables-only.html#table-16-1)

| Feature/Concern                    | Start Here                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Session create/join/rejoin         | `src/indexMain.ts`, `src/driver/createDriver.ts`, `src/driver/remoteDriver.ts`, `server/src/app.ts`                      |
| Board render/layout glitches       | `src/render/renderGameState.ts`, `src/render/boardViewport.ts`, `src/ui/panelLayoutMode.ts`, `src/ui/shell/gameShell.ts` |
| Input click/drag/shortcut behavior | `src/controller/gameController.ts`, `src/ui/holdDrag.ts`, `src/ui/gameShortcuts.ts`                                      |
| Move legality/rules regression     | `src/game/movegen.ts`, `src/game/applyMove.ts`, variant-specific `src/game/movegen*.ts`/`applyMove*.ts`                  |
| Online desync/reconnect issues     | `src/driver/remoteDriver.ts`, `server/src/app.ts`, `src/shared/wireState.ts`                                             |
| Realtime presence/timeouts         | `server/src/app.ts`, `src/driver/remoteDriver.ts`, presence tests                                                        |
| Bot move/eval behavior             | `src/bot/*`, `src/ai/*`, `server/src/stockfishService.ts`                                                                |
| Variant launch/routing mismatch    | `src/variants/variantRegistry.ts`, `src/indexMain.ts`, variant `src/*Main.ts`                                            |
| Preference key drift               | `src/indexMain.ts`, `src/config/shellState.ts`, `src/*Main.ts`                                                           |
| Save/replay/persistence failures   | `server/src/persistence.ts`, `src/game/saveLoad.ts`, `src/shared/wireState.ts`                                           |
| Error fallback UX                  | `server/src/app.ts`, `src/driver/remoteDriver.ts`, `src/ui/*` status controls                                            |
| Shell migration seams              | `src/ui/shell/*`, `src/ui/panelLayoutMode.ts`, `src/indexMain.ts`                                                        |
| Auth/session/profile behavior      | `server/src/auth/*`, `server/src/app.ts`, `src/shared/authSessionClient.ts`                                              |

## Game/Session Lifecycle

### Online Room Create/Join/Rejoin

- What it is: Bootstraps online room context, seat identity, and authoritative snapshot for create/join/rejoin/watch flows.
- Status: Implemented (active hardening)
- Confidence: High
- Primary client files/folders: `src/indexMain.ts`, `src/driver/createDriver.ts`, `src/driver/remoteDriver.ts`, `src/shared/onlineResumeStorage.ts`
- Primary server files/folders: `server/src/app.ts`, `server/src/persistence.ts`
- Shared types/contracts involved: `src/shared/onlineProtocol.ts`, `src/shared/wireState.ts`, `src/variants/variantTypes.ts`
- Main entry points: launcher boot in `src/indexMain.ts`; `/api/create`, `/api/join`, `/api/room/:roomId` in `server/src/app.ts`
- Related runtime flow sections: [10-runtime-flows.md](./10-runtime-flows.md) -> App Startup, Loading an Online Game/Session
- Related API sections: [15-api-surface-current.md](./15-api-surface-current.md) -> Group C, Group D
- Start here if modifying this: `src/driver/remoteDriver.ts` and `server/src/app.ts`
- Inspect these first if broken: `src/onlineLobby.test.ts`, `src/onlineGuestRejoin.test.ts`, `src/onlineWebSocket.test.ts`, `server/src/app.ts`
- Logic split: Shared = protocol + wire snapshot types; Specialized = room orchestration and transport setup; Variant-specific = variant id propagation/launch defaults only.

### Local Session/Game Bootstrap

- What it is: Initializes local/offline runtime for variant pages and establishes driver/controller/render wiring.
- Status: Implemented
- Confidence: Medium
- Primary client files/folders: `src/main.ts`, `src/chessMain.ts`, `src/damaMain.ts`, `src/damascaMain.ts`, `src/columnsChessMain.ts`, `src/columnsDraughtsMain.ts`, `src/lasca8x8Main.ts`, `src/driver/localDriver.ts`
- Primary server files/folders: None (local mode)
- Shared types/contracts involved: `src/variants/variantRegistry.ts`, `src/game/state.ts`, `src/game/ruleset.ts`
- Main entry points: page entries (`src/*.html` -> `src/*Main.ts`)
- Related runtime flow sections: [10-runtime-flows.md](./10-runtime-flows.md) -> App Startup
- Related API sections: Not applicable
- Start here if modifying this: target variant `src/*Main.ts` first, then `src/controller/gameController.ts`
- Inspect these first if broken: target `src/*Main.ts`, `src/controller/gameController.ts`, `src/render/renderGameState.ts`
- Logic split: Shared = controller/render/domain modules; Specialized = per-entry bootstrap/wiring; Variant-specific = per-page options and defaults.

## Board Rendering / UI

### Board Scene Rendering and Piece Layers

- What it is: Produces the visual board state (pieces, overlays, highlights, viewport-related layers) from authoritative/local game state.
- Status: Implemented
- Confidence: High
- Primary client files/folders: `src/render/renderGameState.ts`, `src/render/renderStackAtNode.ts`, `src/render/overlays.ts`, `src/render/animateMove.ts`, `src/render/stackCountsLayer.ts`, `src/render/previewLayer.ts`
- Primary server files/folders: None
- Shared types/contracts involved: `src/game/state.ts`, `src/game/moveTypes.ts`
- Main entry points: render invocation via controller/page runtime (`src/controller/gameController.ts`, `src/*Main.ts`)
- Related runtime flow sections: [10-runtime-flows.md](./10-runtime-flows.md) -> App Startup, Executing a Move/Action
- Related API sections: Not applicable
- Start here if modifying this: `src/render/renderGameState.ts`
- Inspect these first if broken: `src/render/renderGameState.test.ts`, `src/render/overlays.test.ts`, `src/render/boardViewport.test.ts`
- Logic split: Shared = core render pipeline; Specialized = theme/viewport/annotation helpers; Variant-specific = visuals influenced by variant startup flags.

### Shell, Panels, and Board Viewport UX

- What it is: Controls panel layouts, shell-vs-legacy rendering paths, and viewport presentation options.
- Status: In Progress (refactor hotspot)
- Confidence: High
- Primary client files/folders: `src/ui/shell/gameShell.ts`, `src/ui/shell/appShell.ts`, `src/ui/shell/playHub.ts`, `src/ui/panelLayoutMode.ts`, `src/render/boardViewport.ts`, `src/ui/boardViewportMode.ts`
- Primary server files/folders: None
- Shared types/contracts involved: `src/config/shellState.ts`
- Main entry points: start page and game shell initialization (`src/indexMain.ts`, variant `src/*Main.ts`)
- Related runtime flow sections: [10-runtime-flows.md](./10-runtime-flows.md) -> App Startup
- Related API sections: Not applicable
- Start here if modifying this: `src/ui/shell/gameShell.ts` and `src/ui/panelLayoutMode.ts`
- Inspect these first if broken: `src/ui/shell/gameShell.test.ts`, `src/ui/shell/appShell.test.ts`, `src/ui/panelLayoutMode.test.ts`, `docs/refactor-ui-shell.md`
- Logic split: Shared = shell state model; Specialized = shell components and panel-mode adapters; Variant-specific = which controls/panels are surfaced on each page.

## Input Handling

### Board Interaction (Select/Drag/Commit)

- What it is: Converts pointer/touch interaction into candidate and committed game actions.
- Status: Implemented
- Confidence: Medium
- Primary client files/folders: `src/controller/gameController.ts`, `src/ui/holdDrag.ts`, `src/ui/touchAnnotationPalette.ts`, `src/ui/gameShortcuts.ts`
- Primary server files/folders: `server/src/app.ts` (online commit paths)
- Shared types/contracts involved: `src/game/moveTypes.ts`, `src/shared/onlineProtocol.ts`
- Main entry points: controller wiring in variant `src/*Main.ts`; online submit endpoints in `server/src/app.ts`
- Related runtime flow sections: [10-runtime-flows.md](./10-runtime-flows.md) -> Executing a Move/Action
- Related API sections: [15-api-surface-current.md](./15-api-surface-current.md) -> Group D
- Start here if modifying this: `src/controller/gameController.ts`
- Inspect these first if broken: `src/controller/gameController.test.ts`, `src/onlineMoveLatency.test.ts`, `src/clockTimeout.test.ts`
- Logic split: Shared = move intent model and controller contract; Specialized = input helpers + online submission; Variant-specific = capture-chain/finalization affordances.

## Move Validation / Rules

### Authoritative Move Legality and State Mutation

- What it is: Validates legal moves and applies state transitions in shared domain code; server remains authoritative online.
- Status: Implemented
- Confidence: High
- Primary client files/folders: `src/game/movegen.ts`, `src/game/applyMove.ts`, `src/game/endTurn.ts`, `src/game/gameOver.ts`, `src/controller/gameController.ts`
- Primary server files/folders: `server/src/app.ts`
- Shared types/contracts involved: `src/game/state.ts`, `src/game/ruleset.ts`, `src/game/moveTypes.ts`, `src/shared/wireState.ts`
- Main entry points: `/api/submitMove`, `/api/finalizeCaptureChain`, `/api/endTurn` in `server/src/app.ts`
- Related runtime flow sections: [10-runtime-flows.md](./10-runtime-flows.md) -> Executing a Move/Action
- Related API sections: [15-api-surface-current.md](./15-api-surface-current.md) -> Group D
- Start here if modifying this: `src/game/applyMove.ts` and relevant `src/game/movegen*.ts`
- Inspect these first if broken: `src/game/movegen.test.ts`, `src/game/applyMove.test.ts`, `src/game/endTurn.test.ts`, `src/game/gameOver.test.ts`
- Logic split: Shared = core rules engine; Specialized = server queue/CAS guardrails; Variant-specific = specialized movegen/apply modules.

### Variant-Specific Rule Modules

- What it is: Variant-family rule implementations and edge-case mechanics (capture chains, dead play, chess/columns specifics).
- Status: Implemented
- Confidence: High
- Primary client files/folders: `src/game/movegenChess.ts`, `src/game/movegenColumnsChess.ts`, `src/game/movegenColumnsDraughts.ts`, `src/game/movegenDama.ts`, `src/game/movegenDamasca.ts`, `src/game/movegenLasca.ts`, `src/game/damaCaptureChain.ts`, `src/game/damascaCaptureChain.ts`, `src/game/damascaDeadPlay.ts`, `src/game/internationalDraughtsDraw.ts`
- Primary server files/folders: `server/src/app.ts` (invokes shared rule functions)
- Shared types/contracts involved: `src/variants/variantTypes.ts`, `src/game/ruleset.ts`
- Main entry points: invoked through shared `applyMove`/`movegen` orchestration and capture-chain API routes
- Related runtime flow sections: [10-runtime-flows.md](./10-runtime-flows.md) -> Executing a Move/Action
- Related API sections: [15-api-surface-current.md](./15-api-surface-current.md) -> Group D
- Start here if modifying this: variant-specific `movegen`/`apply` module plus `src/variants/variantRegistry.ts`
- Inspect these first if broken: `src/game/movegen*.test.ts`, `src/game/applyMove*.test.ts`, `src/game/internationalDraughtsDraw.test.ts`
- Logic split: Shared = domain interfaces and rule orchestration; Specialized = variant-family helper modules; Variant-specific = per-ruleset legality/terminal conditions.

## Client-Server Synchronization

### Snapshot Versioning and Resync

- What it is: Maintains authoritative stateVersion tracking and re-fetches snapshots when realtime gaps are detected.
- Status: Implemented
- Confidence: Medium-High
- Primary client files/folders: `src/driver/remoteDriver.ts`
- Primary server files/folders: `server/src/app.ts`, `server/src/persistence.ts`
- Shared types/contracts involved: `src/shared/wireState.ts`, `src/shared/onlineProtocol.ts`
- Main entry points: realtime channels `/api/ws` and `/api/stream/:roomId`; resync via `/api/room/:roomId`
- Related runtime flow sections: [10-runtime-flows.md](./10-runtime-flows.md) -> Client-Server Synchronization / Resync
- Related API sections: [15-api-surface-current.md](./15-api-surface-current.md) -> Group C
- Start here if modifying this: `src/driver/remoteDriver.ts`
- Inspect these first if broken: `src/onlineGapResync.test.ts`, `src/onlineWebSocket.test.ts`, `src/replayEndpoint.test.ts`
- Logic split: Shared = wire contracts; Specialized = resync orchestration and transport handling; Variant-specific = none expected beyond payload variant metadata.

## Realtime / Multiplayer

### Presence, Grace Windows, and Disconnect Timeouts

- What it is: Tracks player connectivity and grace behavior, including timeout game-over and reconnect restoration.
- Status: Implemented (active hardening)
- Confidence: Medium
- Primary client files/folders: `src/driver/remoteDriver.ts`
- Primary server files/folders: `server/src/app.ts`
- Shared types/contracts involved: `src/shared/onlineProtocol.ts`
- Main entry points: realtime transport in `server/src/app.ts`; disconnect/reconnect lifecycle in `src/driver/remoteDriver.ts`
- Related runtime flow sections: [10-runtime-flows.md](./10-runtime-flows.md) -> Reconnect / Grace / Timeout
- Related API sections: [15-api-surface-current.md](./15-api-surface-current.md) -> Group C
- Start here if modifying this: server presence/grace logic in `server/src/app.ts`
- Inspect these first if broken: `src/presence.test.ts`, `src/disconnectTimeout.test.ts`, `src/graceRestoreRestart.test.ts`, `src/wsPresenceMultiConn.test.ts`
- Logic split: Shared = presence metadata schema; Specialized = server timers + transport edge handling; Variant-specific = clock/pause semantics may vary by mode.

### Lobby and Room Discovery

- What it is: Lists discoverable rooms and room metadata for entry decisions.
- Status: Implemented
- Confidence: High
- Primary client files/folders: `src/indexMain.ts`, `src/ui/lobby/*`
- Primary server files/folders: `server/src/app.ts`, `server/src/persistence.ts`
- Shared types/contracts involved: `src/shared/onlineProtocol.ts`
- Main entry points: `/api/lobby`, `/api/room/:roomId/meta` in `server/src/app.ts`
- Related runtime flow sections: [10-runtime-flows.md](./10-runtime-flows.md) -> Loading an Online Game/Session
- Related API sections: [15-api-surface-current.md](./15-api-surface-current.md) -> Group E, Group C
- Start here if modifying this: `src/indexMain.ts` (client) and `/api/lobby` logic in `server/src/app.ts`
- Inspect these first if broken: `src/onlineLobby.test.ts`, `src/roomVisibility.test.ts`, `src/onlineGuestRejoin.test.ts`
- Logic split: Shared = room summary contract shapes; Specialized = discoverability filters and server room-status computation; Variant-specific = UI labels/options by variant.

## Bot/AI Integration

### Local/Hybrid Bot Managers

- What it is: In-client bot orchestration and fallback move generation for chess/columns chess and adaptive behavior.
- Status: Implemented
- Confidence: High
- Primary client files/folders: `src/bot/chessBotManager.ts`, `src/bot/columnsChessBotManager.ts`, `src/bot/chessFallback.ts`, `src/bot/columnsChessFallback.ts`, `src/bot/adaptive.ts`, `src/ui/bot/*`, `src/ui/chessBotUiMode.ts`
- Primary server files/folders: None required for local fallback paths
- Shared types/contracts involved: `src/bot/engineTypes.ts`, `src/shared/chessBotPersonaAvatars.ts`, `src/shared/draughtsBotPersonaAvatars.ts`
- Main entry points: chess-family `src/chessMain.ts` and `src/columnsChessMain.ts`
- Related runtime flow sections: [10-runtime-flows.md](./10-runtime-flows.md) -> App Startup
- Related API sections: Not required for fully local bot fallback
- Start here if modifying this: target bot manager (`src/bot/chessBotManager.ts` or `src/bot/columnsChessBotManager.ts`)
- Inspect these first if broken: `src/bot/chessBotManager.test.ts`, `src/bot/columnsChessBotManager.test.ts`, `src/ui/chessBotUiMode.test.ts`
- Logic split: Shared = bot engine interfaces/presets; Specialized = per-game bot managers; Variant-specific = chess vs columns-chess behavior and selectors.

### Server Stockfish Integration

- What it is: Server-side stockfish health and move/eval endpoint wiring used by HTTP engine integrations.
- Status: Implemented
- Confidence: High
- Primary client files/folders: `src/bot/httpEngine.ts`, `src/bot/stockfishEngine.ts`
- Primary server files/folders: `server/src/stockfishService.ts`, `server/src/app.ts`
- Shared types/contracts involved: `src/bot/engineTypes.ts`
- Main entry points: `/api/stockfish/health` and stockfish action endpoints in `server/src/app.ts`
- Related runtime flow sections: [10-runtime-flows.md](./10-runtime-flows.md) -> Error Handling (service availability impact)
- Related API sections: [15-api-surface-current.md](./15-api-surface-current.md) -> Health and Stockfish status + omitted stockfish action endpoints note
- Start here if modifying this: `server/src/stockfishService.ts`
- Inspect these first if broken: `/api/stockfish/health` route in `server/src/app.ts`, client engine adapter in `src/bot/httpEngine.ts`
- Logic split: Shared = engine type contracts; Specialized = server stockfish lifecycle and HTTP adapter; Variant-specific = mostly chess-family consumers.

## Variant-Specific Behavior

### Variant Registry and Entry Mapping

- What it is: Canonical source for variant IDs, metadata, aliases, and page-entry mapping.
- Status: Implemented
- Confidence: High
- Primary client files/folders: `src/variants/variantRegistry.ts`, `src/variants/variantTypes.ts`, `src/indexMain.ts`, `src/*Main.ts`
- Primary server files/folders: `server/src/app.ts` (room variant metadata persistence/response)
- Shared types/contracts involved: `src/variants/variantTypes.ts`, `src/shared/onlineProtocol.ts`
- Main entry points: launcher selection in `src/indexMain.ts`; page-specific entry files
- Related runtime flow sections: [10-runtime-flows.md](./10-runtime-flows.md) -> App Startup, Loading an Online Game/Session
- Related API sections: [15-api-surface-current.md](./15-api-surface-current.md) -> Group D (create/join payloads carry variant)
- Start here if modifying this: `src/variants/variantRegistry.ts`
- Inspect these first if broken: `src/indexMain.ts`, target `src/*Main.ts`, `docs/architecture/14-variant-delta-matrix.md`
- Logic split: Shared = variant identity types; Specialized = launcher synthesis and runtime selection; Variant-specific = entry-specific defaults and option exposure.

## Settings/Preferences

### Launcher, Shell, and Per-Variant Preference State

- What it is: Local preference and launch-intent storage across start page, shell migration paths, and variant pages.
- Status: In Progress
- Confidence: Medium
- Primary client files/folders: `src/indexMain.ts`, `src/config/shellState.ts`, `src/ui/shell/playHub.ts`, `src/*Main.ts`, `src/ui/panelLayoutMode.ts`
- Primary server files/folders: None required (client localStorage ownership)
- Shared types/contracts involved: `src/shared/openVariantPageIntent.ts`, `src/shared/authSessionClient.ts`
- Main entry points: start page and variant bootstraps
- Related runtime flow sections: [10-runtime-flows.md](./10-runtime-flows.md) -> App Startup
- Related API sections: Indirect only (launch mode selects local vs online API usage)
- Start here if modifying this: `src/indexMain.ts` and `src/config/shellState.ts`
- Inspect these first if broken: `src/ui/shell/playHub.test.ts`, `src/ui/panelLayoutMode.test.ts`, `docs/architecture/12-refactor-hotspots.md`
- Logic split: Shared = shell-state concepts and open-intent contract; Specialized = launcher/shell adapters; Variant-specific = per-entry keys/options.

## Persistence/Storage

### Room Snapshot/Event Persistence and Replay

- What it is: Durable storage of room snapshot and event stream used for recovery, replay, and restart continuity.
- Status: Implemented
- Confidence: High
- Primary client files/folders: `src/replayEndpoint.test.ts`, `src/persistenceRestart.test.ts` (verification coverage)
- Primary server files/folders: `server/src/persistence.ts`, `server/src/app.ts`
- Shared types/contracts involved: `src/shared/wireState.ts`, `src/shared/onlineProtocol.ts`
- Main entry points: `/api/room/:roomId`, `/api/room/:roomId/replay`, write paths in action routes
- Related runtime flow sections: [10-runtime-flows.md](./10-runtime-flows.md) -> Executing a Move/Action, Client-Server Synchronization / Resync
- Related API sections: [15-api-surface-current.md](./15-api-surface-current.md) -> Group C, Group D, Group E
- Start here if modifying this: `server/src/persistence.ts`
- Inspect these first if broken: `src/persistenceRestart.test.ts`, `src/replayEndpoint.test.ts`, `server/src/app.ts`
- Logic split: Shared = wire serialization/deserialization; Specialized = file IO atomic write and event append; Variant-specific = replayed states encode variant id/rules.

### Auth/User Profile Storage

- What it is: User record persistence, avatar file storage, and session reference flow for auth/profile features.
- Status: In Progress (hardening gap)
- Confidence: High
- Primary client files/folders: `src/shared/authSessionClient.ts`, `src/indexMain.ts`
- Primary server files/folders: `server/src/auth/authStore.ts`, `server/src/auth/sessionStore.ts`, `server/src/app.ts`
- Shared types/contracts involved: `src/shared/authProtocol.ts`
- Main entry points: `/api/auth/register`, `/api/auth/login`, `/api/auth/me`, `/api/auth/me/avatar` in `server/src/app.ts`
- Related runtime flow sections: [10-runtime-flows.md](./10-runtime-flows.md) -> Session Initialization (Auth)
- Related API sections: [15-api-surface-current.md](./15-api-surface-current.md) -> Group B
- Start here if modifying this: `server/src/auth/authStore.ts` (data model) and `server/src/auth/sessionStore.ts` (session lifecycle)
- Inspect these first if broken: `src/authAccountsMp4c.test.ts`, `src/onlineAuthIdentity.test.ts`, `docs/architecture/08-auth-security-roadmap.md`
- Logic split: Shared = auth protocol payloads; Specialized = server auth/session persistence implementation; Variant-specific = none.

## Error Handling / Recovery

### API Error Propagation, Client Recovery, and Fallback Paths

- What it is: Structured server errors and client fallback paths (retry, reconnect, resync, degraded transport modes).
- Status: Implemented (UX polish ongoing)
- Confidence: Medium
- Primary client files/folders: `src/driver/remoteDriver.ts`, `src/ui/leaveRoomButton.ts`, `src/ui/navigationPromptGate.ts`, `src/ui/offlineNavGuard.ts`
- Primary server files/folders: `server/src/app.ts`
- Shared types/contracts involved: `src/shared/onlineProtocol.ts`, `src/shared/authProtocol.ts`
- Main entry points: API route handlers in `server/src/app.ts`; transport/recovery in `src/driver/remoteDriver.ts`
- Related runtime flow sections: [10-runtime-flows.md](./10-runtime-flows.md) -> Error Handling, Client-Server Synchronization / Resync
- Related API sections: [15-api-surface-current.md](./15-api-surface-current.md) -> Group B, Group C, Group D
- Start here if modifying this: `src/driver/remoteDriver.ts` for recovery semantics; `server/src/app.ts` for error shape/conditions
- Inspect these first if broken: `src/onlineDebugReport.test.ts`, `src/onlineGapResync.test.ts`, `src/onlineMoveLatency.test.ts`
- Logic split: Shared = request/response error payload contracts; Specialized = driver and route-level error handling; Variant-specific = some UX messaging/controls differ by page.

## Refactor-in-Progress UI Areas

### Legacy Panel Paths vs Shell-First Paths

- What it is: Transitional coexistence of legacy panel UX and shell-first product UX.
- Status: In Progress
- Confidence: High
- Primary client files/folders: `src/ui/shell/gameShell.ts`, `src/ui/shell/appShell.ts`, `src/ui/shell/playHub.ts`, `src/ui/panelLayoutMode.ts`, `src/indexMain.ts`
- Primary server files/folders: None
- Shared types/contracts involved: `src/config/shellState.ts`
- Main entry points: start page shell bootstrap and game shell setup
- Related runtime flow sections: [10-runtime-flows.md](./10-runtime-flows.md) -> App Startup
- Related API sections: Not directly API-owned
- Start here if modifying this: `src/ui/shell/gameShell.ts`
- Inspect these first if broken: `docs/refactor-ui-shell.md`, `docs/architecture/12-refactor-hotspots.md`, `src/ui/shell/gameShell.test.ts`
- Logic split: Shared = shell-state model; Specialized = compat adapters and panel mode toggles; Variant-specific = specific panel/option visibility rules.

## Auth/Security Integration Points (Current and Planned)

### Current Integration Points (Code-visible)

- What it is: Existing account/session/profile + seat-capability checks integrated with online room actions.
- Status: Implemented (with hardening in progress)
- Confidence: High
- Primary client files/folders: `src/shared/authSessionClient.ts`, `src/indexMain.ts`, `src/driver/createDriver.ts`
- Primary server files/folders: `server/src/app.ts`, `server/src/auth/authStore.ts`, `server/src/auth/sessionStore.ts`, `server/src/auth/httpCookies.ts`, `server/src/auth/rateLimit.ts`
- Shared types/contracts involved: `src/shared/authProtocol.ts`, `src/shared/onlineProtocol.ts`
- Main entry points: `/api/auth/*`, seat-gated room action routes, `requireRoomView`/`requirePlayer` logic in `server/src/app.ts`
- Related runtime flow sections: [10-runtime-flows.md](./10-runtime-flows.md) -> Session Initialization (Auth), Loading an Online Game/Session
- Related API sections: [15-api-surface-current.md](./15-api-surface-current.md) -> Group B, Group C, Group D
- Start here if modifying this: `server/src/app.ts` auth/session middleware + guards
- Inspect these first if broken: `src/onlineAuthIdentity.test.ts`, `src/authAccountsMp4c.test.ts`, `docs/architecture/08-auth-security-roadmap.md`
- Logic split: Shared = auth + room capability contracts; Specialized = server auth/session stores and middleware; Variant-specific = none.

### Planned/Inferable Integration Points (Roadmap-aligned only)

- What it is: Clearly inferable hardening seams from roadmap docs without asserting unimplemented ownership details.
- Status: Planned
- Confidence: Medium
- Primary client files/folders: `src/shared/authSessionClient.ts` (session propagation seam)
- Primary server files/folders: `server/src/auth/sessionStore.ts`, `server/src/auth/rateLimit.ts`, `server/src/app.ts`
- Shared types/contracts involved: `src/shared/authProtocol.ts`
- Main entry points: same auth/session middleware and endpoint surfaces as current state
- Related runtime flow sections: [10-runtime-flows.md](./10-runtime-flows.md) -> Session Initialization (Auth), Error Handling
- Related API sections: [15-api-surface-current.md](./15-api-surface-current.md) -> Group B
- Start here if modifying this: [08-auth-security-roadmap.md](./08-auth-security-roadmap.md) first, then `server/src/auth/sessionStore.ts`
- Inspect these first if broken: [13-risks-tech-debt-and-gaps.md](./13-risks-tech-debt-and-gaps.md) (R3), `server/src/auth/sessionStore.ts`
- Logic split: Shared = protocol remains stable seam; Specialized = durable sessions/expanded abuse controls expected in server; Variant-specific = none.

## Shared vs Specialized vs Variant-Specific Logic (Global Guide)

### Shared Logic (Cross-layer / Cross-variant)

- `src/shared/onlineProtocol.ts`
- `src/shared/authProtocol.ts`
- `src/shared/wireState.ts`
- `src/game/state.ts`, `src/game/moveTypes.ts`, `src/game/applyMove.ts`, `src/game/endTurn.ts`
- `src/variants/variantTypes.ts`

### Specialized Logic (Subsystem-specific)

- Client transport/orchestration: `src/driver/remoteDriver.ts`, `src/driver/createDriver.ts`
- Server orchestration and API: `server/src/app.ts`
- Persistence implementation: `server/src/persistence.ts`
- Auth/session internals: `server/src/auth/*`
- Shell migration internals: `src/ui/shell/*`, `src/ui/panelLayoutMode.ts`

### Variant-Specific Logic

- Entry and bootstrap files: `src/main.ts`, `src/chessMain.ts`, `src/columnsChessMain.ts`, `src/damaMain.ts`, `src/damascaMain.ts`, `src/columnsDraughtsMain.ts`, `src/lasca8x8Main.ts`
- Variant rules modules: `src/game/movegen*.ts`, `src/game/applyMove*.ts`, `src/game/damaCaptureChain.ts`, `src/game/damascaCaptureChain.ts`, `src/game/damascaDeadPlay.ts`, `src/game/internationalDraughtsDraw.ts`
- Variant routing metadata: `src/variants/variantRegistry.ts`

## Refactor Flags and Confidence Hotspots

- Refactor hotspot: shell migration coexistence (`src/ui/shell/*`, `src/ui/panelLayoutMode.ts`) -> see [12-refactor-hotspots.md](./12-refactor-hotspots.md)
- Refactor hotspot: launcher state vs shell state ownership (`src/indexMain.ts`, `src/config/shellState.ts`) -> see [12-refactor-hotspots.md](./12-refactor-hotspots.md)
- Active hardening area: multiplayer reliability (`src/driver/remoteDriver.ts`, `server/src/app.ts`) -> see [10-runtime-flows.md](./10-runtime-flows.md)
- Active hardening area: auth/session durability (`server/src/auth/sessionStore.ts`) -> see [08-auth-security-roadmap.md](./08-auth-security-roadmap.md)

## Where to Cross-Check Before Major Changes

- Runtime sequence: [10-runtime-flows.md](./10-runtime-flows.md)
- API ownership and auth requirements: [15-api-surface-current.md](./15-api-surface-current.md)
- Refactor seams and temporary adapters: [12-refactor-hotspots.md](./12-refactor-hotspots.md)
- Shared contract impact: [09-shared-domain-and-contracts.md](./09-shared-domain-and-contracts.md)
- Variant deltas and duplication: [14-variant-delta-matrix.md](./14-variant-delta-matrix.md)
