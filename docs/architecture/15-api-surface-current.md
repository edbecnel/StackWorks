# 15 - API Surface (Current, Stable Groups)

Status: Implemented  
Confidence: High

Related:

- [07-server-architecture-current.md](./07-server-architecture-current.md)
- [08-auth-security-roadmap.md](./08-auth-security-roadmap.md)
- [09-shared-domain-and-contracts.md](./09-shared-domain-and-contracts.md)
- [10-runtime-flows.md](./10-runtime-flows.md)

Source baseline:

- Route handlers in `server/src/app.ts`

Scope rule for this document:

- Includes only route groups that appear implemented and reasonably stable.
- Excludes dev/diagnostic/operationally volatile groups to reduce staleness.

> **Note on line snapshots:** Line snapshots in Verification Anchor blocks are convenience aids only. File paths and symbol names are the authoritative anchors. Because `server/src/app.ts` is a large monolithic route-registration hub (3000+ lines), line snapshots carry elevated drift risk and should be treated as best-effort only. Reviewers should update Verification Anchor blocks whenever route registration location or handler/service ownership changes.

## Auth Requirement Legend

- `None`: no authenticated session required.
- `Session`: authenticated account/session required.
- `Seat Capability`: requires valid `playerId` seat capability for room actions.
- `Room View Capability`: requires player seat or valid private-room watch token.

## Group A: Health and Stockfish Service Status

| Method | Path                  | Purpose                                               | Main handler file(s) | Downstream service file(s)       | Auth requirement | Current status |
| ------ | --------------------- | ----------------------------------------------------- | -------------------- | -------------------------------- | ---------------- | -------------- |
| GET    | /api/health           | Basic server liveliness check                         | `server/src/app.ts`  | None                             | None             | Implemented    |
| GET    | /api/stockfish/health | Engine health/status for integrated stockfish service | `server/src/app.ts`  | `server/src/stockfishService.ts` | None             | Implemented    |

**Verification Anchor**

- Primary source: `server/src/app.ts`
- Route registration: inline `app.get` inside `createLascaApp`
- Key service symbols: `StockfishService.getHealth`, `StockfishService.init` (`server/src/stockfishService.ts`)
- Line snapshot: L1690–L1755 (best-effort only)
- Last verified: 2026-04-01
- Confidence: **High**

## Group B: Auth and Profile Core

| Method | Path                     | Purpose                                   | Main handler file(s) | Downstream service file(s)                                                                                                         | Auth requirement     | Current status |
| ------ | ------------------------ | ----------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------- | -------------- |
| POST   | /api/auth/register       | Create account and establish session      | `server/src/app.ts`  | `server/src/auth/authStore.ts`, `server/src/auth/password.ts`, `server/src/auth/sessionStore.ts`, `server/src/auth/httpCookies.ts` | None                 | Implemented    |
| POST   | /api/auth/login          | Authenticate and establish session        | `server/src/app.ts`  | `server/src/auth/authStore.ts`, `server/src/auth/password.ts`, `server/src/auth/sessionStore.ts`, `server/src/auth/httpCookies.ts` | None                 | Implemented    |
| POST   | /api/auth/logout         | Clear session                             | `server/src/app.ts`  | `server/src/auth/sessionStore.ts`, `server/src/auth/httpCookies.ts`                                                                | Session (if present) | Implemented    |
| GET    | /api/auth/me             | Get current authenticated user (or null)  | `server/src/app.ts`  | `server/src/auth/authStore.ts`                                                                                                     | None                 | Implemented    |
| PATCH  | /api/auth/me             | Update profile fields                     | `server/src/app.ts`  | `server/src/auth/authStore.ts`                                                                                                     | Session              | In Progress    |
| PUT    | /api/auth/me/avatar      | Upload avatar bytes and update avatar URL | `server/src/app.ts`  | `server/src/auth/authStore.ts`                                                                                                     | Session              | In Progress    |
| GET    | /api/auth/avatar/:fileId | Serve stored avatar asset                 | `server/src/app.ts`  | Auth avatar filesystem under auth dir                                                                                              | None                 | Implemented    |

