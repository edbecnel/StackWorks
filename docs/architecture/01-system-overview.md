# 01 - System Overview

Status: Implemented  
Confidence: High

Related:

- [README.md](./README.md)
- [02-context-view.md](./02-context-view.md)
- [03-container-view-current.md](./03-container-view-current.md)
- [04-container-view-target.md](./04-container-view-target.md)

## What The System Does

StackWorks is a browser-based multi-variant board game platform with:

- Local play for multiple variants.
- Online multiplayer with room lifecycle, replay, and presence.
- Optional bot/evaluation support (embedded and server-backed paths).
- Start-page launcher and game-specific pages.

Primary evidence:

- Client variant registry: `src/variants/variantRegistry.ts`
- Main client entry pages: `src/index.html`, `src/lasca.html`, `src/chess.html`, `src/dama.html`, `src/damasca.html`, `src/columnsChess.html`, `src/columnsDraughts.html`, `src/lasca8x8.html`
- Online server: `server/src/app.ts`

## Main Capabilities

### Variant Gameplay Runtime

- Responsibility: Render and control game variants in browser pages.
- Status: Implemented
- Confidence: High
- Key files/folders:
  - `src/main.ts`
  - `src/chessMain.ts`
  - `src/columnsChessMain.ts`
  - `src/damaMain.ts`
  - `src/damascaMain.ts`
  - `src/columnsDraughtsMain.ts`
  - `src/lasca8x8Main.ts`
  - `src/game/`, `src/controller/`, `src/render/`, `src/ui/`
- Inputs:
  - DOM events, URL params, localStorage preferences, optional remote snapshots.
- Outputs:
  - Rendered SVG boards/UI, persisted local preferences/saves, network requests (online mode).
- Dependencies:
  - `src/driver/*`, `src/shared/*`, variant assets under `src/assets/`.
- Common modification points:
  - Game-specific `*Main.ts` entry modules.
  - Shared controller behavior in `src/controller/gameController.ts`.

### Online Multiplayer Runtime

- Responsibility: Authoritative room and move processing, realtime sync, persistence.
- Status: Implemented
- Confidence: High
- Key files/folders:
  - `server/src/app.ts`
  - `server/src/persistence.ts`
  - `src/driver/remoteDriver.ts`
  - `src/shared/onlineProtocol.ts`
- Inputs:
  - HTTP move intents, join/create requests, WS/SSE connections.
- Outputs:
  - Authoritative snapshots, events log, room metadata, replay data.
- Dependencies:
  - Shared rules engine from `src/game/*` used server-side.
- Common modification points:
  - Route handlers in `server/src/app.ts`.
  - Client transport and resync logic in `src/driver/remoteDriver.ts`.

### Account/Auth + Profile

- Responsibility: Email/password accounts, profile metadata/avatar, cookie/session handling.
- Status: In Progress
- Confidence: High
- Key files/folders:
  - `server/src/app.ts` (`/api/auth/*` routes)
  - `server/src/auth/*`
  - `src/shared/authProtocol.ts`
  - `src/shared/authSessionClient.ts`
- Inputs:
  - Register/login/profile/avatar requests.
- Outputs:
  - Auth responses, cookie session, user profile persistence.
- Dependencies:
  - File-backed user store (`server/src/auth/authStore.ts`).
- Common modification points:
  - Session behavior in `server/src/auth/sessionStore.ts`.
  - Auth fetch/session helper on client.

### UX Shell Migration

- Responsibility: Move from legacy development-oriented UI toward shell-first product UX.
- Status: In Progress
- Confidence: High
- Key files/folders:
  - `src/ui/shell/*`
  - `src/config/shellState.ts`
  - `src/ui/panelLayoutMode.ts`
  - `docs/refactor-ui-shell.md`
- Inputs:
  - Shell state, panel mode state, user navigation actions.
- Outputs:
  - Shell nav, compact menu layouts, legacy/shell panel toggles.
- Dependencies:
  - Existing game pages and side-panel content.
- Common modification points:
  - `src/ui/shell/gameShell.ts`, `src/ui/shell/appShell.ts`, `src/ui/shell/playHub.ts`.

## Current Maturity Level (Major Areas)

- Core gameplay engines: Status: Implemented, Confidence: High.
- Multi-variant client pages: Status: Implemented, Confidence: High.
- Online synchronization/persistence: Status: Implemented, Confidence: High.
- Accounts/auth hardening: Status: In Progress, Confidence: High.
- Productized shell UX: Status: In Progress, Confidence: High.
- Ops/security maturity (beyond current baseline): Status: Planned, Confidence: Medium.

## High-Level Architecture Style

Status: Implemented  
Confidence: High

- Multi-page frontend (Vite multi-entry HTML) instead of SPA.
- Shared TypeScript domain/rules modules reused by client and server.
- Authoritative server for online game state.
- Realtime push (WebSocket preferred, SSE fallback) plus snapshot fetch fallback.
- File-based persistence for room snapshots/events and auth user data.

## Major Technologies In Use

Status: Implemented  
Confidence: High

- Frontend: TypeScript, Vite, DOM/SVG rendering.
- Backend: Node.js, Express, ws, CORS, file persistence.
- Testing: Vitest (extensive client+online regression tests in `src/*.test.ts`).
- Optional chess engine integration:
  - Integrated in main server via `server/src/stockfishService.ts`.
  - Standalone helper service under `stockfish-server/`.

## Known Unfinished Platform Concerns

### Authentication/Authorization Hardening

- Status: In Progress
- Confidence: High
- Evidence:
  - `docs/multiplayer-checklist.md` marks several MP4 items partial/open.
  - `server/src/auth/sessionStore.ts` is in-memory.
- TODO: confirm target persistent session strategy.

### Security/Abuse Controls Maturity

- Status: In Progress
- Confidence: Medium
- Evidence:
  - Basic IP limiter exists (`server/src/auth/rateLimit.ts`).
  - Wider endpoint throttling and structured hardening are not fully evident.
- TODO: confirm roadmap for non-auth endpoint rate limiting and telemetry.

### UX Refactor Completion

- Status: In Progress
- Confidence: High
- Evidence:
  - `docs/refactor-ui-shell.md` explicitly frames coexistence as temporary.
  - `src/ui/shell/gameShell.ts` contains legacy-vs-shell behavior flags.

## How To Read This System

Status: Implemented  
Confidence: High

1. Identify runtime first:
   - Client runtime starts from `src/indexMain.ts` and variant `*Main.ts` files.
   - Server runtime starts from `server/src/index.ts` -> `server/src/app.ts`.
2. Follow contracts:
   - Online contracts in `src/shared/onlineProtocol.ts`.
   - Auth contracts in `src/shared/authProtocol.ts`.
3. Validate with tests:
   - Online/persistence/presence tests under `src/*online*.test.ts`, `src/*presence*.test.ts`, `src/*restart*.test.ts`.
4. Use [11-code-map.md](./11-code-map.md) for quick navigation.
