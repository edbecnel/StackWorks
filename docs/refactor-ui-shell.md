# StackWorks UI Shell Refactor

> **Goal:** Refactor StackWorks UI into a professional modern product shell that fully replaces the old cluttered UI chrome with a cleaner, more focused chess.com-style board-first experience, while preserving the current multi-page Vite architecture, shared game logic, and existing offline/online functionality.

---

## Constraints

- [ ] Do NOT rewrite game engines, renderers, or online server flows
- [ ] Do NOT convert the whole app to a SPA
- [ ] Keep current per-game entry pages and shared TS modules
- [ ] Build a reusable shell/navigation layer around existing pages
- [ ] Preserve current offline mode, online rooms, lobby, rejoin, spectate, bot, and settings behavior
- [ ] Preserve existing gameplay and account flows, but do NOT preserve legacy presentation patterns as a product requirement
- [ ] Treat any temporary legacy-vs-shell coexistence as migration scaffolding only; the shipped end state must remove the old UI

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
- [ ] Lower-left account/auth area
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

### Legacy UI Retirement Rule

- [ ] The old Start Page layout, old desktop top-header emphasis, and old cluttered side-panel presentation are not part of the target end state
- [ ] Any temporary `Legacy panels` / `Shell panels` toggle exists only to keep rollout safe while feature parity is completed
- [ ] Once shell navigation, play controls, history/info, and account surfaces reach parity, remove the user-facing legacy toggle and legacy layout code paths
- [ ] Final shipped UX should expose a single new shell per page, not a choice between old and new interfaces

### Final End Product UI

The shipped product should feel like a simpler, more focused StackWorks, not like the current UI with cleaner paint. The main test is whether a new user on a small touch-screen phone can understand where they are, what they can do next, and how to start or continue a game without decoding multiple competing panels.

**Start / Home screen**

- [ ] One clear primary purpose: choose a game and start playing
- [ ] Top area is compact: brand, current section, and account entry only
- [ ] Main content shows a game picker and a single context panel for the currently selected game
- [ ] The selected-game panel shows only the most important actions first: `Play Online`, `Play Bot`, `Local Game`, `Play a Friend`, `Resume/Rejoin` when available
- [ ] Advanced options are hidden behind an explicit `More options` or `Game settings` entry instead of being expanded by default
- [ ] Rules/help, history/replay, and profile/community links do not compete with the primary start actions on first view

**Game screen — mobile portrait (highest priority layout)**

- [ ] Board occupies the largest share of the viewport and stays visible without a tall persistent header
- [ ] A shallow top strip contains only essential context: back/start-page access, active game name or mode, and one compact menu trigger
- [ ] That menu trigger (and any narrow-layout `menu` mode equivalent) must expose the same **shell** capabilities as wide-layout left/right shell panels—see **Narrow layout: game Menu vs shell panel parity** below
- [ ] Opponent identity attaches to the top edge of the board; local player identity attaches to the bottom edge of the board
- [x] Piece movement supports direct touch interaction: touching a movable piece reveals its valid destination squares immediately when move highlighting is enabled
- [x] Piece movement supports touch drag to a valid destination square so the user can press, drag, and release on the intended target square in one gesture
- [ ] Primary game actions live in one compact bottom sheet, drawer, or segmented action area, not in multiple simultaneously visible sidebars
- [ ] Clocks, turn state, reconnect state, and critical room/game status stay visible without opening extra panels
- [ ] Move history, rules/help, replay controls, export/share, and advanced settings are secondary surfaces opened on demand
- [ ] Touch targets are thumb-friendly and the layout works one-handed without requiring precise taps on crowded controls

### Narrow layout: game Menu vs shell panel parity

On viewports or layout modes where the game surface uses a compact **Menu** control (for example mobile portrait, or `menu`-style panel layout) instead of persistent left/right **shell** columns:

- [ ] The Menu affordance must provide **feature parity** with the **shell** left and right panels shown on wide/desktop game layouts: the same global nav, game sections, and contextual actions must be reachable (organization may differ—e.g. sheets, segments, or nested lists—but capabilities must not disappear).
- [ ] Parity is measured against the **shell** panel pair, not only legacy sidebars; the narrow Menu must not be a reduced subset of desktop shell options unless that demotion is an explicit product decision applied everywhere.
- [ ] Verify parity across all game HTML entry points, and when resizing or changing orientation / panel layout mode without a full reload where the app supports it.
- [ ] **Narrow + `panels` layout:** the **Shell** left/right bodies must respect `stackworks.gameShell.desktopPanelMode` (same as desktop): stacked mobile sidebars must show Shell UI when mode is **shell**, not hide it behind `display:none` while forcing legacy-only. **Narrow + `menu` layout:** Shell bodies stay in the game-shell Menu overlay (`.gameShellMobileShellPanels`); parity means that overlay must remain sufficient to start and control games on phones.

**Game screen — tablet / desktop**

- [ ] Board remains the visual center
- [ ] Left side contains navigation and game identity
- [ ] Right side contains current mode/context plus the most relevant actions for the current state
- [ ] Only one left panel and one right panel are visible in the final shipped UI; there is no permanent legacy panel pair
- [ ] History, rules, room status, and advanced controls are grouped into clear sections instead of appearing as scattered independent widgets
- [x] Piece interaction supports both click-select-then-target and click-drag-to-target flows without conflicting with move history, replay, or shell controls

**Account / profile surfaces**

- [ ] Signed-out state stays simple: `Sign Up`, `Log In`, and concise value proposition only
- [ ] Signed-in state shows avatar, display name, country, and time zone without turning the shell into a profile dashboard
- [ ] Profile editing focuses on identity needed for play surfaces first: display name, avatar, country, time zone

### Settings Hub Model

Use chess.com settings as a structural reference: group options into a small number of understandable settings pages instead of scattering toggles across start screens, sidebars, and per-panel chrome. The StackWorks Settings area should become the home for persistent preferences that are not part of immediate match setup.

**Settings hub pages for StackWorks**

- [ ] `Board & Pieces`
- [ ] `Move & Highlights`
- [ ] `Layout & Panels`
- [ ] `Audio & Motion`
- [ ] `Play & Match Preferences`
- [ ] `Account & Profile`
- [ ] `Privacy, Presence & Invitations`
- [ ] `Notifications`
- [ ] `Accessibility`

**Board & Pieces**

- [ ] Move existing settings here:
  - [ ] Theme
  - [ ] Variant-specific board theme
  - [ ] Checkerboard theme
  - [ ] Glass background mode
  - [ ] Glass palette
  - [ ] Board coordinates
  - [ ] Coordinates inside squares
  - [ ] Flip board
  - [ ] Show player names
  - [ ] Board viewport / framed vs playable view
- [ ] Add missing settings worth supporting:
  - [ ] Piece set selector if multiple piece families are available or planned
  - [ ] Board size / board scale preference where practical
  - [ ] High-contrast board/piece preset surfaced explicitly, not only as an incidental theme choice

**Move & Highlights**

- [ ] Move existing settings here:
  - [ ] Move hints toggle
  - [ ] Move hint style
  - [ ] Highlight squares toggle
  - [ ] Last move highlight toggle
  - [ ] Last move highlight style
  - [ ] Analysis square highlight style
  - [ ] Move preview mode
  - [ ] Selection style
