# StackWorks UI Shell Refactor

> **Goal:** Refactor StackWorks UI into a professional modern product shell, while preserving the current multi-page Vite architecture, shared game logic, and existing offline/online functionality.

---

## Constraints

- [ ] Do NOT rewrite game engines, renderers, or online server flows
- [ ] Do NOT convert the whole app to a SPA
- [ ] Keep current per-game entry pages and shared TS modules
- [ ] Build a reusable shell/navigation layer around existing pages
- [ ] Preserve current offline mode, online rooms, lobby, rejoin, spectate, bot, and settings behavior

---

## Architecture Reference

- [ ] Confirm Vite + TypeScript multi-HTML-entry-point setup is unchanged
- [ ] Confirm shared modules under `src/controller`, `src/game`, `src/render`, `src/ui`, `src/theme`, `src/driver`, `src/variants` are preserved
- [ ] Confirm online server under `server/` retains rooms, persistence, presence, replay/snapshots, auth/profile/avatar, and disconnect grace
- [ ] Confirm `stockfish-server/` chess bot support is untouched

---

## Primary UX Target

Global product shell with a polished competitive board-game feel:

- [ ] Top-left branded logo
- [ ] Left global nav
- [ ] Selected-game left nav
- [ ] Right-side content/action panel
- [ ] Hover flyouts on desktop
- [ ] Drawer behavior on mobile
- [ ] After game selection, show that game's own navigation/options

---

## Deliverable 1 — File-by-File Implementation Plan

### New files to create

- [ ] `src/config/appShellConfig.ts` — global shell configuration (nav items, game registry, feature flags)
- [ ] `src/ui/shell/appShell.ts` — top-level shell layout mount: logo, left rail, right panel, main content slot
- [ ] `src/ui/shell/gameShell.ts` — per-game sub-shell: breadcrumb/title, game nav, game action area
- [ ] `src/ui/shell/playHub.ts` — Play hub layout: tab bar + panel switcher for Online/Bots/Coach/Friend/Tournaments/Variants
- [ ] `src/ui/navigation/flyoutMenu.ts` — desktop hover flyout menu component
- [ ] `src/ui/navigation/tabs.ts` — reusable tab bar component
- [ ] `src/ui/branding/logo.ts` — logo component referencing `public/icons/` SVG assets by placement context
  - `stackworks-logo-horizontal.svg` — desktop top-left header (default brand asset)
  - `stackworks-logo-icon.svg` — mobile header, collapsed sidebar, favicon, browser tab, app icon base
  - `stackworks-wordmark.svg` — mobile header (if space allows, alongside icon), footer, simple text branding
  - `stackworks-logo-mono.svg` — one-color, fallback, print, and theme-conflict cases
  - Rules: size with CSS only · preserve aspect ratio · do not stretch · never use horizontal logo in narrow spaces
- [ ] `src/ui/player/playerIdentityPanel.ts` — player name + avatar panel; layout adapts to viewport aspect ratio:
  - **Portrait / narrow (mobile, tablet upright):** panels stack above and below the board
  - **Landscape / wide (desktop, tablet sideways):** panels sit to the left and right of the board
- [ ] `src/ui/player/playerAvatar.ts` — avatar image with guest/bot fallback
- [ ] `src/ui/player/playerStatusBadge.ts` — online/offline/reconnecting presence badge

### Existing files to update

- [ ] `src/index.html` / `src/indexMain.ts` — mount app shell, add game selection home experience
- [ ] `src/chess.html` / `src/chessMain.ts` — mount game shell, add player identity panels
- [ ] `src/columnsChess.html` / `src/columnsChessMain.ts` — mount game shell, add player identity panels
- [ ] `src/dama.html` / `src/damaMain.ts` — mount game shell, add player identity panels
- [ ] `src/lasca.html` / `src/lasca8x8.html` / `src/lasca8x8Main.ts` — mount game shell, add player identity panels
- [ ] `src/damasca.html` / `src/damascaMain.ts` — mount game shell, add player identity panels
- [ ] `src/main.ts` — shared entry bootstrap, shell init hook
- [ ] `src/types.ts` — add `PlayerIdentity`, `PresenceState`, `ShellConfig` types
- [ ] `src/config/` — extend with shell/nav/game registry config

---

## Deliverable 2 — Exact Files to Create / Update

> See Deliverable 1 above. Each checkbox maps to one file action.

---

## Deliverable 3 — UI State Model