Note:

- `PATCH /api/auth/me` and `PUT /api/auth/me/avatar` are implemented but kept as In Progress at architecture level due broader auth hardening still in progress.

**Verification Anchor**

- Primary source: `server/src/app.ts`; `server/src/auth/authStore.ts`; `server/src/auth/sessionStore.ts`; `server/src/auth/httpCookies.ts`
- Route registration: inline `app.post`/`app.get`/`app.patch`/`app.put` inside `createLascaApp`
- Key service symbols: `createUser`, `findUserByEmail`, `findUserById`, `updateUserProfile`, `publicUser` (authStore); `SessionStore.create`, `SessionStore.delete` (sessionStore); `setCookie`, `clearCookie` (httpCookies)
- Line snapshot: L1776–L1991 (best-effort only)
- Last verified: 2026-04-01
- Confidence: **High**

## Group C: Realtime and Room Access

| Method | Path                         | Purpose                                                    | Main handler file(s) | Downstream service file(s)                                                                       | Auth requirement     | Current status |
| ------ | ---------------------------- | ---------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------ | -------------------- | -------------- |
| WS     | /api/ws                      | WebSocket realtime snapshot stream (JOIN message required) | `server/src/app.ts`  | Room state in `server/src/app.ts`                                                                | Room View Capability | Implemented    |
| GET    | /api/stream/:roomId          | SSE realtime snapshot stream                               | `server/src/app.ts`  | Room state in `server/src/app.ts`                                                                | Room View Capability | Implemented    |
| GET    | /api/room/:roomId            | Fetch latest authoritative room snapshot                   | `server/src/app.ts`  | `server/src/persistence.ts` (indirect through room lifecycle), room state in `server/src/app.ts` | Room View Capability | Implemented    |
| GET    | /api/room/:roomId/meta       | Fetch room metadata for routing/join decisions             | `server/src/app.ts`  | Room state in `server/src/app.ts`                                                                | None                 | Implemented    |
| GET    | /api/room/:roomId/watchToken | Get private-room watch token for seated player             | `server/src/app.ts`  | Room state in `server/src/app.ts`                                                                | Seat Capability      | Implemented    |

**Verification Anchor**

- Primary source: `server/src/app.ts`
- Route registration: inline `app.get` / WS upgrade inside `createLascaApp`
- Key orchestration symbols: `requireRoom`, `requireRoomView`, `queueRoomAction`, `setPresence`, `broadcastRoomSnapshot`; no distinct named per-route handler functions
- Line snapshot: omitted — Group C routes are non-contiguous in `app.ts` (interleaved with Groups D and E)
- Last verified: 2026-04-01
- Confidence: **Medium**

## Group D: Room Lifecycle and Gameplay Actions

| Method | Path                      | Purpose                                            | Main handler file(s) | Downstream service file(s)                                                                     | Auth requirement | Current status |
| ------ | ------------------------- | -------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------- | ---------------- | -------------- |
| POST   | /api/create               | Create authoritative room with initial snapshot    | `server/src/app.ts`  | `server/src/persistence.ts`, `src/shared/wireState.ts`                                         | None             | Implemented    |
| POST   | /api/join                 | Join or rejoin room and receive snapshot           | `server/src/app.ts`  | `server/src/persistence.ts`, `src/shared/wireState.ts`                                         | None             | Implemented    |
| POST   | /api/submitMove           | Apply move intent authoritatively                  | `server/src/app.ts`  | `src/game/applyMove.ts`, `server/src/persistence.ts`                                           | Seat Capability  | Implemented    |
| POST   | /api/finalizeCaptureChain | Finalize capture-chain step for supported rulesets | `server/src/app.ts`  | `src/game/damaCaptureChain.ts`, `src/game/damascaCaptureChain.ts`, `server/src/persistence.ts` | Seat Capability  | Implemented    |
| POST   | /api/endTurn              | End turn after applicable move/capture sequence    | `server/src/app.ts`  | `src/game/endTurn.ts`, `server/src/persistence.ts`                                             | Seat Capability  | Implemented    |
| POST   | /api/claimDraw            | Claim draw when allowed (e.g., threefold)          | `server/src/app.ts`  | draw/repetition logic in `server/src/app.ts`, `server/src/persistence.ts`                      | Seat Capability  | Implemented    |
| POST   | /api/offerDraw            | Offer draw                                         | `server/src/app.ts`  | draw-offer state in `server/src/app.ts`, `server/src/persistence.ts`                           | Seat Capability  | Implemented    |
| POST   | /api/respondDrawOffer     | Accept/decline pending draw offer                  | `server/src/app.ts`  | draw-offer state in `server/src/app.ts`, `server/src/persistence.ts`                           | Seat Capability  | Implemented    |
| POST   | /api/resign               | Resign and force game-over                         | `server/src/app.ts`  | game-over paths in `server/src/app.ts`, `server/src/persistence.ts`                            | Seat Capability  | Implemented    |

