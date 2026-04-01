# 18 - Quick Triage Guide (Companion)

Status: Implemented  
Confidence: High

Related:

- [16-feature-to-code-index.md](./16-feature-to-code-index.md)
- [10-runtime-flows.md](./10-runtime-flows.md)
- [11-code-map.md](./11-code-map.md)
- [12-refactor-hotspots.md](./12-refactor-hotspots.md)
- [13-risks-tech-debt-and-gaps.md](./13-risks-tech-debt-and-gaps.md)
- [15-api-surface-current.md](./15-api-surface-current.md)

Purpose:

- Fast-scanning troubleshooting shortcut for maintainers.
- Does not replace [16-feature-to-code-index.md](./16-feature-to-code-index.md), which remains source of truth.

## Use in Under 5 Minutes

1. Find the closest symptom category below.
2. Open `Start here first` files immediately.
3. If unresolved in 5 minutes, jump to linked section in [16-feature-to-code-index.md](./16-feature-to-code-index.md).
4. For route/transport confusion, cross-check [15-api-surface-current.md](./15-api-surface-current.md) and [10-runtime-flows.md](./10-runtime-flows.md).
5. If ownership changed materially, update [16-feature-to-code-index.md](./16-feature-to-code-index.md) first, then this file.

## Fast Triage Map

<a id="table-18-1"></a>

