# 14 - Variant Architecture Delta Matrix

Status: Implemented  
Confidence: High

Related:

- [05-client-architecture-current.md](./05-client-architecture-current.md)
- [09-shared-domain-and-contracts.md](./09-shared-domain-and-contracts.md)
- [11-code-map.md](./11-code-map.md)
- [12-refactor-hotspots.md](./12-refactor-hotspots.md)

Purpose:

- Compare architectural and code-organization deltas across major variants.
- Highlight shared vs specialized vs overridden vs duplicated paths.
- Provide practical starting points for variant changes.

> **Note on top-level Confidence:** `Confidence: High` applies to established current-state code references. Individual "Still Unclear" cells and the "Known Unclear Areas" section carry lower confidence; read those cells directly rather than relying on the document-level rating.

## Shared Baseline Across Most Variants

- Shared engine/runtime modules:
  - `src/game/*`
  - `src/controller/gameController.ts`
  - `src/render/*`
  - `src/ui/*`
  - `src/driver/*`
  - `src/shared/*`
- Shared variant metadata source:
  - `src/variants/variantRegistry.ts`
- Shared shell and layout scaffolding:
  - `src/ui/shell/gameShell.ts`
  - `src/ui/panelLayoutMode.ts`

## Delta Matrix

<a id="table-14-1"></a>

