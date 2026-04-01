# 07 - Server Architecture (Current)

Status: Implemented  
Confidence: High

Related:

- [03-container-view-current.md](./03-container-view-current.md)
- [08-auth-security-roadmap.md](./08-auth-security-roadmap.md)
- [10-runtime-flows.md](./10-runtime-flows.md)
- [15-api-surface-current.md](./15-api-surface-current.md)

## Main Server-side Subsystems

### HTTP API Layer

- Responsibility: Expose room/auth/admin/stockfish/replay endpoints.
- Status: Implemented
- Confidence: High
- Key files/folders:
  - `server/src/app.ts`
- Inputs:
  - HTTP JSON requests.
- Outputs:
  - JSON responses and errors.
- Dependencies:
  - Room state subsystem, auth/session subsystem, persistence subsystem.
- Common modification points:
  - Route handlers in `server/src/app.ts`.

### Realtime Layer (WS + SSE)

- Responsibility: Push authoritative snapshots and lifecycle updates to clients.
- Status: Implemented
- Confidence: High
- Key files/folders:
  - `server/src/app.ts` (`/api/ws`, `/api/stream/:roomId`)
- Inputs:
  - WS JOIN messages, active room updates.
- Outputs:
  - `snapshot` events over WS/SSE.
- Dependencies:
  - Room mutation queue and snapshot payload builders.
- Common modification points:
  - WS connection handlers, SSE stream registration/cleanup.

### Room Domain Logic + Concurrency Control

- Responsibility: Validate and apply move-like requests against authoritative room state.
- Status: Implemented
- Confidence: High
- Key files/folders:
  - `server/src/app.ts`
  - Shared rules imported from `src/game/*`
- Inputs:
  - `submitMove`, `finalizeCaptureChain`, `endTurn`, draw/resign actions.
- Outputs:
  - Updated room state/history/stateVersion.
- Dependencies:
  - `expectedStateVersion` CAS checks, per-room `actionChain` serialization.
- Common modification points:
  - `queueRoomAction`, mutation handlers, stateVersion checks.
- Note:
  - `queueRoomAction` serializes actions onto the Room's `actionChain` promise chain; both terms refer to the same concurrency mechanism.

### Persistence Subsystem

- Responsibility: Persist snapshots and append-only events; restore rooms on demand.
- Status: Implemented
- Confidence: High
- Key files/folders:
  - `server/src/persistence.ts`
  - `server/src/app.ts` (queue/persist integration)
- Inputs:
  - Post-mutation room state and metadata.
- Outputs:
  - `<roomId>.snapshot.json`, `<roomId>.events.jsonl`.
- Dependencies:
  - `LASCA_DATA_DIR` or default path resolution.
- Common modification points:
  - Snapshot schema, replay load rules, event emission points.

### Auth/Profile Subsystem

- Responsibility: Email/password registration/login, profile updates, avatar upload/serving.
- Status: In Progress
- Confidence: High
- Key files/folders:
  - `server/src/app.ts` (`/api/auth/*` routes)
  - `server/src/auth/authStore.ts`
  - `server/src/auth/password.ts`
  - `server/src/auth/sessionStore.ts`
- Inputs:
  - Auth and profile HTTP requests.
- Outputs:
  - User records, session cookies/tokens, avatar file URLs.
- Dependencies:
  - File-backed auth store and in-memory sessions.
- Common modification points:
  - Session policy, auth middleware, profile validation.

### Stockfish Integration Subsystem

- Responsibility: Engine-backed bestmove/evaluate APIs from online server process.
- Status: Implemented
- Confidence: High
- Key files/folders:
  - `server/src/stockfishService.ts`
  - `server/src/app.ts` (`/api/stockfish/*` routes)
- Inputs:
  - FEN/movetime/eval requests.
- Outputs:
  - Move/eval responses or health states.
- Dependencies:
  - Stockfish engine JS availability.
- Common modification points:
  - Engine startup/retry/timeout policy.

## API Layers and Endpoints (Current)

Status: Implemented  
Confidence: High

Major endpoint groups in `server/src/app.ts`:

- Health: `/api/health`
- Stockfish: `/api/stockfish/health`, `/api/stockfish/bestmove`, `/api/stockfish/evaluate`, `/api/stockfish/restart`
- Auth: `/api/auth/register`, `/login`, `/logout`, `/me`, `/me/avatar`
- Admin: `DELETE /api/admin/room/:roomId`
- Online transport: `/api/stream/:roomId`, `/api/ws`
- Online room lifecycle: `/api/create`, `/api/join`, `/api/lobby`, `/api/room/:roomId`, `/meta`, `/watchToken`, `/replay`
- Online gameplay actions: `/api/submitMove`, `/api/finalizeCaptureChain`, `/api/endTurn`, `/api/claimDraw`, `/api/offerDraw`, `/api/respondDrawOffer`, `/api/resign`, `/api/publishEval`

## Request Lifecycle (Simplified)

Status: Implemented  
Confidence: High

1. Request enters Express route in `server/src/app.ts`.
2. Room lookup/load resolves current room state (`requireRoom`).
3. For mutating actions, work is serialized by per-room action queue.
4. Validation checks seat ownership, turn/rules, and optional CAS version.
5. Shared rules/domain logic applies the mutation.
6. StateVersion increments; persistence queued (event + snapshot).
7. Updated snapshot broadcast to WS/SSE clients.
8. HTTP response returns authoritative snapshot metadata.

## Where To Look When...

- Desync/stale request issues: `server/src/app.ts` CAS checks and `src/driver/remoteDriver.ts` gap/resync logic.
- Room missing after restart: `server/src/persistence.ts` load/replay paths.
- Presence/disconnect timeout issues: grace/presence logic in `server/src/app.ts`.
- Auth login/profile issues: `server/src/auth/*` + auth routes in `server/src/app.ts`.
- Replay/log problems: replay endpoint + event file parsing in `server/src/app.ts` and `server/src/persistence.ts`.

## Missing or Incomplete Production Capabilities

### Persistent session store across restarts

- Status: In Progress
- Confidence: High
- Evidence: `server/src/auth/sessionStore.ts` is in-memory.

### Broader endpoint abuse controls and observability depth

- Status: In Progress
- Confidence: Medium
- Evidence: basic auth rate limiting exists; full-system structured controls not clearly complete.

### Full account-seat ownership constraints (cross-session edge cases)

- Status: Planned
- Confidence: Medium
- Evidence: checklist contains open MP4D items.
