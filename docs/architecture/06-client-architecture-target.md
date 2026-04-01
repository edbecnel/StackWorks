# 06 - Client Architecture (Target / Inferred)

Status: In Progress  
Confidence: Medium

Related:

- [05-client-architecture-current.md](./05-client-architecture-current.md)
- [12-refactor-hotspots.md](./12-refactor-hotspots.md)
- [13-risks-tech-debt-and-gaps.md](./13-risks-tech-debt-and-gaps.md)

## Intended Target (Inferable From Repo Direction)

### Shell-First Product UX Across Start and Game Pages

- Responsibility: Provide consistent product navigation and action surfaces while preserving board-first play.
- Status: In Progress
- Confidence: High
- Key files/folders:
  - `docs/refactor-ui-shell.md`
  - `src/ui/shell/appShell.ts`
  - `src/ui/shell/gameShell.ts`
  - `src/ui/shell/playHub.ts`
- Inputs:
  - Existing page controls and shell state.
- Outputs:
  - Unified shell experiences with fewer duplicated legacy controls.
- Dependencies:
  - Existing per-page HTML and panel content.
- Common modification points:
  - Shell style/layout logic and panel body routing.

### Narrow-Viewport Menu Parity With Desktop Shell

- Responsibility: Ensure compact menu layout preserves functional parity with shell panel capabilities.
- Status: Planned
- Confidence: Medium
- Key files/folders:
  - `docs/refactor-ui-shell.md` (explicit parity rules)
  - `src/ui/shell/gameShell.ts`
  - `src/ui/panelLayoutMode.ts`
- Inputs:
  - Viewport mode and panel layout mode.
- Outputs:
  - Equivalent actions across desktop and mobile-like layouts.
- Dependencies:
  - Existing panel sections and menu overlays.
- Common modification points:
  - Compact trigger, overlay panel assembly, menu action mapping.

### Settings Hub Consolidation

- Responsibility: Move scattered persistent preferences toward clearer settings grouping.
- Status: Planned
- Confidence: Medium
- Key files/folders:
  - Directional requirements in `docs/refactor-ui-shell.md`
  - Existing preference writes in `src/indexMain.ts`, `src/*Main.ts`
- Inputs:
  - User preference changes.
- Outputs:
  - Reduced option duplication and cleaner launch/game surfaces.
- Dependencies:
  - Variant-specific compatibility of preference keys.
- Common modification points:
  - Start page options and per-variant option UIs.

## Already In Progress vs Anticipated

### Already In Progress (Code-visible)

- Shell nav + app shell scaffolding (`src/ui/shell/appShell.ts`, `src/ui/shell/gameShell.ts`).
- Play hub with staged online/bot/coach sections (`src/ui/shell/playHub.ts`).
- Shell state model includes broader sections than currently fully implemented (`src/config/shellState.ts`).

### Anticipated (Not fully implemented)

- Legacy toggle retirement after parity completion.
- Stronger unification of settings and persistent preference surfaces.
- Further simplification of mobile/narrow interaction pathways.

## Likely Migration Seams and Compatibility Layers

### Seam: Desktop legacy-shell dual mode

- Status: In Progress
- Confidence: High
- Implemented seam:
  - `stackworks.gameShell.desktopPanelMode` and env gating in `src/ui/shell/gameShell.ts`.
- Migration note:
  - Preserve behavior parity tests before removing legacy mode.

### Seam: Start page launcher values vs shell state

- Status: In Progress
- Confidence: Medium
- Implemented seam:
  - Mixed launcher LS keys in `src/indexMain.ts` and shell-state keys in `src/config/shellState.ts`.
- Migration note:
  - Define canonical source-of-truth keys per preference.

### Seam: Variant-specific page bootstraps

- Status: Implemented
- Confidence: High
- Compatibility layer:
  - Keep per-variant `*Main.ts` entry points while converging shared shell and options behavior.
- Migration note:
  - Favor shared utility extraction over forced SPA conversion.

## Unknowns Requiring Confirmation

- Status: Unknown
- Confidence: Low
- Whether a full design-system pass will normalize all shell/game styles.
- Whether any variant pages will be merged/retired at routing level.
- Final cutoff milestone for shipping without legacy panel mode.
- TODO: confirm with maintainers and roadmap owners.