Table cross-reference: [Rendered table view](./tables-only.html#table-14-1)

| Variant / Group                                             | Entry and Mapping                                                | Shared                                              | Specialized                                                                                       | Overridden                                                         | Duplicated                                                                                | Still Unclear                                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Start Page Launcher (all variants)                          | `src/indexMain.ts` + `src/index.html`                            | Variant registry, shell state, auth/session helpers | Launch parameter synthesis, lobby/account/start UX                                                | Per-variant launch preference keys and visibility of options       | Large amount of per-variant branching in one module                                       | Long-term split between launcher state and shell state ownership       |
| Lasca 7x7 (classic)                                         | `src/main.ts`, `src/lasca.html`, `src/variants/activeVariant.ts` | Core controller/render/driver stack                 | Lasca board asset wiring, Lasca-specific labels/options                                           | Uses active variant indirection (`activeVariant.ts`)               | Pattern overlaps with other non-chess variants                                            | Whether activeVariant indirection remains or is normalized             |
| Lasca 8x8                                                   | `src/lasca8x8Main.ts`, `src/lasca8x8.html`                       | Same baseline as Lasca 7x7                          | 8x8 board and option defaults, variant-specific LS keys                                           | Variant constant differs from classic Lasca path                   | Similar bootstrap logic to `src/main.ts`                                                  | Possible consolidation with other draughts-family bootstraps           |
| Dama + US Checkers + International Draughts                 | `src/damaMain.ts`, `src/dama.html`                               | Shared baseline and non-chess controller paths      | Runtime variant selection among dama/checkers/international; international numbering options      | Ruleset-specific coord/notation/render options in one entry module | Substantial overlap with `src/columnsDraughtsMain.ts` and `src/damascaMain.ts` bootstraps | Whether this cluster should split or keep one multi-variant entry      |
| Damasca (classic + international)                           | `src/damascaMain.ts`, `src/damasca.html`                         | Shared baseline                                     | Runtime switch between `damasca_8_classic` and `damasca_8`; stacking-capture-specific UI behavior | Variant-select and save-label logic specific to Damasca            | Bootstrap resembles Lasca/Dama structures                                                 | Future relationship with Columns Draughts module boundaries            |
| Columns Draughts 10x10                                      | `src/columnsDraughtsMain.ts`, `src/columnsDraughts.html`         | Shared non-chess baseline                           | Fixed 10x10 columns-draughts variant and international-style board options                        | Uses dedicated active variant constant and 10x10 assets            | Significant overlap with `src/damaMain.ts` structure                                      | Whether shared 10x10 non-chess bootstrap abstraction will be extracted |
| Classic Chess                                               | `src/chessMain.ts`, `src/chess.html`                             | Shared shell/driver/controller scaffolding          | Chess bot manager, evaluation panel behavior, chess notation and PGN annotations                  | Chess-specific move preview, selectors, board visualization tools  | Some overlap with Columns Chess startup patterns                                          | Whether chess/columns-chess can share a tighter boot abstraction       |
| Columns Chess                                               | `src/columnsChessMain.ts`, `src/columnsChess.html`               | Shared shell/driver/controller stack                | Columns-chess bot manager and columns-specific option keys                                        | Theme/checkerboard migrations and columns-specific selectors       | Startup and option wiring similar to `src/chessMain.ts`                                   | Final split of shared chess-family bootstrap vs separate files         |
| Admin Tools (non-game variant but architecture-significant) | `src/adminMain.ts`, `src/admin.html`                             | Shared protocol types, common UI helpers            | Admin token handling, room delete UX, lobby admin controls                                        | Admin-specific API query params and error handling                 | Some identity chip rendering duplicated from user-facing lobby contexts                   | Long-term product location and exposure policy for admin UI            |

## Per-Variant Start Points

### Start Page Launcher (all variants)

- Start in:
  - `src/indexMain.ts`
  - `src/variants/variantRegistry.ts`
  - `src/shared/openVariantPageIntent.ts`
- Check next:
  - `src/ui/shell/appShell.ts`
  - `src/ui/shell/playHub.ts`

### Lasca 7x7

- Start in:
  - `src/main.ts`
  - `src/variants/activeVariant.ts`
- Check next:
  - `src/controller/gameController.ts`
  - `src/game/*` (Lasca behavior)

### Lasca 8x8

- Start in:
  - `src/lasca8x8Main.ts`
  - `src/variants/variantRegistry.ts`
- Check next:
  - `src/render/*` board viewport/coords behavior

### Dama / Checkers / International Draughts

- Start in:
  - `src/damaMain.ts`
  - `src/variants/variantRegistry.ts`
- Check next:
  - `src/game/damaCaptureChain.ts`
  - `src/game/internationalDraughtsDraw.ts`
  - `src/ui/boardCoordsInSquaresOption.ts`

### Damasca

- Start in:
  - `src/damascaMain.ts`
  - `src/variants/variantRegistry.ts`
- Check next:
  - `src/game/damascaCaptureChain.ts`
  - `src/game/damascaDeadPlay.ts`

### Columns Draughts

- Start in:
  - `src/columnsDraughtsMain.ts`
  - `src/variants/variantRegistry.ts`
- Check next:
  - `src/game/damascaCaptureChain.ts`
  - `src/game/internationalDraughtsDraw.ts`

### Classic Chess

- Start in:
  - `src/chessMain.ts`
  - `src/bot/chessBotManager.ts`
- Check next:
  - `src/chessMoveHistoryNotation.ts`
  - `src/chessPgnAnnotations.ts`

### Columns Chess

- Start in:
  - `src/columnsChessMain.ts`
  - `src/bot/columnsChessBotManager.ts`
- Check next:
  - `src/game/movegenColumnsChess.ts`
  - `src/ui/chessEvaluationPanel.ts`

## Duplication Reduction Opportunities

### Opportunity 1: Shared non-chess bootstrap helper

- Candidate files:
  - `src/main.ts`
  - `src/lasca8x8Main.ts`
  - `src/damascaMain.ts`
  - `src/damaMain.ts`
  - `src/columnsDraughtsMain.ts`
- Potential gain:
  - Centralize repeated shell/overlay/options startup logic.

### Opportunity 2: Shared chess-family bootstrap helper

- Candidate files:
  - `src/chessMain.ts`
  - `src/columnsChessMain.ts`
- Potential gain:
  - Consolidate repeated board/theme/layout/bot panel initialization.

### Opportunity 3: LocalStorage key and option registration normalization

- Candidate files:
  - Most `src/*Main.ts`
  - `src/indexMain.ts`
- Potential gain:
  - Reduce key drift and improve migration safety.

## Known Unclear Areas

- Status: Unknown
- Confidence: Medium
- Whether variant entry files will remain as-is or get deeper abstraction extraction after shell migration.
- Whether some variant groups (especially non-chess 8x8/10x10 families) will be reorganized by ruleset family.
- TODO: confirm target modularization plan before committing to larger structural moves.
