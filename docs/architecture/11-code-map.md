# 11 - Code Map (Practical)

Status: Implemented  
Confidence: High

Related:

- [05-client-architecture-current.md](./05-client-architecture-current.md)
- [07-server-architecture-current.md](./07-server-architecture-current.md)
- [12-refactor-hotspots.md](./12-refactor-hotspots.md)

> **Note on Verification Anchors:** Anchors below record primary file paths and symbol names for major navigational areas. Line numbers are omitted from this document — the code map is intentionally broad and symbols/paths are the only drift-stable anchors. Update anchor blocks when entry points, exported symbols, or ownership boundaries change.

## Top-level Directories

- `src/`: client pages, game engines, renderers, UI, shared contracts.
- `server/`: authoritative online server runtime.
- `stockfish-server/`: optional standalone stockfish helper API.
- `public/`: static assets (icons, pieces, service worker, vendor assets).
- `docs/`: product and technical notes/checklists/refactor plans.
- `scripts/`: utility scripts (asset processing/debug helpers).

## Important Entry Points

- Start page app: `src/index.html` -> `src/indexMain.ts`
- Lasca game page: `src/lasca.html` -> `src/main.ts`
- Chess page: `src/chess.html` -> `src/chessMain.ts`
- Dama/checkers/international: `src/dama.html` -> `src/damaMain.ts`
- Server process entry: `server/src/index.ts` -> `server/src/app.ts`
- Build entry declarations: `vite.config.ts`

**Verification Anchor**

- Primary source(s): `server/src/index.ts`, `server/src/app.ts`, `src/indexMain.ts`, `src/*Main.ts`, `vite.config.ts`
- Key symbols: `startLascaServer`, `createLascaApp` (server/src/app.ts); `createDriver`, `selectDriverMode` (src/driver/createDriver.ts)
- Last verified: 2026-04-01
- Confidence: **High**

## Major Feature Areas

### Client-only Areas

- UI shell/layout/nav: `src/ui/shell/*`, `src/ui/layout/*`, `src/ui/panelLayoutMode.ts`
- Rendering/theme: `src/render/*`, `src/theme/*`, `src/assets/*`
- Variant bootstraps: `src/*Main.ts`

### Server-only Areas

- API/realtime orchestration: `server/src/app.ts`
- Persistence implementation: `server/src/persistence.ts`
- Auth/session implementation: `server/src/auth/*`

### Shared Areas (Client + Server)

- Protocol contracts: `src/shared/onlineProtocol.ts`, `src/shared/authProtocol.ts`, `src/shared/wireState.ts`
- Game/rules domain: `src/game/*`
- Variant model: `src/variants/*`

**Verification Anchor** (Shared Areas)

- Primary source(s): `src/shared/onlineProtocol.ts`, `src/shared/wireState.ts`, `src/variants/variantRegistry.ts`
- Key symbols: `WireSnapshot`, `WireGameState`, `serializeWireGameState`, `deserializeWireGameState` (wireState.ts); `VARIANTS`, `getVariantById` (variantRegistry.ts)
- Last verified: 2026-04-01
- Confidence: **High**

## If You Need To Change X, Start Here

- Add or modify a variant definition:
  - `src/variants/variantRegistry.ts`, `src/variants/variantTypes.ts`
- Change online API contract:
  - `src/shared/onlineProtocol.ts` then align `server/src/app.ts` and `src/driver/remoteDriver.ts`
- Change move/rule behavior:
  - `src/game/*` plus relevant tests under `src/*.test.ts`
- Change reconnect/resync behavior:
  - `src/driver/remoteDriver.ts` and server snapshot/version paths in `server/src/app.ts`
- Change auth/profile fields:
  - `src/shared/authProtocol.ts`, `server/src/auth/authStore.ts`, `server/src/app.ts`, `src/indexMain.ts`
- Change start page launch behavior:
  - `src/indexMain.ts`, `src/ui/shell/appShell.ts`, `src/ui/shell/playHub.ts`
- Change deployment/persistence paths:
  - `render.yaml`, `server/src/persistence.ts`, `server/src/app.ts`

## If This Breaks, Inspect These Files First

- Online game cannot join/create:
  - `server/src/app.ts`, `src/driver/createDriver.ts`, `src/driver/remoteDriver.ts`
- Moves do not sync/replay:
  - `server/src/app.ts`, `server/src/persistence.ts`, `src/shared/wireState.ts`
- Presence/reconnect timeout odd behavior:
  - `server/src/app.ts` presence/grace handlers, `src/driver/remoteDriver.ts`
- Wrong page/variant launches:
  - `src/indexMain.ts`, `src/variants/variantRegistry.ts`, `vite.config.ts`
- Auth appears logged out unexpectedly after server restart:
  - `server/src/auth/sessionStore.ts`

## Refactor Hotspots (Quick Map)

- Shell migration seam:
  - `src/ui/shell/gameShell.ts`, `src/ui/shell/appShell.ts`, `docs/refactor-ui-shell.md`
- Start-page vs shell state seam:
  - `src/indexMain.ts`, `src/config/shellState.ts`, `src/ui/shell/playHub.ts`
- Online hardening seam:
  - `src/driver/remoteDriver.ts`, `server/src/app.ts`, `docs/multiplayer-checklist.md`

**Verification Anchor** (Refactor Hotspots)

- Primary source(s): `src/ui/shell/gameShell.ts`, `src/ui/shell/appShell.ts`, `src/driver/remoteDriver.ts`, `server/src/app.ts`
- Key symbols: `RemoteDriver` (src/driver/remoteDriver.ts); shell component internal symbols not verified — file paths are primary anchors here
- Last verified: 2026-04-01
- Confidence: **Medium**

## Extension Points For New Features

- New game variant:
  - Add variant metadata + entry HTML/main + rules integration + launcher option.
- New online action:
  - Extend `src/shared/onlineProtocol.ts`, implement server route, integrate in `RemoteDriver`.
- New profile field:
  - Extend auth protocol + auth store + profile UI surfaces.
- New shell section:
  - Extend `src/config/shellState.ts` and `src/ui/shell/*` components.

## Temporary Path vs Target Path (Refactor-aware)

- Temporary/current path:
  - Legacy and shell panel modes coexist in game shell.
- Target path (inferred):
  - Shell-first, single coherent pathway after parity.
- Evidence anchors:
  - `docs/refactor-ui-shell.md`, `src/ui/shell/gameShell.ts`

## Tests To Use While Modifying

- Online lifecycle tests:
  - `src/online*.test.ts`, `src/presence.test.ts`, `src/disconnectTimeout.test.ts`, `src/graceRestoreRestart.test.ts`
- Replay/persistence tests:
  - `src/persistenceRestart.test.ts`, `src/replayEndpoint.test.ts`
- Auth/profile tests:
  - `src/authAccountsMp4c.test.ts`, `src/onlineAuthIdentity.test.ts`
- Admin route tests:
  - `src/adminDeleteRoom.test.ts`, `src/adminBulkDelete.test.ts`
