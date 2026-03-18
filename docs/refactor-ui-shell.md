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
- [x] On desktop/laptop widths, game pages should prefer paired left/right side panels over a top header so the board keeps maximum vertical space
- [x] Each desktop game page should support two left/right panel pairs: one pair for the existing in-game controls/info panels, and one pair for the new shell-style navigation/action panels
- [x] Switching between the two panel pairs should happen through side-mounted tabs or rail toggles, not by introducing a persistent top menu bar
- [ ] Hover flyouts on desktop
- [x] Drawer behavior on mobile
- [ ] Mobile portrait layout keeps the board as the priority surface while allowing a compact reserved header strip similar to chess.com's play screen
- [ ] Mobile portrait navigation should behave like a compact app control surface layered into that shallow header area, rather than a tall desktop header translated downward
- [ ] Fullscreen mode on laptop, tablet, and larger displays must hide the new shell header entirely so no top chrome reduces board height
- [ ] After game selection, show that game's own navigation/options

### Reference Translation

When using chess.com play screens as visual references, translate them into StackWorks goals using the categories below instead of copying product structure literally.

**Replicate directly**

- [ ] Board-first composition: keep the board centered and avoid sacrificing vertical space to a persistent top game header on desktop
- [ ] Board-adjacent player identifiers: opponent attached to the top edge of the board and local player attached to the bottom edge of the board
- [ ] A clear right-side mode/context panel that explains the current play surface at a glance

**Mimic structurally**

- [ ] Use a thin, integrated player-bar treatment similar to chess.com's top/bottom player identifiers rather than detached floating cards
- [ ] Use a left-side current-game identity area analogous to chess.com's bottom-left `Play Chess` label, but adapt the wording to the active StackWorks variant and mode
- [ ] Use a right-panel composition similar to chess.com's mode panel: current context at the top, selectable options in the middle, primary action anchored clearly

**StackWorks equivalent, not literal copy**

- [ ] Do not copy chess.com's product taxonomy (`Play`, `Puzzles`, `Learn`, etc.); keep StackWorks-specific navigation and variant structure
- [ ] Replace chess.com's exact mode labels with StackWorks equivalents such as `Play <Variant>`, `Bot Match`, `Online Room`, `Local Game`, `Spectating`, or `Replay`
- [ ] Populate side panels with StackWorks-specific content: rules/help, bot level, online room state, variant actions, history/replay, and account/community shortcuts where relevant
- [ ] Treat ratings, flags, profile polish, and other account metadata as future-ready optional slots rather than baseline requirements for the first UI pass
- [ ] Use uploaded profile avatars plus sensible defaults/fallbacks, rather than introducing a custom avatar creator flow

---

## Deliverable 1 — File-by-File Implementation Plan

### New files to create

- [x] `src/config/appShellConfig.ts` — global shell configuration (nav items, game registry, feature flags)
- [x] `src/ui/shell/appShell.ts` — top-level shell layout mount: logo, left rail, right panel, main content slot
- [x] `src/ui/shell/gameShell.ts` — per-game sub-shell: breadcrumb/title, game nav, game action area
- [x] `src/ui/shell/playHub.ts` — Play hub layout: tab bar + panel switcher for Online/Bots/Coach/Friend/Tournaments/Variants
- [x] `src/ui/navigation/flyoutMenu.ts` — desktop hover flyout menu component
- [x] `src/ui/navigation/tabs.ts` — reusable tab bar component
- [x] `src/ui/branding/logo.ts` — logo component referencing `public/icons/` SVG assets by placement context
  - `stackworks-logo-horizontal.svg` — desktop top-left header (default brand asset)
  - `stackworks-logo-icon.svg` — mobile header, collapsed sidebar, favicon, browser tab, app icon base
  - `stackworks-wordmark.svg` — mobile header (if space allows, alongside icon), footer, simple text branding
  - `stackworks-logo-mono.svg` — one-color, fallback, print, and theme-conflict cases
  - Rules: size with CSS only · preserve aspect ratio · do not stretch · never use horizontal logo in narrow spaces
- [x] `src/ui/player/playerIdentityPanel.ts` — player name + avatar panel; layout adapts to viewport aspect ratio:
  - **Portrait / narrow (mobile, tablet upright):** panels stack above and below the board
  - **Landscape / wide (desktop, tablet sideways):** panels sit to the left and right of the board