- [ ] Add missing settings worth supporting:
  - [ ] Candidate target highlight toggle separate from broader move-hint styling when those concepts differ
  - [ ] Drag-to-move enable/disable preference if needed for accessibility or user comfort
  - [ ] Color-blind-safe highlight palette options
  - [ ] Promotion and special-move interaction preferences where variant rules need them

**Layout & Panels**

- [ ] Move existing settings here:
  - [ ] Panel layout mode (`panels` vs `menu`)
  - [ ] Show resize icon
  - [ ] Evaluation panel visibility/mode where relevant
- [ ] Keep advanced layout persistence internal rather than exposing it as normal settings:
  - [ ] Splitter positions
  - [ ] Resizable window positions
  - [ ] Collapsible-section open state
- [ ] Add missing settings worth supporting:
  - [ ] Compact mobile layout preference only if there is a genuinely useful alternate mode
  - [ ] Default side-panel section or preferred shell landing section if users benefit from it

**Audio & Motion**

- [ ] Move existing settings here:
  - [ ] SFX toggle
  - [ ] Animations toggle
  - [ ] Toasts toggle if treated as feedback/alert behavior
- [ ] Add missing settings worth supporting:
  - [ ] Separate volume or sound-category toggles if the sound design grows beyond one global SFX switch
  - [ ] Reduced motion mode that suppresses non-essential board and shell transitions
  - [ ] Haptic feedback toggle for supported mobile devices if haptics are introduced

**Play & Match Preferences**

- [ ] Move existing settings here when they are persistent preferences rather than one-off launch setup:
  - [ ] Preferred online color
  - [ ] Default online room visibility
  - [ ] Lobby `mine only` filter preference
- [ ] Do not treat one-off match setup as global settings if it belongs in the match creation flow:
  - [ ] Time control
  - [ ] Bot opponent choice
  - [ ] Variant choice for a specific game launch
- [ ] Remove or demote settings that are likely product clutter:
  - [ ] Threefold rule should not appear as a normal end-user preference if it changes actual rules rather than presentation or convenience
- [ ] Add missing settings worth supporting:
  - [ ] Default controller preferences for bot play where useful
  - [ ] Confirm move on touch for users who prefer it, if testing shows value
  - [ ] Auto-promote / promotion preference for chess-like variants when applicable

**Account & Profile**

- [ ] Move existing settings here:
  - [ ] Display name
  - [ ] Avatar upload
  - [ ] Country
  - [ ] Time zone
- [ ] Add missing settings worth supporting:
  - [ ] Password/security management page when account system scope requires it
  - [ ] Linked identity providers if social login is introduced
  - [ ] Basic profile visibility controls if public profile surfaces become important

**Privacy, Presence & Invitations**

- [ ] Move existing settings here:
  - [ ] Default room visibility for online play
- [ ] Add missing settings worth supporting:
  - [ ] Online presence visibility
  - [ ] Who can challenge or invite the user
  - [ ] Hosted-room invitation policy defaults
  - [ ] Spectator permission defaults for hosted rooms or personal games
  - [ ] Block or mute invite sources when social features mature

**Notifications**

- [ ] Move existing settings here if toasts are treated as notifications rather than general UI feedback:
  - [ ] Toast notifications toggle
- [ ] Add missing settings worth supporting:
  - [ ] Invite/challenge notifications
  - [ ] Rejoin or opponent-return notifications
  - [ ] Tournament or hosted-room event notifications if those product areas ship
  - [ ] Email or push notification categories only if those channels actually exist

**Accessibility**

- [ ] Move existing settings here where they primarily serve legibility/access needs:
  - [ ] Coordinates inside squares
  - [ ] High-contrast board/palette preset
- [ ] Add missing settings worth supporting:
  - [ ] Reduced motion shortcut surfaced clearly here even if also mirrored under Audio & Motion
  - [ ] Larger board labels / stronger coordinate contrast where needed
  - [ ] Larger touch-target mode if testing shows small-screen accuracy problems
  - [ ] Alternative highlight styles for users who struggle with subtle glow-based indicators

**Internal or developer-only options that should not live in normal user settings**

- [ ] Server URL
- [ ] Current room id or online action state
- [ ] Panel splitter persistence
- [ ] Debug diagnostics / debug JSON controls
- [ ] Any state restored purely to preserve session continuity rather than to express user preference
- [ ] **Puzzle authoring (build-gated, not user settings):** menu entry to enter puzzle setup mode, record positions and solution lines, and save curated puzzle data for distribution; **enabled only** when **`import.meta.env.PROD`** and a **build-time `VITE_*` flag** are both set (same shipping pattern as `VITE_EMIT_ADMIN`, `VITE_HIDE_LEGACY_PANEL_TOGGLE`) — see **Puzzles (Chess & Columns Chess) — planned**

**Settings UX rules**

- [ ] Settings should house persistent preferences, not replace match setup
- [ ] Do not duplicate the same option in Settings and on every play surface unless there is a strong in-context reason
- [ ] Advanced settings should be grouped and searchable/scannable, not sprayed across the shell
- [ ] On mobile, each settings page should be a simple vertical list with large touch targets and concise labels
- [ ] The Settings area should reduce clutter elsewhere in the product by absorbing long-tail preferences that do not belong on play screens

### Mobile-First Simplicity Rules

- [ ] Design mobile portrait first; desktop may add space, but must not reintroduce clutter
- [ ] Every screen must expose one dominant primary action above secondary actions
- [ ] No screen should require the user to parse more than one navigation system at a time
- [ ] No permanently visible duplicate controls across header, panel, and board area
- [ ] No hover-only affordances for essential actions
- [ ] No large blocks of explanatory copy on core play screens when a short label or icon-plus-label will do
- [ ] Secondary actions belong behind drawers, sheets, segmented views, or explicit `More` entry points
- [ ] Settings that are rarely changed during play should not remain permanently visible on small screens
- [ ] If a control is important enough to stay visible during play, it must justify the screen space with frequent use or critical status value
- [ ] Core board interaction must minimize tap count: selecting a piece should make valid moves obvious immediately, and drag-to-target should be supported on both mouse and touch devices

### Board Interaction Model

- [x] All supported games should support two equivalent move-input patterns for legal moves:
  - [x] Select a piece, then select one of its valid target squares
  - [x] Select a piece, drag it, and release it on a valid target square
- [x] As soon as the user clicks or touches a movable piece, highlight its valid candidate target squares when move highlighting is enabled
- [x] Candidate-target highlighting must update from actual legal move generation, not from hardcoded UI assumptions
- [x] If move highlighting is disabled in settings, drag/select behavior should still work, but target-square highlight markers should remain hidden
- [x] Releasing a dragged piece on an invalid square should cancel cleanly and return the piece to its source square
- [x] Releasing a dragged piece on a valid square should commit the move using the same validation path as click-based move input
- [x] Drag and selection behavior must work for mouse, touch, and stylus input where supported by the platform
- [x] Board interaction rules should stay consistent across Chess, Columns Chess, Dama, Lasca, Damasca, and other supported variants even when their legal-move logic differs
- [ ] Verify move-input non-interference across adjacent UI surfaces:
  - [x] Replay/history playback controls remain clickable and do not trigger board moves accidentally
  - [ ] Side-panel and in-panel scrolling still works normally near the board on desktop and mobile
  - [ ] Mobile drawer open/close gestures do not conflict with board drag/select gestures
  - [x] After exercising replay, scrolling, and drawer interactions, normal board move input still works correctly

