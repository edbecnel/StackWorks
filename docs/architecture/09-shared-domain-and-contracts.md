# 09 - Shared Domain and Contracts

Status: Implemented  
Confidence: High

Related:

- [05-client-architecture-current.md](./05-client-architecture-current.md)
- [07-server-architecture-current.md](./07-server-architecture-current.md)
- [10-runtime-flows.md](./10-runtime-flows.md)
- [14-variant-delta-matrix.md](./14-variant-delta-matrix.md)
- [15-api-surface-current.md](./15-api-surface-current.md)

## Shared Contracts and Types

### Online Protocol Contract

- Responsibility: Define room/action/realtime request-response shapes shared by client and server.
- Status: Implemented
- Confidence: High
- Key files/folders:
  - `src/shared/onlineProtocol.ts`
  - Client usage: `src/driver/remoteDriver.ts`, `src/indexMain.ts`
  - Server usage: `server/src/app.ts`
- Inputs:
  - Action requests (create/join/move/endTurn/resign/draw/etc.).
- Outputs:
  - Snapshot/meta/replay/eval/authored responses.
- Dependencies:
  - Wire snapshot contract and domain IDs.
- Common modification points:
  - `CreateRoomRequest`, `SubmitMoveRequest`, snapshot metadata shapes.

### Auth Protocol Contract

- Responsibility: Define register/login/me/profile payloads.
- Status: Implemented
- Confidence: High
- Key files/folders:
  - `src/shared/authProtocol.ts`
  - `server/src/app.ts`
  - `src/shared/authSessionClient.ts`
- Inputs:
  - Email/password/profile update fields.
- Outputs:
  - Auth success/error/user responses.
- Dependencies:
  - Server auth store/session middleware.
- Common modification points:
  - `AuthUser` and profile field schemas.

### Wire Snapshot Contract

- Responsibility: Serialize/deserialize game state + history for network/persistence interchange.
- Status: Implemented
- Confidence: High
- Key files/folders:
  - `src/shared/wireState.ts`
  - `server/src/persistence.ts`
  - `src/driver/remoteDriver.ts`
- Inputs:
  - In-memory state/history objects.
- Outputs:
  - Wire snapshot payloads.
- Dependencies:
  - Domain state model (`src/game/*`).
- Common modification points:
  - serialization/deserialization functions and version compatibility.

## Shared Domain Concepts (Core)

### Variant Identity and Metadata

- Responsibility: Canonical variant IDs, ruleset IDs, board sizes, entry URLs.
- Status: Implemented
- Confidence: High
- Key files/folders:
  - `src/variants/variantTypes.ts`
  - `src/variants/variantRegistry.ts`
- Inputs:
  - Variant selection and runtime boot requirements.
- Outputs:
  - Variant spec objects used by start page and game pages.
- Dependencies:
  - Page entry files and rules engines.
- Common modification points:
  - `VARIANTS` array and alias handling.

### Game State / Move Domain

- Responsibility: Represent board state, move types, turn/lifecycle data.
- Status: Implemented
- Confidence: High
- Key files/folders:
  - `src/game/state.ts`
  - `src/game/moveTypes.ts`
  - `src/game/historyManager.ts`
  - `src/game/applyMove.ts`
- Inputs:
  - Player intents and rule context.
- Outputs:
  - Next authoritative state and history entries.
- Dependencies:
  - Variant/ruleset metadata.
- Common modification points:
  - Move legality and state mutation functions.

### Presence/Identity Domain for Online Rooms

- Responsibility: Model seat ownership, player identity metadata, presence/grace states.
- Status: Implemented
- Confidence: High
- Key files/folders:
  - `src/shared/onlineProtocol.ts`
  - `server/src/app.ts`
- Inputs:
  - join/rejoin/connection/disconnection events.
- Outputs:
  - `presence`, `identity`, `identityByColor` snapshot metadata.
- Dependencies:
  - Room and transport layers.
- Common modification points:
  - Presence update helpers and snapshot response builders.

### Auth Session Client Abstraction

- Responsibility: Normalize client handling of auth token/session propagation.
- Status: Implemented
- Confidence: High
- Key files/folders:
  - `src/shared/authSessionClient.ts`
  - `src/indexMain.ts`
  - `src/driver/createDriver.ts`
- Inputs:
  - Server URL and auth payloads.
- Outputs:
  - Fetch init with auth headers/credentials and persisted session metadata.
- Dependencies:
  - Auth API contract and cookie/bearer behavior on server.
- Common modification points:
  - Token persistence and request initialization helpers.

## Shared Abstractions Between Client and Server

- Shared rules code imported server-side from `src/game/*` to preserve authoritative determinism.
- Shared protocol types imported on both sides from `src/shared/*`.
- Shared variant IDs/types consumed by launcher, pages, and server room metadata.

## Mapping Summary

- Contracts: `src/shared/onlineProtocol.ts`, `src/shared/authProtocol.ts`, `src/shared/wireState.ts`
- Domain: `src/game/*`, `src/variants/*`
- Client adapters: `src/driver/*`, `src/shared/authSessionClient.ts`
- Server adapters: `server/src/app.ts`, `server/src/persistence.ts`, `server/src/auth/*`