- [ ] Define `ShellState`: `{ activeGame: GameId | null, activeSection: GlobalSection, gameSection: GameSection | null }`
- [ ] Define `GlobalSection` enum: `Home | Games | Community | Account | Settings`
- [ ] Define `GameSection` enum: `Play | Learn | Watch | History | Rules | Customize | Online`
- [ ] Define `PlaySubSection` enum: `Online | Bots | Coach | Friend | Tournaments | Variants`
- [ ] Define `PlayerIdentity` type: `{ id: string, displayName: string, avatarUrl: string | null, side: 'local' | 'remote' | 'spectator', presenceState: PresenceState, rating?: number, isBot?: boolean, isFallback?: boolean }`
- [ ] Define `PresenceState` enum: `Online | Offline | Reconnecting | Waiting`
- [ ] Wire `ShellState` to `localStorage` for persistence across page navigations
- [ ] Feed `PlayerIdentity` from current match/session state (not hardcoded labels)
- [ ] Do NOT use "White"/"Black" as primary player labels — use actual display names first, side/color secondarily

---

## Deliverable 4 — Routing / Page-Mount Plan

- [ ] Keep each existing HTML entry point as its own Vite entry (no SPA conversion)
- [ ] Shell mounts via a lightweight `initAppShell()` call in each page's `*Main.ts`
- [ ] Shell reads `ShellState` from `localStorage` / URL param on mount to restore active game + section
- [ ] Page transitions remain standard `<a href>` navigations (no client-side router needed)
- [ ] `appShell.ts` injects the left rail + header DOM before the existing page content container
- [ ] `gameShell.ts` wraps existing board/game container inside the game sub-shell DOM
- [ ] Player identity panels are injected above/below (portrait) or left/right (landscape) of the board container by `gameShell.ts`
  - [ ] Use CSS `@media (orientation: portrait)` / `(orientation: landscape)` or container queries to switch layout axis
  - [ ] Panel position must update dynamically if the device is rotated mid-session
- [ ] Right-side action panel slot is populated by each page's own logic (preserving existing settings/online UI)

---

## Deliverable 5 — Phased Task Checklist

---

### Phase 1 — Reusable Shell Layout

- [ ] Create `src/config/appShellConfig.ts` with global nav items and game registry
- [ ] Create `src/ui/branding/logo.ts` — logo component referencing `public/icons/` SVG assets
  - [ ] Expose `LogoVariant` type: `'horizontal' | 'icon' | 'wordmark' | 'mono'`
  - [ ] Placement rules baked into component defaults:
    - [ ] Desktop top-left header → `stackworks-logo-horizontal.svg`
    - [ ] Mobile header → `stackworks-logo-icon.svg`; optionally `stackworks-wordmark.svg` alongside if space allows
    - [ ] Collapsed sidebar / compact nav → `stackworks-logo-icon.svg`
    - [ ] Favicon / browser tab / app icon base → `stackworks-logo-icon.svg`
    - [ ] Footer / simple text branding → `stackworks-wordmark.svg`
    - [ ] One-color / fallback / print / theme-conflict → `stackworks-logo-mono.svg`
  - [ ] Size with CSS only; never hardcode `width`/`height` attributes
  - [ ] Preserve aspect ratio on all variants; do not stretch
  - [ ] Never use horizontal logo in narrow/tight spaces
  - [ ] All placements use `<img>` or inline `<svg>`; do not rasterize
- [ ] Create `src/ui/shell/appShell.ts` — left rail + header + main content slot + right panel slot
  - [ ] Responsive left rail (collapsed icon-only on mobile)
  - [ ] Brand/logo slot in top-left
  - [ ] Global nav items: Home, Games, Community, Account, Settings
  - [ ] Hover flyouts on desktop (`flyoutMenu.ts`)
  - [ ] Drawer/overlay behavior on mobile
- [ ] Create `src/ui/navigation/flyoutMenu.ts` — desktop hover flyout component
- [ ] Create `src/ui/navigation/tabs.ts` — reusable tab bar component
- [ ] Mount `appShell.ts` on the start/index page first
  - [ ] Confirm existing launch behavior (offline/online/lobby) is unbroken
- [ ] Add selected-game header / breadcrumb / title area to `appShell.ts`

**Player Identity — Phase 1 (included in first professional UI pass, not deferred):**

- [ ] Create `src/ui/player/playerAvatar.ts`
  - [ ] Guest/default avatar fallback
  - [ ] Bot identity avatar/card
- [ ] Create `src/ui/player/playerStatusBadge.ts`
  - [ ] States: Online, Offline, Reconnecting, Waiting for opponent
- [ ] Create `src/ui/player/playerIdentityPanel.ts`
  - [ ] Shows: avatar, display name, side/color indicator (secondary), presence badge
  - [ ] **Portrait / narrow viewport:** stack one panel above the board, one below
  - [ ] **Landscape / wide viewport:** place one panel to the left of the board, one to the right (mirrors laptop/monitor layout)
  - [ ] Switch triggered by CSS `@media (orientation: landscape)` / `(orientation: portrait)` or container query on the board wrapper
  - [ ] Layout must update dynamically on device rotation without a page reload
  - [ ] Orientation-aware: panels stay visually attached to correct board side when board flips
  - [ ] Clocks, captured pieces, and status indicators align with same player panel in both orientations
  - [ ] Empty/fallback states: "Waiting for opponent", guest avatar, bot card
  - [ ] Future-ready slots: rating, country flag, verification/premium badge, profile card click