### Old UI Feature Triage

**Keep and integrate into the new UI**

- [ ] Game/variant selection
- [ ] Core launch settings needed before starting a match
- [ ] Clear board interaction affordances: selectable pieces, candidate-target highlighting, and drag-to-target movement
- [ ] Online room creation, joining, rejoining, spectating, and lobby access
- [ ] Bot play entry points and difficulty selection
- [ ] Local play entry points
- [ ] Move history / replay access
- [ ] Rules/help access
- [ ] Account/auth identity and profile basics
- [ ] Connection/presence/game-state status that prevents user confusion during online play

**Keep, but demote behind secondary surfaces**

- [ ] Detailed settings that are not needed on every launch
- [ ] Extended room diagnostics and debug-style online state readouts
- [ ] Replay/export/share actions
- [ ] Deep customization options
- [ ] Community/discovery shortcuts that are not part of the immediate play path

**Remove from the shipped surface because they add clutter or duplicate other UI**

- [ ] Multiple competing panels visible at the same time on small screens
- [ ] Duplicate navigation choices shown in both header and side areas
- [ ] Always-expanded advanced settings on the start or play screens
- [ ] Detached floating cards that repeat player, game, or mode information already shown elsewhere
- [ ] Persistent desktop-oriented top chrome on mobile portrait screens
- [ ] Legacy labels, sections, or containers that exist only because of the old layout structure rather than user need
- [ ] Any permanent `Legacy panels` choice presented to end users

### Simplification Heuristic

- [ ] For each legacy UI element, justify it by answering: does it help the user start a game faster, understand the current game state faster, or complete an in-game task faster on a phone?
- [ ] If the answer is no, remove it from the primary surface
- [ ] If the answer is sometimes, move it behind an explicit secondary action
- [ ] If the answer is yes, keep it visible but merge duplicates so each job is represented once

### Play Mode Product Model

Chess.com's play area suggests a useful pattern: make a small number of play intents obvious at the top level, then handle setup complexity inside the selected mode instead of exposing every variant of online play as a first-view navigation choice.

**Chess.com reference pattern**

- [ ] `Play Online` is a first-class entry point
- [ ] `Custom Challenge` appears as a secondary online setup action, not a separate top-level product area
- [ ] `Play a Friend` is promoted strongly enough to be discoverable both from the main play hub and from the online area
- [ ] `Tournaments` are presented as their own destination because they involve discovery/joining rather than instant match setup
- [ ] `Play Bots` is a separate first-class mode with its own personality/strength selection surface
- [ ] `Puzzles` (StackWorks-scoped: curated practice, not a chess.com-scale puzzle hub) sits between bots and coach in the play surface when shipped for a variant
- [ ] `Play Coach` is a separate first-class mode with a level picker before starting the game

**StackWorks top-level play destinations**

- [ ] `Play Online`
- [ ] `Play Bots`
- [ ] `Puzzles` — curated, level-based tactical practice for supported variants (initially Chess and Columns Chess); see **Puzzles (Chess & Columns Chess) — planned** below
- [ ] `Play Coach`
- [ ] `Local Game`
- [ ] `Resume / Rejoin` when relevant
- [ ] `Play a Friend` may appear as a shortcut on the selected-game home panel, but should conceptually live under online play

**StackWorks online submenu / panel structure**

- [ ] `Quick Match` — immediate online play with minimal setup
- [ ] `Custom Challenge` — user chooses opponent constraints, time control, color, variant, and invitation/public options
- [ ] `Play a Friend` — simplified invite flow optimized for known opponent entry, link/code sharing, and fast rematch
- [ ] `Hosted Rooms` — persistent or semi-persistent community-owned room entry point for clubs, schools, friend groups, organizers, and invited communities
- [ ] `Tournaments` — organized event entry point, separate from ordinary room creation
- [ ] `Spectate / Watch` should remain discoverable, but should not compete with the primary online start actions on first view

**Recommended support decisions**

- [ ] Support `Custom Challenge`
  - Reason: it covers the flexible one-off setup case without forcing every online game through a rigid quick-match flow
  - UI treatment: secondary action within `Play Online`, not a top-level home-screen tile
- [ ] Support `Play a Friend`
  - Reason: it is a common, high-intent path and deserves a simplified flow separate from generic challenge creation
  - UI treatment: visible shortcut on the selected-game panel plus a dedicated path inside `Play Online`
- [ ] Support `Hosted Rooms`
  - Reason: this is materially different from a one-off friend challenge and fits StackWorks well for schools, clubs, and recurring communities
  - UI treatment: first-class option inside `Play Online`, not buried under generic custom challenge settings
  - Data model direction: room host/owner, public vs private visibility, membership or invite gating, room code/link, room lobby, running games list, spectator policy
- [ ] Support `Play Bots`
  - Reason: this is a core low-friction mode and should be one of the easiest actions to start from home
  - UI treatment: top-level destination with a graphical list/grid of bot personalities, each showing strength and play style
  - Match types: human vs bot and bot vs bot
  - Control model: each side has its own controller assignment (`human` or `bot`), but `Play Bots` must not allow the mode to become two-human local play
  - Required shared features for both match types: Undo, Redo, current Move History with Playback, and per-side controller switching between human and bot
  - Bot-vs-bot must allow two different bot skill levels or the same bot skill level on both sides
- [ ] Support `Play Coach`
  - Reason: this is a differentiated learning mode, not just a bot with a different label
  - UI treatment: top-level destination with a level picker first, then a compact explanation of coach features and a clear `Play` action
  - Required capabilities: hints, takeback-friendly flow, mistake feedback, learning prompts, and beginner-to-expert level presets
- [ ] Treat `Tournaments` as conditional support rather than mandatory first-pass scope
  - Reason: tournaments require more organizer, scheduling, pairing, and moderation complexity than friend play or ordinary rooms
  - UI treatment if not yet supported: visible but clearly marked `Coming soon` only if tournament support is on the roadmap and worth reserving space for
  - UI treatment if not imminent: remove from the primary surface until the product can support it properly

**Hosted Rooms definition**

- [ ] Hosted Rooms are not just ad hoc friend challenges with more fields
- [ ] A hosted room should feel like a reusable community space: room identity, membership boundary, invite/public controls, and a list of active or joinable games
- [ ] Hosted Rooms may support public discovery, private membership, or invite-link access depending on room policy
- [ ] Hosted Rooms should be able to serve schools, clubs, stream communities, and recurring friend groups without making them recreate context every time

**Coach mode definition**

- [ ] `Play Coach` means `Play and Learn with an AI Coach`, not merely `play a weak bot`
- [x] First step is level selection: `New to chess`, `Beginner`, `Novice`, `Intermediate`, `Intermediate II`, `Advanced`, `Expert`
- [x] After level choice, the UI should explain the learning contract in plain language: hints available, takebacks allowed, coaching prompts, and practice-oriented feedback
- [x] Coach mode should minimize configuration complexity; level selection is primary, optional advanced settings are secondary

**Mobile-first play hub rule**

