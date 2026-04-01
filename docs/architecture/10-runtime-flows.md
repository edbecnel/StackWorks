# 10 - Runtime Flows (Current)

Status: Implemented  
Confidence: High

Related:

- [05-client-architecture-current.md](./05-client-architecture-current.md)
- [07-server-architecture-current.md](./07-server-architecture-current.md)
- [09-shared-domain-and-contracts.md](./09-shared-domain-and-contracts.md)

> **Note on Verification Anchors:** Anchors below record the trigger location, main orchestrating module, and key downstream symbols for each flow. Confidence is set conservatively because flows span distributed call chains. Line numbers are omitted; update anchors when trigger location, orchestrating module, or downstream ownership changes.

## Flow: App Startup

- Trigger:
  - Browser loads `src/index.html` or a game page HTML entry.
- Step-by-step:
  1. Vite-served page loads entry script (`src/indexMain.ts` or variant `*Main.ts`).
  2. Entry initializes shell/panel/layout helpers and reads localStorage preferences.
  3. Variant runtime loads SVG assets and initial game state.
  4. Driver mode selected via URL/env (`src/driver/createDriver.ts`).
- Main modules/files involved:
  - `src/indexMain.ts`, `src/*Main.ts`, `src/driver/createDriver.ts`, `src/variants/variantRegistry.ts`
- Data passed:
  - URL params, LS keys, variant IDs.
- Failure points:
  - Missing expected DOM nodes, malformed launch params, asset load failure.
- Stability:
  - Stable core, with shell/layout behavior under transition.

**Verification Anchor**

- Trigger: `src/index.html` → `src/indexMain.ts`; variant HTML pages → `src/*Main.ts`
- Orchestrating: `src/driver/createDriver.ts`
- Key symbols: `selectDriverMode`, `createDriver` (createDriver.ts); `getVariantById` (variantRegistry.ts)
- Last verified: 2026-04-01
- Confidence: **High** (driver selection and variant lookup); **Medium** (asset and layout initialization — internal methods not verified)

## Flow: Session Initialization (Auth)

- Trigger:
  - Start page/account UI performs auth check or login/register action.
- Step-by-step:
  1. Client calls `/api/auth/*` using helpers in `src/shared/authSessionClient.ts`.
  2. Server validates and creates/reads session (`server/src/app.ts`).
  3. Session identity attached via middleware for future requests.
  4. Client stores session metadata and updates account UI state.
- Main modules/files involved:
  - `src/indexMain.ts`, `src/shared/authSessionClient.ts`, `server/src/app.ts`, `server/src/auth/*`
- Data passed:
  - Email/password/profile payloads; session cookie/token.
- Failure points:
  - Invalid credentials, expired/missing session, storage/cookie constraints.
- Stability:
  - Implemented but not fully production-hardened.

**Verification Anchor**

- Trigger: `src/shared/authSessionClient.ts` client calls
- Orchestrating: `server/src/app.ts` (`createLascaApp` auth routes); `server/src/auth/*`
- Key symbols: `persistAuthSessionFromPayload`, `buildSessionAuthFetchInit` (authSessionClient.ts); `createUser`, `findUserByEmail`, `findUserById` (authStore.ts); `SessionStore` (sessionStore.ts)
- Last verified: 2026-04-01
- Confidence: **High**

## Flow: Loading an Online Game/Session

- Trigger:
  - Create/join/rejoin/spectate flow from start page or direct URL params.
- Step-by-step:
  1. Client launch logic builds online query and seat identity context (`src/indexMain.ts`, `src/driver/createDriver.ts`).
  2. Server handles `/api/create` or `/api/join` and returns snapshot + seat info.
  3. Client `RemoteDriver` sets remote IDs, state/history from snapshot.
  4. Realtime starts (`/api/ws` preferred, `/api/stream/:roomId` fallback).
- Main modules/files involved:
  - `src/indexMain.ts`, `src/driver/createDriver.ts`, `src/driver/remoteDriver.ts`, `server/src/app.ts`
- Data passed:
  - Variant ID, room ID, player ID, optional watch token, wire snapshot.
- Failure points:
  - Room full/private access denied/stale room data.
- Stability:
  - Stable with active hardening for edge cases.

**Verification Anchor**

- Trigger: `src/indexMain.ts` launch logic → `src/driver/createDriver.ts`
- Orchestrating: `src/driver/remoteDriver.ts` (`RemoteDriver`); server `/api/create`, `/api/join` in `server/src/app.ts`
- Key symbols: `selectDriverMode`, `createDriver` (createDriver.ts); `RemoteDriver` (remoteDriver.ts)
- Last verified: 2026-04-01
- Confidence: **High**

