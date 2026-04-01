# 08 - Auth & Security Roadmap

Status: In Progress  
Confidence: High

Related:

- [07-server-architecture-current.md](./07-server-architecture-current.md)
- [13-risks-tech-debt-and-gaps.md](./13-risks-tech-debt-and-gaps.md)
- [docs/multiplayer-checklist.md](../multiplayer-checklist.md)

## CURRENT Auth/Security State (Code-visible)

### Account Registration/Login

- Responsibility: Email/password registration and login.
- Status: Implemented
- Confidence: High
- Key files/folders:
  - `server/src/app.ts` (`/api/auth/register`, `/api/auth/login`)
  - `server/src/auth/password.ts`
  - `server/src/auth/authStore.ts`
  - `src/shared/authProtocol.ts`
- Inputs:
  - Email/password (+ optional profile metadata).
- Outputs:
  - Auth response with user profile and session token/cookie.
- Dependencies:
  - File-based user store, password hash verify/hash.
- Common modification points:
  - Input validation and credential flow in auth routes.

### Session Handling

- Responsibility: Attach auth identity using cookie or bearer token extraction.
- Status: Implemented
- Confidence: High
- Key files/folders:
  - `server/src/app.ts` session middleware
  - `server/src/auth/sessionStore.ts`
  - `server/src/auth/httpCookies.ts`
- Inputs:
  - `lasca.sid` cookie or bearer token.
- Outputs:
  - `(req as any).auth` identity context.
- Dependencies:
  - In-memory session store.
- Common modification points:
  - Cookie options and session lifecycle.

### Profile + Avatar

- Responsibility: Update profile fields and upload/serve avatar images.
- Status: Implemented
- Confidence: High
- Key files/folders:
  - `server/src/app.ts` (`PATCH /api/auth/me`, `PUT /api/auth/me/avatar`, `GET /api/auth/avatar/:fileId`)
  - `server/src/auth/authStore.ts`
- Inputs:
  - Display name/country/time zone/avatar bytes.
- Outputs:
  - Updated user profile and avatar URL.
- Dependencies:
  - Auth directory + avatar file storage.
- Common modification points:
  - Validation rules and content-type guards.

### Seat Capability Security for Online Rooms

- Responsibility: Gate move-like room actions by seat capability (`playerId`) and private-room viewing by `watchToken`.
- Status: Implemented
- Confidence: High
- Key files/folders:
  - `server/src/app.ts`
  - `src/shared/onlineProtocol.ts`
- Inputs:
  - `playerId` / `watchToken` access values.
- Outputs:
  - Authorized or rejected room actions/views.
- Dependencies:
  - Random token generation via secure random helpers.
- Common modification points:
  - `requirePlayer`, `requireRoomView`, token generation points.

## What Is Missing / Incomplete

### Persistent session durability and advanced session management

- Status: In Progress
- Confidence: High
- Evidence:
  - Session store is process memory (`server/src/auth/sessionStore.ts`).
- Risks:
  - Server restart logs out all users.

### Broader abuse controls across gameplay endpoints

- Status: Planned
- Confidence: Medium
- Evidence:
  - Auth limiter exists; broader throttling strategy is not explicit in routes/docs.
- Risks:
  - Potential request flooding on non-auth endpoints.

### Strong account-seat ownership model across devices/tabs

- Status: Planned
- Confidence: Medium
- Evidence:
  - Open MP4D checklist items in `docs/multiplayer-checklist.md`.
- Risks:
  - Edge-case confusion around seat control semantics.

### Formalized security observability and incident-ready logging model

- Status: Planned
- Confidence: Low
- Evidence:
  - Request logs exist, but structured security telemetry architecture is not explicit.

## Existing Placeholders / Seams / Preparatory Abstractions

- Cookie security decision helper in `getAuthCookieOptions` (`server/src/app.ts`).
- Session client abstraction in `src/shared/authSessionClient.ts`.
- Auth protocol contracts in `src/shared/authProtocol.ts`.
- Guest identity + account metadata coexistence in online identity fields (`src/shared/onlineProtocol.ts`).

## Security-sensitive Boundaries

- Browser <-> `/api/auth/*` (credential/session boundary).
- Browser <-> move-like `/api/*` room mutation endpoints.
- Private-room spectator boundary (`watchToken`).
- Filesystem persistence boundary (`LASCA_DATA_DIR` and auth dir).
- Admin delete endpoint boundary (`LASCA_ADMIN_TOKEN`).

## Risks Caused By Current Incompleteness

- Session volatility after restart (medium severity).
- Potentially inconsistent authorization semantics if seat/account linkage remains partial (medium severity).
- Operational mistakes around admin token handling and deployment env setup (medium severity).
- Incomplete anti-abuse coverage for non-auth paths (medium severity).

## Recommended Target Notes (Only Where Repo Direction Supports It)

### Target Note 1: Keep server-authoritative room model and strengthen auth around it

- Status: Planned
- Confidence: High
- Supported by:
  - Current authoritative move pipeline and multiplayer checklist direction.

### Target Note 2: Evolve session store from in-memory to durable backend

- Status: Planned
- Confidence: Medium
- Supported by:
  - Current in-memory limitation and production-oriented checklist themes.

### Target Note 3: Expand rate limiting and abuse controls beyond auth endpoints

- Status: Planned
- Confidence: Medium
- Supported by:
  - Existing auth limiter abstraction can be extended.

## TODOs

- TODO: confirm long-term session backend choice.
- TODO: define explicit threat model and endpoint-by-endpoint abuse policy.
- TODO: document account-to-seat ownership rules when finalized.