- [ ] Do not show every online sub-mode as a separate first-view card on phone screens
- [ ] On small screens, the selected-game home panel should show at most a few primary actions, with `Play Online` opening the deeper online mode chooser
- [ ] Inside `Play Online`, present mode choices as a short, thumb-friendly list or segmented card stack: `Quick Match`, `Custom Challenge`, `Play a Friend`, `Hosted Rooms`, `Tournaments` when supported
- [ ] The user should never need to decipher whether a choice is a mode, a room type, a matchmaking filter, or a navigation category from the same crowded screen

### Reference Translation

When using chess.com play screens as visual references, translate them into StackWorks goals using the categories below instead of copying product structure literally.

**Replicate directly**

- [ ] Board-first composition: keep the board centered and avoid sacrificing vertical space to a persistent top game header on desktop
- [ ] Board-adjacent player identifiers: opponent attached to the top edge of the board and local player attached to the bottom edge of the board
- [ ] A clear right-side mode/context panel that explains the current play surface at a glance

**Mimic structurally**

- [ ] Use a thin, integrated player-bar treatment similar to chess.com's top/bottom player identifiers rather than detached floating cards
- [ ] Use a left-side current-game identity area analogous to chess.com's bottom-left `Play Chess` label, but adapt the wording to the active StackWorks variant and mode
- [x] Use a lower-left account/auth area analogous to chess.com's signed-in user rail item: show the logged-in user's display name + avatar when authenticated, and show `Sign Up` / `Log In` actions when signed out
- [x] On the start page, keep the signed-out `Sign Up` / `Log In` actions visible in the bottom-left shell area within a typical desktop viewport; reaching them should not require vertical scrolling
- [ ] Use a right-panel composition similar to chess.com's mode panel: current context at the top, selectable options in the middle, primary action anchored clearly

**StackWorks equivalent, not literal copy**

- [ ] Do not copy chess.com's product taxonomy wholesale (`Play`, `Learn`, etc.); **in-product `Puzzles` is allowed** when scoped as a small curated StackWorks feature (levels, rotation, learning feedback)—not a feature-for-feature clone of a large external puzzle library or daily-puzzle machine
- [ ] Replace chess.com's exact mode labels with StackWorks equivalents such as `Play <Variant>`, `Bot Match`, `Online Room`, `Local Game`, `Spectating`, or `Replay`
- [ ] Populate side panels with StackWorks-specific content: rules/help, bot level, online room state, variant actions, history/replay, and account/community shortcuts where relevant
- [ ] Follow chess.com's product-shape lesson for play modes: a few obvious play intents at the top level, with setup complexity moved into the selected mode
- [x] The shell must surface authentication state directly in the left rail: signed-in view shows avatar + display name; signed-out view shows `Sign Up` and `Log In` entry points
- [ ] Treat ratings, flags, profile polish, and other account metadata as future-ready optional slots rather than baseline requirements for the first UI pass
- [ ] Use uploaded profile avatars plus sensible defaults/fallbacks, rather than introducing a custom avatar creator flow
- [x] Profile/account setup should allow the user to choose country from a dropdown list and choose a time zone; if not specified, default these fields from origin IP / geolocation when available

---

## Deliverable 1 — File-by-File Implementation Plan

### New files to create

- [x] `src/config/appShellConfig.ts` — global shell configuration (nav items, game registry, feature flags)
- [x] `src/ui/shell/appShell.ts` — top-level shell layout mount: logo, left rail, right panel, main content slot
- [x] `src/ui/shell/gameShell.ts` — per-game sub-shell: breadcrumb/title, game nav, game action area
- [x] `src/ui/shell/playHub.ts` — Play hub layout: tab bar + panel switcher for Online/Bots/**Puzzles (planned)**/Coach/Local with contextual Resume/Rejoin
- [x] `src/ui/navigation/flyoutMenu.ts` — desktop hover flyout menu component
- [x] `src/ui/navigation/tabs.ts` — reusable tab bar component
- [x] `src/ui/branding/logo.ts` — logo component referencing `public/icons/` SVG assets by placement context
  - `stackworks-logo-horizontal.svg` — desktop top-left header in the `Panels` layout on each game page, replacing the plain text `StackWorks` label
  - `stackworks-logo-icon.svg` — mobile header, collapsed sidebar, favicon, browser tab, app icon base
  - `stackworks-wordmark.svg` — mobile header (if space allows, alongside icon), footer, simple text branding
  - `stackworks-logo-mono.svg` — one-color, fallback, print, and theme-conflict cases
  - Rules: size with CSS only · preserve aspect ratio · do not stretch · never use horizontal logo in narrow spaces
- [x] `src/ui/player/playerIdentityPanel.ts` — player name + avatar panel; layout adapts to viewport aspect ratio:
  - **Portrait / narrow (mobile, tablet upright):** panels stack above and below the board
  - **Landscape / wide (desktop, tablet sideways):** panels sit to the left and right of the board
- [x] `src/ui/player/playerAvatar.ts` — avatar image with guest/bot fallback
- [x] `src/ui/player/playerStatusBadge.ts` — online/offline/reconnecting presence badge
- [x] `src/ui/account/accountRailCard.ts` — lower-left shell account/auth card: signed-in identity vs signed-out `Sign Up` / `Log In` actions

### Desktop shell panel strategy

- [x] Treat the existing game left/right sidebars as a temporary migration source for one desktop panel pair
- [x] Add a second desktop panel pair for the new shell UI (game nav, play destinations, account/community shortcuts, contextual actions)
- [x] Add side-mounted tabs/toggles so the user can switch between `Legacy panels` and `Shell panels` during migration
- [x] Keep the board centered between the currently active left/right pair
- [x] Do not require a top game-shell header on desktop when paired side panels are available
- [ ] Remove the `Legacy panels` mode after shell panels cover all required game controls and information surfaces

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
- [x] Define `PlaySubSection` enum: `Online | Bots | Coach | Local | Resume`
- [ ] Extend `PlaySubSection` (and shell/play-hub wiring) with `Puzzles` between `Bots` and `Coach` for supported variants
- [x] Refine play-mode information architecture so `Friend` is a prominent shortcut but remains conceptually nested under online play in the final UX
- [x] Add online sub-mode state for `QuickMatch | CustomChallenge | Friend | HostedRooms | Tournaments`
- [x] Add bot-play state for per-side controller assignment and bot configuration so each seat can be `human` or `bot` with the restriction that `Play Bots` cannot resolve to `human` + `human`
- [ ] Define `PlayerIdentity` type: `{ id: string, displayName: string, avatarUrl: string | null, side: 'local' | 'remote' | 'spectator', presenceState: PresenceState, countryCode?: string | null, countryName?: string | null, rating?: number, isBot?: boolean, isFallback?: boolean }`
- [ ] Define `PresenceState` enum: `Online | Offline | Reconnecting | Waiting`
- [x] Wire `ShellState` to `localStorage` for persistence across page navigations
- [x] Feed `PlayerIdentity` from current match/session state (not hardcoded labels)
- [x] Do NOT use "White"/"Black" as primary player labels — use actual display names first, side/color secondarily
- [x] Feed player country into `PlayerIdentity` when available so the shell can render a country flag next to the player name in the board-edge identifiers
- [ ] Define avatar-profile metadata needed by the shell/account UI so player identity can reference an uploaded profile image with fallback/default behavior
- [x] Define account/profile metadata for `countryCode`, `countryName`, and `timeZone`
- [x] Define profile-defaulting behavior: if country or time zone is not explicitly chosen by the user, derive an initial default from origin IP / geolocation when the server has that information available
- [x] Define shell account/auth state for the left rail: signed-in user summary `{ displayName, avatarUrl, status }` or signed-out action set `{ signUpHref, logInHref }`