## Flow: Executing a Move/Action (Online)

- Trigger:
  - User commits a move/action in online mode.
- Step-by-step:
  1. Client submits intent (`submitMove`/`finalizeCaptureChain`/`endTurn`) with optional expected stateVersion.
  2. Server serializes action via room queue and validates seat/turn/room readiness.
  3. Shared game logic applies state transition; stateVersion increments.
  4. Server queues persistence and broadcasts authoritative snapshot.
  5. Client applies authoritative snapshot and updates UI/history.
- Main modules/files involved:
  - `src/controller/gameController.ts`, `src/driver/remoteDriver.ts`, `server/src/app.ts`, `server/src/persistence.ts`
- Data passed:
  - Move payloads, stateVersion, wire snapshots.
- Failure points:
  - Stale expected version, opponent disconnected, illegal move, game over.
- Stability:
  - Stable with CAS + queue protections.

**Verification Anchor**

- Trigger: `src/controller/gameController.ts` (`GameController`) → `src/driver/remoteDriver.ts` (`RemoteDriver`)
- Orchestrating: `queueRoomAction`, `requireRoom`, `requirePlayer`, `requireRoomReady` (server/src/app.ts)
- Key symbols: `GameController` (gameController.ts); `RemoteDriver` (remoteDriver.ts); `appendEvent`, `writeSnapshotAtomic` (persistence.ts); `broadcastRoomSnapshot` (server/src/app.ts)
- Last verified: 2026-04-01
- Confidence: **Medium** (class-level verification; `applyMove` referenced but not symbol-verified)

## Flow: Client-Server Synchronization / Resync

- Trigger:
  - Realtime gap/out-of-order detection, reconnect, or watchdog stale detection.
- Step-by-step:
  1. `RemoteDriver` tracks incoming snapshot versions.
  2. If gap detected, client performs resync (`GET /api/room/:roomId`).
  3. Server returns latest authoritative snapshot metadata.
  4. Client replaces local state/history with server snapshot.
- Main modules/files involved:
  - `src/driver/remoteDriver.ts`, `server/src/app.ts`
- Data passed:
  - stateVersion and wire snapshot.
- Failure points:
  - Transport failures, stale credentials, private-room access restrictions.
- Stability:
  - Stable and explicitly hardened in checklist/tests.

**Verification Anchor**

- Trigger: `src/driver/remoteDriver.ts` (`RemoteDriver`) detects stateVersion gap
- Orchestrating: `RemoteDriver` → `GET /api/room/:roomId` in `server/src/app.ts`
- Key symbols: `RemoteDriver` (remoteDriver.ts); `requireRoomView` (server/src/app.ts)
- Last verified: 2026-04-01
- Confidence: **Medium** (class-level; internal resync method names not verified)

## Flow: Error Handling

- Trigger:
  - Route validation failure, auth failure, stale request, transport issues.
- Step-by-step:
  1. Server emits structured error response `{ error: string }` on failing routes.
  2. Client driver/controller surfaces status/toast/flow fallback.
  3. For transport instability, client transitions to reconnect/resync paths.
- Main modules/files involved:
  - `server/src/app.ts`, `src/driver/remoteDriver.ts`, UI status/toast components.
- Data passed:
  - Error strings and transport status events.
- Failure points:
  - Ambiguous user messaging in some edge cases.
- Stability:
  - Functional; UX polish still transitional.

## Flow: Reconnect / Grace / Timeout

- Trigger:
  - Client disconnect, tab close, network loss.
- Step-by-step:
  1. Server marks seat disconnected and may start grace timer.
  2. Clocks can pause during grace where applicable.
  3. Reconnected seat clears grace and resumes presence.
  4. If grace expires with opponent connected, server forces disconnect timeout game over.
- Main modules/files involved:
  - `server/src/app.ts` presence/grace logic
  - `src/driver/remoteDriver.ts` reconnect logic
- Data passed:
  - Presence/grace timestamps in snapshot metadata.
- Failure points:
  - Multi-connection edge cases and intermittent transport churn.
- Stability:
  - Implemented and regression-tested; still an active hardening area.

**Verification Anchor**

- Trigger: WebSocket disconnect detected server-side in `server/src/app.ts`; reconnect initiated in `src/driver/remoteDriver.ts`
- Orchestrating: `setPresence`, `clearGrace` (server/src/app.ts); `RemoteDriver` (src/driver/remoteDriver.ts)
- Key symbols: `setPresence`, `clearGrace` (server/src/app.ts); `RemoteDriver` (remoteDriver.ts)
- Last verified: 2026-04-01
- Confidence: **Medium** (server symbols confirmed; client reconnect internals within `RemoteDriver` not symbol-verified)