Table cross-reference: [Rendered table view](./tables-only.html#table-18-1)

| Symptom Category         | Start Here First                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| App fails to start       | `src/indexMain.ts`, `src/driver/createDriver.ts`, variant `src/*Main.ts`                  |
| UI looks wrong/partial   | `src/ui/shell/gameShell.ts`, `src/ui/panelLayoutMode.ts`, `src/render/boardViewport.ts`   |
| Input/interaction broken | `src/controller/gameController.ts`, `src/ui/holdDrag.ts`, `src/ui/gameShortcuts.ts`       |
| Move/action fails        | `src/controller/gameController.ts`, `src/game/applyMove.ts`, `server/src/app.ts`          |
| Desync/reconnect issues  | `src/driver/remoteDriver.ts`, `server/src/app.ts`, `src/shared/wireState.ts`              |
| API route behavior wrong | `server/src/app.ts`, `src/shared/onlineProtocol.ts`, `src/shared/authProtocol.ts`         |
| Auth/session issues      | `server/src/auth/sessionStore.ts`, `server/src/app.ts`, `src/shared/authSessionClient.ts` |

## Triage Entries

### App fails to start

- Symptom/problem category: page boot fails, blank screen, or startup crash.
- Status: Implemented (startup), In Progress (shell migration surface).
- Confidence: High.
- Start here first: `src/indexMain.ts`, `src/driver/createDriver.ts`, variant `src/*Main.ts`.
- Then inspect: `src/variants/variantRegistry.ts`, `vite.config.ts`, `src/ui/shell/gameShell.ts`.
- Related docs: [16-feature-to-code-index.md](./16-feature-to-code-index.md#game-session-lifecycle), [10-runtime-flows.md](./10-runtime-flows.md#flow-app-startup), [11-code-map.md](./11-code-map.md).
- Stability/refactor note: core path is stable; shell/layout startup branches are under transition.

### Client UI looks wrong or partially broken

- Symptom/problem category: panels missing, wrong layout, wrong visual state.
- Status: In Progress (shell-related areas), otherwise Implemented.
- Confidence: High.
- Start here first: `src/ui/shell/gameShell.ts`, `src/ui/panelLayoutMode.ts`, `src/render/renderGameState.ts`.
- Then inspect: `src/ui/shell/appShell.ts`, `src/ui/shell/playHub.ts`, `src/render/boardViewport.ts`.
- Related docs: [16-feature-to-code-index.md](./16-feature-to-code-index.md#board-rendering--ui), [12-refactor-hotspots.md](./12-refactor-hotspots.md), [13-risks-tech-debt-and-gaps.md](./13-risks-tech-debt-and-gaps.md#r2-transitional-ui-paths-increase-divergence-risk).
- Stability/refactor note: shell/legacy coexistence is a known regression hotspot.

### Input handling/interactions are broken

- Symptom/problem category: clicks/drag/shortcuts do nothing or trigger wrong action.
- Status: Implemented.
- Confidence: Medium.
- Start here first: `src/controller/gameController.ts`.
- Then inspect: `src/ui/holdDrag.ts`, `src/ui/gameShortcuts.ts`, `server/src/app.ts` (online submit path).
- Related docs: [16-feature-to-code-index.md](./16-feature-to-code-index.md#input-handling), [10-runtime-flows.md](./10-runtime-flows.md#flow-executing-a-moveaction-online).
- Stability/refactor note: behavior is stable but ownership is spread across controller + UI helpers.

### Board rendering issues

- Symptom/problem category: pieces/overlays/board viewport render incorrectly.
- Status: Implemented.
- Confidence: High.
- Start here first: `src/render/renderGameState.ts`, `src/render/overlays.ts`.
- Then inspect: `src/render/boardViewport.ts`, `src/render/renderStackAtNode.ts`, variant `src/*Main.ts` render wiring.
- Related docs: [16-feature-to-code-index.md](./16-feature-to-code-index.md#board-rendering--ui), [11-code-map.md](./11-code-map.md).
- Stability/refactor note: rendering core is stable; viewport/shell interactions may regress during UI refactors.

### Move/action execution issues

- Symptom/problem category: move submit fails, capture/end-turn flow breaks, action rejected.
- Status: Implemented.
- Confidence: High.
- Start here first: `src/controller/gameController.ts`, `src/driver/remoteDriver.ts`, `server/src/app.ts`.
- Then inspect: `src/game/applyMove.ts`, `src/game/endTurn.ts`, `server/src/persistence.ts`.
- Related docs: [16-feature-to-code-index.md](./16-feature-to-code-index.md#move-validation--rules), [10-runtime-flows.md](./10-runtime-flows.md#flow-executing-a-moveaction-online), [15-api-surface-current.md](./15-api-surface-current.md#group-d-room-lifecycle-and-gameplay-actions).
- Stability/refactor note: stable core; stale-version and queue/order edges are typical breakpoints.

### Rules/validation issues

- Symptom/problem category: legal move rejected, illegal move accepted, variant rule mismatch.
- Status: Implemented.
- Confidence: High.
- Start here first: `src/game/movegen.ts`, `src/game/applyMove.ts`.
- Then inspect: variant files like `src/game/movegenDama.ts`, `src/game/movegenColumnsChess.ts`, `src/game/damascaCaptureChain.ts`, `src/game/internationalDraughtsDraw.ts`.
- Related docs: [16-feature-to-code-index.md](./16-feature-to-code-index.md#move-validation--rules), [14-variant-delta-matrix.md](./14-variant-delta-matrix.md).
- Stability/refactor note: shared core is stable; variant-specific rule modules are the primary drift surface.

### Client-server synchronization issues

- Symptom/problem category: stateVersion gaps, out-of-order updates, forced resync loops.
- Status: Implemented (active hardening).
- Confidence: Medium-High.
- Start here first: `src/driver/remoteDriver.ts`.
- Then inspect: `server/src/app.ts`, `src/shared/wireState.ts`, `server/src/persistence.ts`.
- Related docs: [16-feature-to-code-index.md](./16-feature-to-code-index.md#client-server-synchronization), [10-runtime-flows.md](./10-runtime-flows.md#flow-client-server-synchronization--resync), [15-api-surface-current.md](./15-api-surface-current.md#group-c-realtime-and-room-access).
- Stability/refactor note: stable overall; transport fallback and ordering edges drift fastest.

### Multiplayer/realtime issues

- Symptom/problem category: presence wrong, grace timeout wrong, reconnect inconsistencies.
- Status: Implemented (active hardening).
- Confidence: Medium.
- Start here first: `server/src/app.ts` presence/grace logic.
- Then inspect: `src/driver/remoteDriver.ts`, room view/capability checks in `server/src/app.ts`.
- Related docs: [16-feature-to-code-index.md](./16-feature-to-code-index.md#realtime--multiplayer), [10-runtime-flows.md](./10-runtime-flows.md#flow-reconnect--grace--timeout), [13-risks-tech-debt-and-gaps.md](./13-risks-tech-debt-and-gaps.md#r5-transport-complexity-wsssepolling-increases-edge-case-surface).
- Stability/refactor note: edge-case churn is expected due to transport complexity.

### API/route handling issues

- Symptom/problem category: endpoint returns wrong shape/status or auth gate seems wrong.
- Status: Implemented.
- Confidence: High.
- Start here first: `server/src/app.ts`.
- Then inspect: `src/shared/onlineProtocol.ts`, `src/shared/authProtocol.ts`, `server/src/auth/*`.
- Related docs: [16-feature-to-code-index.md](./16-feature-to-code-index.md#authsecurity-integration-points-current-and-planned), [15-api-surface-current.md](./15-api-surface-current.md), [11-code-map.md](./11-code-map.md).
- Stability/refactor note: route surface is stable, but handler internals in monolithic `server/src/app.ts` can drift quickly.

### Session/load/resume issues

- Symptom/problem category: join/rejoin fails, room resume mismatch, saved online context ignored.
- Status: Implemented.
- Confidence: High.
- Start here first: `src/indexMain.ts`, `src/driver/createDriver.ts`, `src/driver/remoteDriver.ts`.
- Then inspect: `src/shared/onlineResumeStorage.ts`, `src/shared/onlineResumeMatching.ts`, `server/src/app.ts`.
- Related docs: [16-feature-to-code-index.md](./16-feature-to-code-index.md#game-session-lifecycle), [10-runtime-flows.md](./10-runtime-flows.md#flow-loading-an-online-gamesession).
- Stability/refactor note: flow is stable; launcher state ownership and resume matching are medium-drift seams.

### Variant-specific behavior issues

- Symptom/problem category: wrong variant launches or variant logic/UI does not match expected behavior.
- Status: Implemented.
- Confidence: High.
- Start here first: `src/variants/variantRegistry.ts`, `src/indexMain.ts`, target variant `src/*Main.ts`.
- Then inspect: variant `src/game/movegen*.ts` and `src/game/applyMove*.ts`.
- Related docs: [16-feature-to-code-index.md](./16-feature-to-code-index.md#variant-specific-behavior), [14-variant-delta-matrix.md](./14-variant-delta-matrix.md), [11-code-map.md](./11-code-map.md).
- Stability/refactor note: registry is stable; bootstrap duplication means per-variant startup drift is possible.

### Bot/AI integration issues

- Symptom/problem category: local bot hangs/plays poorly, or stockfish endpoint path fails.
- Status: Implemented.
- Confidence: High.
- Start here first: `src/bot/chessBotManager.ts` or `src/bot/columnsChessBotManager.ts` (client bot path), `server/src/stockfishService.ts` (server engine path).
- Then inspect: `src/bot/httpEngine.ts`, `src/bot/stockfishEngine.ts`, stockfish routes in `server/src/app.ts`.
- Related docs: [16-feature-to-code-index.md](./16-feature-to-code-index.md#botai-integration), [15-api-surface-current.md](./15-api-surface-current.md#group-a-health-and-stockfish-service-status).
- Stability/refactor note: core integration is stable; service availability and adapter behavior are common failure points.

### Persistence/storage/config issues

- Symptom/problem category: replay missing, room state not durable, restart loses expected state.
- Status: Implemented.
- Confidence: High.
- Start here first: `server/src/persistence.ts`.
- Then inspect: `server/src/app.ts`, `src/shared/wireState.ts`, deployment/env settings in `render.yaml`.
- Related docs: [16-feature-to-code-index.md](./16-feature-to-code-index.md#persistencestorage), [10-runtime-flows.md](./10-runtime-flows.md), [13-risks-tech-debt-and-gaps.md](./13-risks-tech-debt-and-gaps.md#r6-opsdeployment-coupling-to-filesystem-and-single-instance-constraints).
- Stability/refactor note: persistence logic is stable; operational environment coupling is a known risk.

### Refactor-related regressions

- Symptom/problem category: behavior differs between shell mode and legacy paths or after UI refactor changes.
- Status: In Progress.
- Confidence: High.
- Start here first: `src/ui/shell/gameShell.ts`, `src/ui/panelLayoutMode.ts`, `src/indexMain.ts`.
- Then inspect: `src/ui/shell/appShell.ts`, `src/ui/shell/playHub.ts`, `src/config/shellState.ts`.
- Related docs: [16-feature-to-code-index.md](./16-feature-to-code-index.md#refactor-in-progress-ui-areas), [12-refactor-hotspots.md](./12-refactor-hotspots.md), [13-risks-tech-debt-and-gaps.md](./13-risks-tech-debt-and-gaps.md#r2-transitional-ui-paths-increase-divergence-risk).
- Stability/refactor note: explicitly high-drift until shell migration converges.

### Auth/security placeholder integration issues

- Symptom/problem category: session volatility, auth context mismatch, capability gate confusion.
- Status: Implemented with planned hardening gaps.
- Confidence: High for current state, Medium for roadmap direction.
- Start here first: `server/src/app.ts`, `server/src/auth/sessionStore.ts`, `src/shared/authSessionClient.ts`.
- Then inspect: `server/src/auth/authStore.ts`, `server/src/auth/httpCookies.ts`, `server/src/auth/rateLimit.ts`.
- Related docs: [16-feature-to-code-index.md](./16-feature-to-code-index.md#authsecurity-integration-points-current-and-planned), [08-auth-security-roadmap.md](./08-auth-security-roadmap.md), [15-api-surface-current.md](./15-api-surface-current.md#group-b-auth-and-profile-core).
- Stability/refactor note: current behavior is clear; durable sessions and broader abuse controls are still evolving.

## High-Drift Areas

- `server/src/app.ts` route orchestration internals (large monolithic module).
- `src/ui/shell/*` + `src/ui/panelLayoutMode.ts` (active shell/legacy transition).
- `src/indexMain.ts` plus `src/config/shellState.ts` (launcher vs shell state ownership seam).
- `src/driver/remoteDriver.ts` transport fallback/resync internals.
- `server/src/auth/sessionStore.ts` (in-memory session durability gap under active hardening roadmap).

## Maintenance Reminder

- This guide is intentionally short and operational.
- If code ownership or primary entry points change, update [16-feature-to-code-index.md](./16-feature-to-code-index.md) first, then sync this guide.