---

## Deliverable 4 — Routing / Page-Mount Plan

- [ ] Keep each existing HTML entry point as its own Vite entry (no SPA conversion)
- [ ] Shell mounts via a lightweight `initAppShell()` call in each page's `*Main.ts`
- [ ] Shell reads `ShellState` from `localStorage` / URL param on mount to restore active game + section
- [ ] Page transitions remain standard `<a href>` navigations (no client-side router needed)
- [ ] `appShell.ts` injects the left rail + header DOM before the existing page content container
- [x] `appShell.ts` renders a lower-left account/auth card that switches between signed-in identity and signed-out `Sign Up` / `Log In` actions
- [x] `gameShell.ts` wraps existing board/game container inside the game sub-shell DOM
- [x] `gameShell.ts` may reserve a compact mobile portrait header strip, but it must avoid a tall desktop-style header and keep the board as the primary surface
- [x] `gameShell.ts` must hide its header chrome when the document enters browser fullscreen; the board and existing game UI should use the reclaimed height immediately
- [x] `gameShell.ts` should prefer paired side-panel modes on desktop so shell navigation/actions live in left/right panels instead of a top header
- [x] Board input layer must support click/touch selection, candidate target highlighting when enabled, and drag-to-valid-target movement across supported variants
- [x] Player identity panels are injected above/below the board container by `gameShell.ts`
  - [x] Panel order updates dynamically when the board flips so the player cards stay attached to the correct board edge
  - [x] Player identifiers should show a country flag beside the display name when `PlayerIdentity.countryCode` is available
  - [ ] Expand the board-adjacent identity cards into full left/right landscape rails if the desktop shell direction needs that richer treatment later
- [ ] Right-side action panel slot is populated by each page's own logic (preserving existing settings/online UI)

---

## Next Sprint — Implementation Batch (Tracking Checklist)

- [x] **Ticket 1: Complete shell logo placement rules**
  - [x] Wire footer/simple branding to `stackworks-wordmark.svg`
  - [x] Enforce "no horizontal logo in narrow spaces" in `src/ui/branding/logo.ts`
  - [x] Verify logo variant fallback behavior remains CSS-sized and aspect-safe

- [x] **Ticket 2: Finish responsive left-rail behavior in `appShell.ts`**
  - [x] Ensure responsive rail behavior uses compact icon-first mode on narrower desktop widths and drawer/overlay navigation on mobile breakpoints
  - [x] Keep desktop rail persistent and avoid full-page chrome scroll
  - [x] Verify nav affordances remain usable in collapsed and expanded states

- [x] **Ticket 3: Finalize shell brand + global nav wiring**
  - [x] Confirm top-left brand/logo slot is rendered in all shell pages (start shell header + rail; game pages: compact bar, floating header icon, **desktop shell left panel horizontal logo** linking to Start Page)
  - [x] Confirm global nav includes `Home`, `Games`, `Community`, `Account`, `Settings`
  - [x] Confirm active-state highlighting and navigation links are correct per page

- [x] **Ticket 4: Mobile scroll + compact header hardening**
  - [x] Verify center/right panel areas use natural touch scrolling on mobile (`-webkit-overflow-scrolling: touch`, `overscroll-behavior-y: contain`, `touch-action: pan-y` on start-page drawers + content slot; game shell Menu overlay + mobile shell panel stack)
  - [x] Ensure narrow portrait layouts keep only a shallow header strip — **portrait slide-over menu:** reduced `.gameShellHeader` padding/gap, title/breadcrumb/subtitle and brand sizes (`gameShell.ts`, `@media (max-width: 820px) and (orientation: portrait)`)
  - [x] Remove any residual tall desktop-style header behavior from narrow gameplay surfaces (compact bar + overlay menu now apply to all `max-width: 820px`, including landscape phones / small landscape windows; portrait-only player-bar line compaction unchanged)

- [ ] **Ticket 5: Start-page parity validation (no launch regressions)**
  - [ ] Confirm offline launch flows remain unchanged
  - [ ] Confirm online/lobby/create/join flows remain unchanged
  - [ ] Confirm existing launch settings and state restoration still work

- [ ] **Ticket 6: Player identity completeness (avatar + status + orientation)**
  - [ ] Add guest/default avatar fallback in `src/ui/player/playerAvatar.ts`
  - [ ] Keep uploaded profile avatar as primary source with graceful fallback
  - [ ] Add bot identity avatar/card treatment for bot-controlled seats
  - [ ] Complete status badge states: `Online`, `Offline`, `Reconnecting`, `Waiting for opponent`
  - [ ] Complete orientation-aware identity layout and dynamic rotate updates in `src/ui/player/playerIdentityPanel.ts`

- [ ] **Ticket 7: Fully integrate identity metadata into `gameShell.ts`**
  - [ ] Ensure country/profile metadata is pulled from existing identity/account sources when available
  - [ ] Ensure integration works across all supported variants without rules coupling
  - [ ] Validate online, friend, bot, spectate, and replay identity rendering paths remain stable

- [ ] **Ticket 8: Remove user-facing legacy panel toggle when parity is reached**
  - [ ] Confirm shell-side nav/action panels cover all required legacy actions (ongoing QA)
  - [ ] Remove user-facing `Legacy panels` fallback toggle from production UI — **deferred until parity:** Game/Shell pair tabs + Options “UI Old/New” remain **on** in production by default; opt out with `VITE_HIDE_LEGACY_PANEL_TOGGLE=true` after QA signs off (then the **Play hub** bar appears when the left sidebar is in legacy mode without tabs)
  - [ ] Keep migration escape hatches until parity — hidden toggle build is **explicit env only**, not the default shipped UX

- [ ] **Ticket 9: Narrow / mobile game Menu reaches shell panel parity**
  - [x] Inventory content and actions exposed in the wide-layout **shell** left/right panels (`gameShell` / related shell UI) and compare to the narrow-layout Menu / drawer / sheet
  - [x] **`menu` layout:** when **`data-panel-layout="menu"`** (sidebars hidden), both `.gameShellDesktopShellBody` roots are **reparented** into the Menu overlay (`.gameShellMobileShellPanels`). Legacy/shell pair tabs are hidden there; user opens the game-shell **Menu** control to reach Shell UI.
  - [x] **`panels` layout on narrow viewports:** apply the same **shell vs legacy** mode as desktop (`readDesktopPanelMode` + `@media (max-width: 820px)` rules in `gameShell.ts`) so Shell UI is not stuck `display:none` in stacked sidebars — **required for mobile play** when users expect Shell (e.g. production default **shell**).
  - [ ] Regression pass: breakpoints, orientation, and `panels` vs `menu` layout settings do not leave capabilities only on wide layouts

### Sprint Exit Criteria