- [x] `src/ui/player/playerAvatar.ts` — avatar image with guest/bot fallback
- [x] `src/ui/player/playerStatusBadge.ts` — online/offline/reconnecting presence badge

### Desktop shell panel strategy

- [x] Treat the existing game left/right sidebars as one desktop panel pair
- [x] Add a second desktop panel pair for the new shell UI (game nav, play destinations, account/community shortcuts, contextual actions)
- [x] Add side-mounted tabs/toggles so the user can switch between `Legacy panels` and `Shell panels`
- [x] Keep the board centered between the currently active left/right pair
- [x] Do not require a top game-shell header on desktop when paired side panels are available

### Existing files to update

- [x] `src/index.html` / `src/indexMain.ts` — mount app shell, add game selection home experience
- [x] `src/chess.html` / `src/chessMain.ts` — mount game shell, add player identity panels
- [x] `src/columnsChess.html` / `src/columnsChessMain.ts` — mount game shell, add player identity panels
- [x] `src/dama.html` / `src/damaMain.ts` — mount game shell, add player identity panels
- [x] `src/lasca.html` / `src/lasca8x8.html` / `src/lasca8x8Main.ts` — mount game shell, add player identity panels
- [x] `src/damasca.html` / `src/damascaMain.ts` — mount game shell, add player identity panels
- [x] `src/main.ts` — shared entry bootstrap, shell init hook
- [x] `src/types.ts` — add `PlayerIdentity` and `PresenceState` types used by the shell/player UI
- [x] `src/config/` — extend with shell/nav/game registry config

---

## Deliverable 2 — Exact Files to Create / Update

> See Deliverable 1 above. Each checkbox maps to one file action.

---

## Deliverable 3 — UI State Model

- [x] Define `ShellState`: `{ activeGame: GameId | null, activeSection: GlobalSection, gameSection: GameSection | null }`
- [x] Define `GlobalSection` enum: `Home | Games | Community | Account | Settings`
- [x] Define `GameSection` enum: `Play | Learn | Watch | History | Rules | Customize | Online`
- [x] Define `PlaySubSection` enum: `Online | Bots | Coach | Friend | Tournaments | Variants`
- [ ] Define `PlayerIdentity` type: `{ id: string, displayName: string, avatarUrl: string | null, side: 'local' | 'remote' | 'spectator', presenceState: PresenceState, countryCode?: string | null, countryName?: string | null, rating?: number, isBot?: boolean, isFallback?: boolean }`
- [ ] Define `PresenceState` enum: `Online | Offline | Reconnecting | Waiting`
- [x] Wire `ShellState` to `localStorage` for persistence across page navigations
- [x] Feed `PlayerIdentity` from current match/session state (not hardcoded labels)
- [ ] Do NOT use "White"/"Black" as primary player labels — use actual display names first, side/color secondarily
- [ ] Feed player country into `PlayerIdentity` when available so the shell can render a country flag next to the player name in the board-edge identifiers
- [ ] Define avatar-profile metadata needed by the shell/account UI so player identity can reference an uploaded profile image with fallback/default behavior

---

## Deliverable 4 — Routing / Page-Mount Plan

- [ ] Keep each existing HTML entry point as its own Vite entry (no SPA conversion)
- [ ] Shell mounts via a lightweight `initAppShell()` call in each page's `*Main.ts`
- [ ] Shell reads `ShellState` from `localStorage` / URL param on mount to restore active game + section
- [ ] Page transitions remain standard `<a href>` navigations (no client-side router needed)
- [ ] `appShell.ts` injects the left rail + header DOM before the existing page content container
- [x] `gameShell.ts` wraps existing board/game container inside the game sub-shell DOM
- [x] `gameShell.ts` may reserve a compact mobile portrait header strip, but it must avoid a tall desktop-style header and keep the board as the primary surface
- [x] `gameShell.ts` must hide its header chrome when the document enters browser fullscreen; the board and existing game UI should use the reclaimed height immediately
- [x] `gameShell.ts` should prefer paired side-panel modes on desktop so shell navigation/actions live in left/right panels instead of a top header
- [x] Player identity panels are injected above/below the board container by `gameShell.ts`
  - [x] Panel order updates dynamically when the board flips so the player cards stay attached to the correct board edge
  - [ ] Player identifiers should show a country flag beside the display name when `PlayerIdentity.countryCode` is available
  - [ ] Expand the board-adjacent identity cards into full left/right landscape rails if the desktop shell direction needs that richer treatment later
