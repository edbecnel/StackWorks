import type { RulesetId, VariantId, VariantSpec } from "./variantTypes";

import lascaBoardSvgUrl from "../assets/lasca_board.svg?url";
import graphBoard8x8SvgUrl from "../assets/graph_board_8x8.svg?url";
import columnsChessBoardSvgUrl from "../assets/columns_chess_board.svg?url";
import checkersBoard8x8SvgUrl from "../assets/checkers_board_8x8.svg?url";

const RULESET_LABEL: Record<RulesetId, string> = {
  lasca: "Lasca",
  dama: "Dama Classic",
  damasca: "Damasca International",
  damasca_classic: "Damasca Classic",
  checkers_us: "US Checkers",
  columns_chess: "Columns Chess",
  chess: "Classic Chess",
};

export const VARIANTS: readonly VariantSpec[] = [
  {
    variantId: "lasca_7_classic",
    displayName: "Lasca Classic",
    subtitle: "Rules: Lasca • Board: 7×7 • Pieces: 11/side",
    rulesetId: "lasca",
    boardSize: 7,
    piecesPerSide: 11,
    svgAsset: lascaBoardSvgUrl,
    entryUrl: "./lasca",
    defaultSaveName: "lasca_7_classic-save.json",
    available: true,
  },
  {
    variantId: "columns_chess",
    displayName: "Columns Chess",
    subtitle: "Chess moves + stacking captures (captured discs stack under the mover).",
    rulesetId: "columns_chess",
    boardSize: 8,
    piecesPerSide: 16,
    svgAsset: columnsChessBoardSvgUrl,
    entryUrl: "./columnsChess",
    defaultSaveName: "columns_chess-preview.json",
    available: true,
  },
  {
    variantId: "chess_classic",
    displayName: "Classic Chess",
    subtitle: "Standard chess (no stacks/columns). Check, castling, en passant, promotion.",
    rulesetId: "chess",
    boardSize: 8,
    piecesPerSide: 16,
    svgAsset: columnsChessBoardSvgUrl,
    entryUrl: "./chess",
    defaultSaveName: "chess_classic-save.json",
    available: true,
  },
  {
    variantId: "checkers_8_us",
    displayName: "Checkers (US)",
    subtitle: "American checkers/draughts. Mandatory capture. Men capture forward only. Kings move 1 (non-flying).",
    rulesetId: "checkers_us",
    boardSize: 8,
    piecesPerSide: 12,
    startingPlayer: "B",
    svgAsset: checkersBoard8x8SvgUrl,
    entryUrl: "./dama.html",
    defaultSaveName: "checkers_8_us-save.json",
    available: true,
  },
  {
    variantId: "lasca_8_dama_board",
    displayName: "Lasca 8×8",
    subtitle: "Lasca rules on an 8×8 board (stacking captures).",
    rulesetId: "lasca",
    boardSize: 8,
    piecesPerSide: 12,
    svgAsset: graphBoard8x8SvgUrl,
    entryUrl: "./lasca8x8",
    defaultSaveName: "lasca_8_dama_board-save.json",
    available: true,
  },
  {
    variantId: "dama_8_classic_standard",
    displayName: "Dama Classic",
    subtitle: "Rules: Dama Classic • Board: 8×8 • Pieces: 12/side • Capture removal: Immediate",
    rulesetId: "dama",
    boardSize: 8,
    piecesPerSide: 12,
    svgAsset: graphBoard8x8SvgUrl,
    entryUrl: "./dama",
    defaultSaveName: "dama_8_classic_standard-save.json",
    damaCaptureRemoval: "immediate",
    available: true,
  },
  {
    variantId: "dama_8_classic_international",
    displayName: "Dama International",
    subtitle: "Rules: Dama International • Board: 8×8 • Pieces: 12/side • Capture removal: End-of-sequence",
    rulesetId: "dama",
    boardSize: 8,
    piecesPerSide: 12,
    svgAsset: graphBoard8x8SvgUrl,
    entryUrl: "./dama",
    defaultSaveName: "dama_8_classic_international-save.json",
    damaCaptureRemoval: "end_of_sequence",
    available: true,
  },
  {
    variantId: "damasca_8_classic",
    displayName: "Damasca Classic",
    subtitle: "Dama movement + Lasca stacking captures. Mandatory capture. Max-capture rule. Non-flying officers.",
    rulesetId: "damasca_classic",
    boardSize: 8,
    piecesPerSide: 12,
    svgAsset: graphBoard8x8SvgUrl,
    entryUrl: "./damasca",
    defaultSaveName: "damasca_8_classic-save.json",
    available: true,
  },
  {
    variantId: "damasca_8",
    displayName: "Damasca International",
    subtitle: "Dama movement + Lasca stacking captures. Mandatory capture. Max-capture rule. Flying officers.",
    rulesetId: "damasca",
    boardSize: 8,
    piecesPerSide: 12,
    svgAsset: graphBoard8x8SvgUrl,
    entryUrl: "./damasca",
    defaultSaveName: "damasca_8-save.json",
    available: true,
  },
] as const;

// Backward-compatibility aliases for removed/renamed variant IDs.
const VARIANT_ID_ALIASES: Partial<Record<string, VariantId>> = {
  dama_8_classic: "dama_8_classic_standard",
};

export const DEFAULT_VARIANT_ID: VariantId = "lasca_7_classic";

export function getVariantById(id: VariantId): VariantSpec {
  const canonical = (VARIANT_ID_ALIASES[id] ?? id) as VariantId;
  const found = VARIANTS.find((v) => v.variantId === canonical);
  if (!found) throw new Error(`Unknown variantId: ${id}`);
  return found;
}

export function isVariantId(id: string): id is VariantId {
  return (
    (VARIANTS as readonly VariantSpec[]).some((v) => v.variantId === id) ||
    Object.prototype.hasOwnProperty.call(VARIANT_ID_ALIASES, id)
  );
}

export function rulesBoardLine(rulesetId: RulesetId, boardSize: 7 | 8): string {
  const label = RULESET_LABEL[rulesetId] ?? String(rulesetId);
  return `${label} Rules • ${boardSize}×${boardSize} Board`;
}

export function rulesBoardLineForVariant(variantId: VariantId): string {
  const v = getVariantById(variantId);
  return rulesBoardLine(v.rulesetId, v.boardSize);
}