- [ ] All 9 sprint tickets above are either completed or explicitly deferred with owner + rationale
- [ ] No regressions in offline launch, online lobby/room, friend flow, bot flow, spectate, or replay entry points
- [ ] Mobile portrait still preserves board-first layout with shallow header and natural touch scrolling
- [ ] Narrow-layout game Menu reaches shell left/right panel capability parity (Ticket 9), or that ticket is explicitly deferred with owner + rationale
- [ ] Desktop still uses left/right panel strategy without reintroducing a persistent tall top game header
- [ ] Player identity bars render correctly (name/avatar/country/status) across online, bot, friend, spectate, and replay contexts
- [ ] Any temporary migration controls are non-user-facing or removed for production builds — **or** parity is confirmed and `VITE_HIDE_LEGACY_PANEL_TOGGLE=true` is set intentionally

---

## Deliverable 5 — Phased Task Checklist

---

### Phase 1 — Reusable Shell Layout

- [x] Create `src/config/appShellConfig.ts` with global nav items and game registry
- [x] Create `src/ui/branding/logo.ts` — logo component referencing `public/icons/` SVG assets
  - [x] Expose `LogoVariant` type: `'horizontal' | 'icon' | 'wordmark' | 'mono'`
  - [ ] Placement rules baked into component defaults:
    - [x] Desktop top-left header → `stackworks-logo-horizontal.svg`
    - [x] Mobile header → `stackworks-logo-icon.svg`; optionally `stackworks-wordmark.svg` alongside if space allows
    - [x] Collapsed sidebar / compact nav → `stackworks-logo-icon.svg`
    - [x] In-game board/shell logo treatment must be a clickable link with the same behavior as the `Start Page` action
    - [x] Favicon / browser tab / app icon base → `stackworks-logo-icon.svg`
    - [x] Footer / simple text branding → `stackworks-wordmark.svg`
    - [x] One-color / fallback / print / theme-conflict → `stackworks-logo-mono.svg`
  - [x] Size with CSS only; never hardcode `width`/`height` attributes
  - [x] Preserve aspect ratio on all variants; do not stretch
  - [x] Never use horizontal logo in narrow/tight spaces
  - [x] All placements use `<img>` or inline `<svg>`; do not rasterize
- [x] Create `src/ui/shell/appShell.ts` — left rail + header + main content slot + right panel slot
  - [ ] Responsive left rail (collapsed icon-only on mobile)
  - [x] Brand/logo slot in top-left
  - [x] Global nav items: Home, Games, Community, Account, Settings
  - [x] Lower-left account/auth card: signed-in user avatar + name, or `Sign Up` / `Log In` actions when signed out
  - [x] Desktop shell should avoid whole-page vertical scrolling for primary chrome: keep the left rail at a fixed viewport height, with the middle content area and right panel content scrolling internally as needed
  - [x] Start Page internal scroll areas should reuse the same scrollbar styling as the game pages: narrow dark-gray scrollbars that lighten on hover
  - [ ] Mobile should still rely on normal touch/finger scrolling for those same areas
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
- [x] Left-side tabs toggle between existing game panel content and shell navigation content during migration
- [x] Right-side tabs toggle between existing game info/history content and shell action/play-hub content during migration
- [x] Desktop layout should echo the chess.com pattern: board centered, navigation on the left, actionable play/content panel on the right
- [x] Keep the compact top header only for mobile portrait and similar constrained layouts
- [ ] Remove the migration toggle once shell-side navigation and action panels fully replace the legacy panel set — **current:** tabs + Options select ship in all builds unless `VITE_HIDE_LEGACY_PANEL_TOGGLE=true`; production still defaults desktop to **shell** when `stackworks.gameShell.desktopPanelMode` is unset (`gameShell.ts`)

**Player Identity — Phase 1 (included in first professional UI pass, not deferred):**

- [x] Create `src/ui/player/playerAvatar.ts`
  - [ ] Guest/default avatar fallback
  - [ ] Support uploaded profile avatars as the primary avatar source
  - [ ] Bot identity avatar/card
- [x] Create `src/ui/player/playerStatusBadge.ts`
  - [ ] States: Online, Offline, Reconnecting, Waiting for opponent
- [x] Create `src/ui/player/playerIdentityPanel.ts`
  - [x] Shows: avatar, display name, country flag when available, side/color indicator (secondary), presence badge
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
  - [x] When replay/history/PGN import metadata includes player names, feed those names into the top/bottom player bars instead of falling back to side labels
  - [x] Works for: live online games, play-vs-friend, bot games, spectating, replay/history
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
- [ ] Reduce first-view cognitive load so the default home screen shows game choice plus primary play actions before advanced settings, help, or secondary content
- [ ] Remove the old start page layout after the game-first shell covers all current entry actions without regression
- [ ] Keep existing `localStorage` data sources and behavior working
- [x] Wire `ShellState.activeGame` on game card selection

### Phase 2.5 — Profile Identity

- [x] Add lower-left signed-in account card to the shell rail using authenticated display name + avatar
- [x] Add lower-left signed-out shell actions for new/returning players: `Sign Up` and `Log In`
- [ ] Add uploaded-avatar profile support for account/profile setup
- [x] Add country selection to account/profile setup using a dropdown list of supported countries
- [x] Add time-zone selection to account/profile setup using a selectable time-zone list
- [x] If country or time zone has not been chosen yet, prefill them from origin IP / geolocation when available, while allowing the user to override the defaults manually
- [ ] Keep direct avatar image upload as the primary profile-avatar path, aligned with the expected chess.com-style profile model
- [ ] Persist uploaded avatar metadata in the existing account/identity model used by online play
- [x] Persist selected country and time zone in the existing account/identity model used by online play
- [x] Ensure uploaded avatars feed the top/bottom board player identifiers, account/profile surfaces, and any future lobby/player cards
- [x] Ensure selected country feeds board-edge player identifiers, lobby/player summary surfaces, and account/profile surfaces; ensure selected time zone is available to account/profile and scheduling-related UI where relevant
- [ ] Define fallback behavior for missing, invalid, or removed uploaded avatars

---

### Phase 3 — Play Hub with Tabs

- [x] Create `src/ui/shell/playHub.ts` — Play hub layout with tab bar + panel switcher
- [x] Shipped play tabs to date: Online, Bots, Coach, Local, Resume/Rejoin when applicable
- [ ] Target play tab order once puzzles ship: Online, Bots, **Puzzles**, Coach, Local, Resume/Rejoin (Puzzles only for variants that support it—initially **Chess** and **Columns Chess**); detailed tasks in **Puzzles (Chess & Columns Chess) — planned** below
  - [x] **Online** — contains `Quick Match`, `Custom Challenge`, `Play a Friend`, `Hosted Rooms`, and `Tournaments` when supported
  - [x] **Bots** — graphical bot list with personality, rating/strength, and style summary
    - [x] Support two seat cards or selectors so the user can configure Side A and Side B independently as `Human` or `Bot`
    - [x] Default `Play Bots` setup is `Human vs Bot`
    - [x] Optional `Watch Bots` setup is `Bot vs Bot`
    - [x] Allow the two bots to be different personalities/strengths or the same personality/strength on both sides
    - [x] Disallow `Human vs Human` inside `Play Bots`; that belongs to `Local`
    - [ ] Keep setup compact on mobile: surface only side controller, bot selection, strength/style, and primary start action first
    - [ ] Advanced bot options belong behind a secondary settings sheet
  - [ ] **Puzzles** — placeholder until implementation; full scope in **Puzzles (Chess & Columns Chess) — planned** below
  - [ ] **Coach** — level-first learning flow with hints/takebacks/teaching affordances
  - [x] **Local** — streamlined local/offline setup
  - [x] **Resume/Rejoin** — shown contextually when an interrupted or active game can be continued