- [ ] Right-side action panel slot is populated by each page's own logic (preserving existing settings/online UI)

---

## Deliverable 5 — Phased Task Checklist

---

### Phase 1 — Reusable Shell Layout

- [x] Create `src/config/appShellConfig.ts` with global nav items and game registry
- [x] Create `src/ui/branding/logo.ts` — logo component referencing `public/icons/` SVG assets
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
- [x] Create `src/ui/shell/appShell.ts` — left rail + header + main content slot + right panel slot
  - [ ] Responsive left rail (collapsed icon-only on mobile)
  - [ ] Brand/logo slot in top-left
  - [ ] Global nav items: Home, Games, Community, Account, Settings
  - [x] Hover flyouts on desktop (`flyoutMenu.ts`)
  - [x] Drawer/overlay behavior on mobile
  - [ ] On narrow portrait screens, the shell may use a shallow mobile header but must avoid introducing a tall persistent desktop-style top bar above gameplay-critical content
- [x] Create `src/ui/navigation/flyoutMenu.ts` — desktop hover flyout component
- [x] Create `src/ui/navigation/tabs.ts` — reusable tab bar component
- [x] Mount `appShell.ts` on the start/index page first
  - [ ] Confirm existing launch behavior (offline/online/lobby) is unbroken
- [x] Add selected-game header / breadcrumb / title area to `appShell.ts`

**Desktop game-shell direction:**

- [x] Replace the current desktop top-header emphasis with side-mounted shell panels
- [x] Left-side tabs toggle between existing game panel content and shell navigation content
- [x] Right-side tabs toggle between existing game info/history content and shell action/play-hub content
- [x] Desktop layout should echo the chess.com pattern: board centered, navigation on the left, actionable play/content panel on the right
- [x] Keep the compact top header only for mobile portrait and similar constrained layouts

**Player Identity — Phase 1 (included in first professional UI pass, not deferred):**

- [x] Create `src/ui/player/playerAvatar.ts`
  - [ ] Guest/default avatar fallback
  - [ ] Support uploaded profile avatars as the primary avatar source
  - [ ] Bot identity avatar/card
- [x] Create `src/ui/player/playerStatusBadge.ts`
  - [ ] States: Online, Offline, Reconnecting, Waiting for opponent
- [x] Create `src/ui/player/playerIdentityPanel.ts`
  - [ ] Shows: avatar, display name, country flag when available, side/color indicator (secondary), presence badge
  - [ ] Visual target is the chess.com-style top/bottom player identifier pattern: thin board-edge bars with identity first and gameplay/session state second
  - [ ] **Portrait / narrow viewport:** stack one panel above the board, one below
  - [ ] **Landscape / wide viewport:** place one panel to the left of the board, one to the right (mirrors laptop/monitor layout)
  - [ ] Switch triggered by CSS `@media (orientation: landscape)` / `(orientation: portrait)` or container query on the board wrapper
  - [ ] Layout must update dynamically on device rotation without a page reload
  - [ ] Orientation-aware: panels stay visually attached to correct board side when board flips
  - [ ] Clocks, captured pieces, and status indicators align with same player panel in both orientations
  - [ ] Empty/fallback states: "Waiting for opponent", guest avatar, bot card
  - [ ] Country metadata is part of the core player identity contract for the shell, not just a future enhancement
  - [ ] Future-ready slots: rating, verification/premium badge, profile card click
- [ ] Integrate `playerIdentityPanel.ts` into `gameShell.ts`
  - [x] Feed from current match/session state for all game types
  - [ ] Pull country/profile metadata from the existing account/identity sources when available and expose it to the board-edge player identifiers
  - [ ] Works for: live online games, play-vs-friend, bot games, spectating, replay/history
  - [ ] Rendering is independent from game rules (works for Chess, Columns Chess, Dama, Lasca, Damasca, etc.)

---

### Phase 2 — Game-First Home Experience

