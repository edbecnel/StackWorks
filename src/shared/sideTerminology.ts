import type { Player } from "../types";

export type SideLabels = { W: string; B: string };

function isCheckersPiecesThemeActive(): boolean {
  // "Checkers (Red/Black)" is a *piece theme* (Theme id: "checkers").
  // Terminology is driven by piece set, not the board.
  try {
    return localStorage.getItem("lasca.theme") === "checkers";
  } catch {
    return false;
  }
}

export function getSideLabelsForRuleset(
  rulesetId: string | null | undefined,
  opts: { boardSize?: number | null | undefined } = {}
): SideLabels {
  // Standard:
  // - When using Checkers (Red/Black) *pieces*: use Red/Black for disc games.
  // - Otherwise: Dama uses White/Black; other disc games use Light/Dark.
  // Internal saved state remains W/B (treated as Light/Dark semantics).
  void opts; // boardSize is intentionally ignored (terminology depends on pieces, not board size)
  const useRedBlack = isCheckersPiecesThemeActive();

  // Chess-like games always use White/Black.
  if (rulesetId === "chess" || rulesetId === "columns_chess") {
    return { W: "White", B: "Black" };
  }

  // Dama standard nomenclature is White/Black, unless the Checkers red/black pieces are active.
  if (rulesetId === "dama") {
    return useRedBlack ? { W: "Red", B: "Black" } : { W: "White", B: "Black" };
  }

  // Other disc games:
  // - Default: Light/Dark
  // - If the Checkers red/black pieces are active: Red/Black
  if (useRedBlack) return { W: "Red", B: "Black" };
  return { W: "Light", B: "Dark" };
}

export function sideLabelForRuleset(
  rulesetId: string | null | undefined,
  color: Player,
  opts: { boardSize?: number | null | undefined } = {}
): string {
  const labels = getSideLabelsForRuleset(rulesetId, opts);
  return color === "W" ? labels.W : labels.B;
}