- [x] `Friend` should not survive as a separate permanent top-level play tab in the final UX if it duplicates the online mode chooser
- [x] `Tournaments` should be top-level only if tournament participation becomes important enough to justify first-view real estate; otherwise keep it nested under Online
- [x] `Variants` should remain selectable within game selection and mode setup, not necessarily as a permanent primary play tab in the final UX
- [ ] Preserve all existing functionality when tabs are wired to real features
- [x] Add clear "coming soon" / placeholder UI for unfinished tabs
- [x] Add `Hosted Rooms` flow with public/private/invite-only room types and room-owner controls
- [ ] Implement `Custom Challenge` as an online setup surface, not as a separate top-level product area
- [ ] Implement `Play a Friend` as a simplified online invite flow with link/code sharing and rematch friendliness
- [x] Implement `Play Bots` with graphical personality cards showing rank/strength/style
  - [x] Support `Human vs Bot` and `Bot vs Bot`
  - [x] Add explicit `Watch Bots` entry or toggle within the bot setup flow
  - [x] Allow each side to choose bot personality and skill independently
  - [x] Allow same-skill and mixed-skill bot pairings
  - [ ] Support Undo and Redo in both human-vs-bot and bot-vs-bot play
  - [ ] Preserve the current Move History with Playback in both human-vs-bot and bot-vs-bot play
  - [ ] Allow either seat to switch between `human` and `bot` during setup and during a game when supported by the controller flow
  - [x] Enforce the rule that `Play Bots` may never become `human` + `human`; if both sides are switched away from bot control, route the user to `Local Game` instead of silently changing the mode
  - [x] When a seat is bot-controlled, show the bot's identity, style, and strength in the corresponding player bar and bot setup surface
- [x] Implement `Play Coach` with level selection options: `New to chess`, `Beginner`, `Novice`, `Intermediate`, `Intermediate II`, `Advanced`, `Expert`
- [ ] Allow an online-broadcast bot mode that behaves like local play for control flow, ignores opponent connection/presence gating, and only publishes the game for public or invited observers

---

### Phase 4 — Visual Normalization

- [ ] Normalize shared card/button/tab styling across all game pages
- [ ] Improve visual hierarchy: spacing, panel chrome, section headers
- [ ] Add consistent hover/focus states across interactive elements
- [ ] Audit every currently visible control on small-screen layouts and remove or demote anything that does not support the primary play flow
- [ ] Add consistent desktop/mobile navigation behavior
  - [ ] Desktop: hover flyouts, persistent left rail
  - [ ] Desktop game pages: paired left/right panel switching instead of top header chrome
  - [ ] Mobile: drawer overlay, compact nav, hamburger trigger
  - [ ] Game pages: narrow-layout Menu / drawer exposes the same **shell** options as wide-layout left/right shell panels (see **Narrow layout: game Menu vs shell panel parity** under Primary UX; tracked as Ticket 9)
- [ ] Verify portrait mobile layouts do not lose excessive board height to shell chrome
- [ ] Verify portrait mobile layouts expose only one primary action cluster at a time rather than multiple competing control groups
- [ ] Verify board interaction on touch devices is practical: touch a piece, see legal targets immediately when enabled, drag to a legal square, release to move
- [ ] Verify browser fullscreen removes shell header chrome and preserves the board-first layout on larger displays
- [ ] Verify desktop layouts keep the board vertically unconstrained by avoiding persistent top game-shell chrome
- [x] Verify desktop shell layouts use a fixed-height left rail while allowing center content and right-panel content to scroll internally instead of forcing whole-page vertical scrolling
- [x] Verify Start Page internal scroll areas use the same narrow dark-gray scrollbar styling as the game pages and lighten on hover
- [ ] Verify mobile internal scroll areas feel natural with touch scrolling and do not depend on persistent visible scrollbars
- [ ] Review and align player identity panel styling across all game pages
- [x] Verify country flags render cleanly and align consistently inside the top/bottom player identifiers across all supported games and breakpoints
- [ ] Verify uploaded avatars render cleanly and consistently in board-edge player identifiers, side panels, and profile/account surfaces
- [ ] Verify country dropdown and time-zone selection render clearly and behave consistently in account/profile surfaces
- [ ] Verify IP-based country/time-zone prefills are best-effort only, do not overwrite explicit user choices, and degrade cleanly when origin IP data is unavailable
- [x] Verify the lower-left shell account/auth area renders correctly in both states: signed-in user summary and signed-out `Sign Up` / `Log In` actions
- [ ] Confirm no regressions in board/game renderer visual output

---

### Phase 5 — Logo System

> SVG source files are already in `public/icons/`. Phase 5 is wiring and polish, not asset creation.

- [ ] Implement `src/ui/branding/logo.ts`
  - [ ] `renderLogo(variant: LogoVariant, container: HTMLElement): void` — inserts correct `<img>` into slot
  - [ ] Enforce placement rules: size via CSS class only · preserve aspect ratio · no stretching · no horizontal logo in narrow spaces
- [x] **Desktop top-left header (`Panels` layout)** — replace the plain text `StackWorks` label on each game page with `stackworks-logo-horizontal.svg` in the `appShell.ts` brand slot
- [x] **In-game board logo** — clicking the StackWorks logo should navigate exactly like `Start Page`
- [x] **Collapsed sidebar / compact nav** — auto-switch to `stackworks-logo-icon.svg` when rail collapses
- [x] **Mobile header** — use `stackworks-logo-icon.svg`; conditionally show `stackworks-wordmark.svg` alongside if space allows
- [x] **Favicon / browser tab** — add `<link rel="icon" href="/icons/stackworks-logo-icon.svg">` to all HTML entry points
- [ ] **Footer / simple text branding** — use `stackworks-wordmark.svg`
- [ ] **One-color / fallback / print / theme-conflict states** — use `stackworks-logo-mono.svg`
- [ ] Verify all variants render correctly at all target breakpoints
- [ ] Verify correct appearance in light and dark theme contexts (if applicable)

---

## Puzzles (Chess & Columns Chess) — planned

> **Intent:** Add tactical puzzle practice that fits StackWorks’ stage and strengths—**curated, teachable, and bounded**—not a chess.com-scale puzzle library or daily-puzzle product. Ship first for **Chess** and **Columns Chess**; design data model and shell hooks so other variants can follow later.

### Shell & play hub

- [ ] Add a **Puzzles** tab or primary section **between Bots and Coach** in the new shell **right** play panel for **both** `chess` and `columnsChess` entry flows (including narrow **Menu** parity where that surface mirrors shell panels)
- [ ] Wire **Puzzles** into `PlaySubSection` / `playHub.ts` (and any `ShellState` persistence) with tab order **Online → Bots → Puzzles → Coach → Local** (Resume remains contextual)
- [ ] Reuse existing shell styling (tabs, cards, typography) so Puzzles feels native, not bolted-on

### Product scope (player-facing)