**Verification Anchor**

- Primary source: `server/src/app.ts`; `server/src/persistence.ts`
- Route registration: inline `app.post` inside `createLascaApp`
- Key orchestration symbols: `queueRoomAction`, `requireRoom`, `requirePlayer`, `requireRoomReady`; downstream: `applyMove`, `endTurn`, `finalizeDamaCaptureChain`, `finalizeDamascaCaptureChain`, `appendEvent`, `writeSnapshotAtomic`
- Line snapshot: omitted — Group D routes are non-contiguous in `app.ts` (interleaved with Groups C and E)
- Last verified: 2026-04-01
- Confidence: **Medium**

## Group E: Lobby, Replay, and Published Eval

| Method | Path                     | Purpose                                           | Main handler file(s) | Downstream service file(s)                            | Auth requirement     | Current status |
| ------ | ------------------------ | ------------------------------------------------- | -------------------- | ----------------------------------------------------- | -------------------- | -------------- |
| GET    | /api/lobby               | List discoverable rooms with metadata             | `server/src/app.ts`  | `server/src/persistence.ts` (persisted-room fallback) | None                 | Implemented    |
| GET    | /api/room/:roomId/replay | Read replay events for room                       | `server/src/app.ts`  | `server/src/persistence.ts`                           | Room View Capability | Implemented    |
| POST   | /api/publishEval         | Publish evaluation for current room state version | `server/src/app.ts`  | room state in `server/src/app.ts`                     | Seat Capability      | Implemented    |

**Verification Anchor**

- Primary source: `server/src/app.ts`; `server/src/persistence.ts`
- Route registration: inline `app.get`/`app.post` inside `createLascaApp`
- Key orchestration symbols: `requireRoomView`, `eventsPath`, `snapshotPath`, `computeLobbyRoomStatus`, `publishedEvalForRoom`, `broadcastRoomSnapshot`
- Line snapshot: omitted — Group E routes are non-contiguous in `app.ts` (interleaved with Groups C and D)
- Last verified: 2026-04-01
- Confidence: **Medium**

## Explicitly Omitted From Stable Surface

### Omitted: Stockfish Action Endpoints

- `POST /api/stockfish/bestmove`
- `POST /api/stockfish/evaluate`
- `POST /api/stockfish/restart`

Reason for omission:

- These are implemented and stable but omitted here to keep this document focused on routes clients consume in core game flows. See [07-server-architecture-current.md](./07-server-architecture-current.md) for the full stockfish endpoint listing.

### Omitted: Dev, Diagnostic, and Admin Routes

- `POST /api/stockfish/dev/hiccup`
- `POST /api/room/:roomId/debug`
- `DELETE /api/admin/room/:roomId`

Reason for omission:

- These are dev/diagnostic/admin-operational routes with higher policy/churn risk and are more likely to stale quickly than core runtime APIs.

## Stability Notes

- Status: In Progress
- Confidence: Medium
- Some routes in otherwise stable groups still have evolving behavior details (especially auth hardening and some multiplayer lifecycle edge-case handling).
- Keep this file synchronized with handler-level changes in `server/src/app.ts`.