- [x] Create `src/ui/shell/gameShell.ts` — per-game sub-shell wrapping existing board container
  - [ ] Breadcrumb / game title
  - [ ] Per-game left nav section (Play, Learn, Watch, History, Rules, Customize, Online)
  - [ ] Right-side action panel slot
  - [ ] Right-side panel should act as a StackWorks-equivalent mode/context panel, not a literal copy of chess.com's `Play Chess` or bot-category menu
  - [x] Desktop/laptop layout uses left/right pair switching instead of a persistent top game-shell header
  - [x] One left/right pair exposes the existing legacy sidebars
  - [x] One left/right pair exposes the new shell-style navigation and play/action panels
  - [x] Side tabs or rail toggles switch between the two left/right pairs
  - [x] Mobile portrait behavior follows a compact chess.com-style priority: keep a shallow reserved header, keep the board-first layout, and move navigation into compact controls instead of a tall persistent header
  - [x] Fullscreen behavior removes the game-shell header entirely instead of shrinking the board viewport
  - [x] Inject player identity panels above/below board
- [ ] Replace current start/index page with game-first home experience:
  - [x] Game selection cards (one per game: Chess, Columns Chess, Dama, Lasca, etc.)
  - [x] Selected game summary panel
  - [x] Play action cards on the right
  - [x] Preserve all current launch settings (time control, color, variant options)
  - [x] Preserve all current online options (lobby, create room, join room, guest flow)
- [ ] Keep existing `localStorage` data sources and behavior working
- [ ] Wire `ShellState.activeGame` on game card selection

### Phase 2.5 — Profile Identity

- [ ] Add uploaded-avatar profile support for account/profile setup
- [ ] Keep direct avatar image upload as the primary profile-avatar path, aligned with the expected chess.com-style profile model
- [ ] Persist uploaded avatar metadata in the existing account/identity model used by online play
- [ ] Ensure uploaded avatars feed the top/bottom board player identifiers, account/profile surfaces, and any future lobby/player cards
- [ ] Define fallback behavior for missing, invalid, or removed uploaded avatars

---

### Phase 3 — Play Hub with Tabs

- [x] Create `src/ui/shell/playHub.ts` — Play hub layout with tab bar + panel switcher
- [x] Add tabs: Online, Bots, Coach, Friend, Tournaments, Variants
  - [x] **Online tab** — wire to existing online lobby/room flow
  - [x] **Bots tab** — wire to existing bot/stockfish flow
  - [x] **Friend tab** — wire to existing play-a-friend/room creation flow
  - [x] **Coach tab** — placeholder panel (not yet implemented)
  - [x] **Tournaments tab** — placeholder panel (not yet implemented)
  - [x] **Variants tab** — wire to existing variant selection (Columns Chess, Dama, Lasca, Damasca, etc.)
- [ ] Preserve all existing functionality when tabs are wired to real features
- [x] Add clear "coming soon" / placeholder UI for unfinished tabs

---

### Phase 4 — Visual Normalization

- [ ] Normalize shared card/button/tab styling across all game pages
- [ ] Improve visual hierarchy: spacing, panel chrome, section headers
- [ ] Add consistent hover/focus states across interactive elements
- [ ] Add consistent desktop/mobile navigation behavior
  - [ ] Desktop: hover flyouts, persistent left rail
  - [ ] Desktop game pages: paired left/right panel switching instead of top header chrome
  - [ ] Mobile: drawer overlay, compact nav, hamburger trigger
- [ ] Verify portrait mobile layouts do not lose excessive board height to shell chrome
- [ ] Verify browser fullscreen removes shell header chrome and preserves the board-first layout on larger displays
- [ ] Verify desktop layouts keep the board vertically unconstrained by avoiding persistent top game-shell chrome
- [ ] Review and align player identity panel styling across all game pages
- [ ] Verify country flags render cleanly and align consistently inside the top/bottom player identifiers across all supported games and breakpoints
- [ ] Verify uploaded avatars render cleanly and consistently in board-edge player identifiers, side panels, and profile/account surfaces
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
- [ ] Player identity panels display country flags correctly when country metadata is available, and degrade cleanly when it is missing
- [ ] Player identity panels and account/profile surfaces use uploaded avatars correctly, with sensible fallback behavior for missing or invalid avatar data
- [ ] Shell is responsive on both desktop and mobile without covering board content
- [ ] In portrait mobile layouts, shell navigation does not sit as a persistent tall header above the board
- [ ] In browser fullscreen, the shell header is hidden and does not consume top screen space
- [ ] On desktop/laptop layouts, the shell uses left/right panel pairs instead of a persistent top game header above the board