- [ ] Expose **four puzzle difficulty tiers** for v1: **Beginner**, **Intermediate**, **Advanced**, **Master** (labels can be tuned; levels map to curated sets, not live matchmaking ratings)
- [ ] Use **small curated sets per level** (order-of-magnitude **10–20** puzzles per level per rotation), **rotated or refreshed periodically**—avoid promising a huge static library at launch
- [ ] After a successful solve (or on demand), show **solution line**, **short key ideas / teaching notes**, and **retry** so the mode reads as learning-first
- [ ] Optionally surface **one** of: **Random puzzle** (from current pool), **Daily puzzle** (pinned id per day), or both—keep implementation minimal until the content pipeline is stable
- [ ] Show **per-level progress** (e.g. “You’ve solved **3 / 10** Intermediate puzzles” for the current rotation), persisted locally and/or server-side when account sync exists
- [ ] Structure puzzle **content schema** and UI so later additions are easy: more puzzles per level, **hints**, **streaks**, **ratings**, leaderboards—without rewriting the shell tab

### Puzzle data & extensibility

- [ ] Define a **versioned puzzle record** (variant id, starting FEN/board state, side to move, full **solution move list** for the solver’s color, optional opponent “reply” moves where needed, metadata: level, title, tags, key ideas, attribution/source if any)
- [ ] Store curated sets in a maintainable way (e.g. JSON under `src/` or `public/`, or server-backed later); document how editors add/rotate content
- [ ] Keep engine integration read-only for puzzles where possible: **reuse existing move validation and rendering**; do not fork variant rules in the puzzle layer

### Solver UX (core interaction — v1 contract)

- [ ] **Solver color** is the color that **moves first** in the puzzle line; UI must state which side the user is playing
- [ ] For each solver turn, the player’s move must **match the next recorded solution move** (same semantics as normal legal moves for the variant)
- [ ] On a **wrong attempt**: show an **error toast** (or equivalent shell feedback) that the move is incorrect and they should try again; **revert the moved piece to its pre-attempt square** (and restore any captured state if the wrong move was a capture—spec capture edge cases per variant)
- [ ] Opponent / “other side” moves in the line should play out automatically (or as clearly labeled script steps) per puzzle design; details of pacing and animation can follow the main puzzle page spec
- [ ] **Full puzzle page flow** (navigation from tab, end states, abandon, next puzzle) — *tasks to be expanded when the page UX is specified*

### Puzzle authoring (“setup mode”) — `PROD` + `VITE_*` gate

- [ ] Expose the **puzzle setup** menu entry **only** when **`import.meta.env.PROD === true`** **and** a dedicated build-time flag is set — e.g. **`import.meta.env.VITE_PUZZLE_AUTHORING === '1'`** (exact name/string to match project convention for other `VITE_*` toggles). **Do not** rely on `DEV` or ad hoc runtime checks alone; match how **`VITE_EMIT_ADMIN`**, **`VITE_HIDE_LEGACY_PANEL_TOGGLE`**, etc. are wired in `vite.config.ts` / env.
- [ ] **Public production builds** ship with **`VITE_PUZZLE_AUTHORING` unset** (or not `1`) so the authoring UI is absent for normal players; **internal or authoring builds** set **`VITE_PUZZLE_AUTHORING=1`** at **`vite build`** time (e.g. `cross-env VITE_PUZZLE_AUTHORING=1 vite build`) the same way you opt into other emitted/admin surfaces.
- [ ] Because the gate is **`PROD` + `VITE_*`**, local **`vite dev`** does not show authoring unless you change that policy; test authoring with a **production build + preview** (or a one-off build with the flag), not by expecting dev server parity.
- [ ] In setup mode, author **starts from either White or Black** as the side that will **solve** the puzzle (first move in the recorded line defines solver color)
- [ ] Author plays through the position **as in a real game** (legal moves only): place or reach the start position, then record the **solution sequence**; support saving **title, level, key ideas**, and any required metadata
- [ ] **Save** produces puzzle data compatible with the curated-set pipeline (validate on save: line complete, variant-legal, solver moves contiguous)
- [ ] **Security / abuse:** with the flag off, bundlers should elide or never hit the authoring branch; with the flag on, treat the menu as privileged—still avoid obvious discoverability (no SEO, no deep link); consider server-side validation if puzzles ever become user-submitted

### QA & parity

- [ ] Smoke both variants: shell tab, level picker, solve/wrong-move revert, rotation/progress display, and authoring save path under a **`PROD` + `VITE_PUZZLE_AUTHORING=1`** build
- [ ] Confirm puzzle mode does not regress normal **offline/online/bot/coach** entry from the same game pages

---

## Non-Goals

- [ ] ~~Engine rewrite~~
- [ ] ~~Network protocol rewrite~~
- [ ] ~~Backend schema rewrite~~ (unless strictly necessary)
- [ ] ~~React migration~~

---

## Definition of Done

- [ ] All Phase 1–5 tasks above are checked off
- [ ] When **Puzzles** ships for Chess/Columns Chess, **Puzzles (Chess & Columns Chess) — planned** tasks for shell placement, player scope, authoring gate, and solver wrong-move behavior are checked off or explicitly deferred with rationale
- [ ] Existing offline smoke tests pass (see `docs/regression/offline-smoke.md`)
- [ ] Existing online multiplayer checklist passes (see `docs/multiplayer-checklist.md`)
- [ ] No game engine, renderer, or server code has been modified
- [ ] All game entry points (`chess.html`, `dama.html`, etc.) still launch correctly as standalone Vite entries
- [ ] Player identity panels display correctly in online, bot, friend, and spectate modes for all supported games
- [x] Player identity panels display country flags correctly when country metadata is available, and degrade cleanly when it is missing
- [ ] Player identity panels and account/profile surfaces use uploaded avatars correctly, with sensible fallback behavior for missing or invalid avatar data
- [ ] Account/profile surfaces let the user select country from a dropdown list and select a time zone, with best-effort defaults from origin IP / geolocation when available
- [ ] The shell left rail shows the signed-in user's avatar + display name when authenticated, and `Sign Up` / `Log In` actions when signed out
- [x] Clicking the StackWorks logo from in-game shell/board contexts behaves the same as clicking `Start Page`
- [ ] Shell is responsive on both desktop and mobile without covering board content
- [ ] On narrow game layouts, the Menu (or equivalent compact control) provides parity with the shell left/right panels on wide layouts—same reachable navigational and contextual actions, allowing for different presentation (sheets, segments, etc.)
- [ ] In portrait mobile layouts, shell navigation does not sit as a persistent tall header above the board
- [ ] In portrait mobile layouts, the first view is understandable at a glance: one primary action cluster, one visible game context, and no duplicate navigation or settings clutter
- [x] On supported game boards, clicking or touching a movable piece reveals valid candidate target squares when move highlighting is enabled
- [x] On supported game boards, users can complete legal moves through either select-then-target or drag-to-valid-target interaction
- [ ] In browser fullscreen, the shell header is hidden and does not consume top screen space
- [ ] On desktop/laptop layouts, the shell uses left/right panel pairs instead of a persistent top game header above the board
- [ ] The old UI is fully phased out: no user-facing legacy start page, no legacy desktop header layout, and no permanent `Legacy panels` fallback exposed in production
- [ ] All essential old-UI capabilities are preserved, but non-essential old-UI presentation clutter has been removed or demoted behind secondary surfaces