- [ ] Integrate `playerIdentityPanel.ts` into `gameShell.ts`
  - [ ] Feed from current match/session state for all game types
  - [ ] Works for: live online games, play-vs-friend, bot games, spectating, replay/history
  - [ ] Rendering is independent from game rules (works for Chess, Columns Chess, Dama, Lasca, Damasca, etc.)

---

### Phase 2 — Game-First Home Experience

- [ ] Create `src/ui/shell/gameShell.ts` — per-game sub-shell wrapping existing board container
  - [ ] Breadcrumb / game title
  - [ ] Per-game left nav section (Play, Learn, Watch, History, Rules, Customize, Online)
  - [ ] Right-side action panel slot
  - [ ] Inject player identity panels above/below board
- [ ] Replace current start/index page with game-first home experience:
  - [ ] Game selection cards (one per game: Chess, Columns Chess, Dama, Lasca, etc.)
  - [ ] Selected game summary panel
  - [ ] Play action cards on the right
  - [ ] Preserve all current launch settings (time control, color, variant options)
  - [ ] Preserve all current online options (lobby, create room, join room, guest flow)
- [ ] Keep existing `localStorage` data sources and behavior working
- [ ] Wire `ShellState.activeGame` on game card selection

---

### Phase 3 — Play Hub with Tabs

- [ ] Create `src/ui/shell/playHub.ts` — Play hub layout with tab bar + panel switcher
- [ ] Add tabs: Online, Bots, Coach, Friend, Tournaments, Variants
  - [ ] **Online tab** — wire to existing online lobby/room flow
  - [ ] **Bots tab** — wire to existing bot/stockfish flow
  - [ ] **Friend tab** — wire to existing play-a-friend/room creation flow
  - [ ] **Coach tab** — placeholder panel (not yet implemented)
  - [ ] **Tournaments tab** — placeholder panel (not yet implemented)
  - [ ] **Variants tab** — wire to existing variant selection (Columns Chess, Dama, Lasca, Damasca, etc.)
- [ ] Preserve all existing functionality when tabs are wired to real features
- [ ] Add clear "coming soon" / placeholder UI for unfinished tabs

---

### Phase 4 — Visual Normalization

- [ ] Normalize shared card/button/tab styling across all game pages
- [ ] Improve visual hierarchy: spacing, panel chrome, section headers
- [ ] Add consistent hover/focus states across interactive elements
- [ ] Add consistent desktop/mobile navigation behavior
  - [ ] Desktop: hover flyouts, persistent left rail
  - [ ] Mobile: drawer overlay, compact nav, hamburger trigger
- [ ] Review and align player identity panel styling across all game pages
- [ ] Confirm no regressions in board/game renderer visual output

---

### Phase 5 — Logo System

> SVG source files are already in `public/icons/`. Phase 5 is wiring and polish, not asset creation.

- [ ] Implement `src/ui/branding/logo.ts`
  - [ ] `renderLogo(variant: LogoVariant, container: HTMLElement): void` — inserts correct `<img>` into slot
  - [ ] Enforce placement rules: size via CSS class only · preserve aspect ratio · no stretching · no horizontal logo in narrow spaces
- [ ] **Desktop top-left header** — wire `stackworks-logo-horizontal.svg` into `appShell.ts` brand slot
- [ ] **Collapsed sidebar / compact nav** — auto-switch to `stackworks-logo-icon.svg` when rail collapses
- [ ] **Mobile header** — use `stackworks-logo-icon.svg`; conditionally show `stackworks-wordmark.svg` alongside if space allows
- [ ] **Favicon / browser tab** — add `<link rel="icon" href="/icons/stackworks-logo-icon.svg">` to all HTML entry points
- [ ] **Footer / simple text branding** — use `stackworks-wordmark.svg`
- [ ] **One-color / fallback / print / theme-conflict states** — use `stackworks-logo-mono.svg`
- [ ] Verify all variants render correctly at all target breakpoints
- [ ] Verify correct appearance in light and dark theme contexts (if applicable)

---

## Non-Goals

- [ ] ~~Engine rewrite~~
- [ ] ~~Network protocol rewrite~~
- [ ] ~~Backend schema rewrite~~ (unless strictly necessary)
- [ ] ~~React migration~~

---

## Definition of Done

- [ ] All Phase 1–5 tasks above are checked off
- [ ] Existing offline smoke tests pass (see `docs/regression/offline-smoke.md`)
- [ ] Existing online multiplayer checklist passes (see `docs/multiplayer-checklist.md`)
- [ ] No game engine, renderer, or server code has been modified
- [ ] All game entry points (`chess.html`, `dama.html`, etc.) still launch correctly as standalone Vite entries
- [ ] Player identity panels display correctly in online, bot, friend, and spectate modes for all supported games
- [ ] Shell is responsive on both desktop and mobile without covering board content
