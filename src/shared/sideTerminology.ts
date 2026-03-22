import type { Player } from "../types";

export type SideLabels = { W: string; B: string };

const INTERNATIONAL_DRAUGHTS_LIGHT_DARK_THEME_IDS = new Set([
  "wooden",
  "metal",
  "semiprecious",
  "glass",
  "turtle",
]);

export function getSideLabelsForRuleset(
  rulesetId: string | null | undefined,
  opts: { boardSize?: number | null | undefined } = {}
): SideLabels {
  // Standard:
  // - When using Checkers (Red/Black) *pieces*: use Red/Black for disc games.
  // - Otherwise: Dama uses White/Black; other disc games use Light/Dark.
  // - International Draughts uses Light/Dark for non-black/non-white piece themes.
  // Internal saved state remains W/B (treated as Light/Dark semantics).
  void opts; // boardSize is intentionally ignored (terminology depends on pieces, not board size)
  const themeId = (() => {
    const key = rulesetId === "checkers_us" ? "lasca.checkers.theme" : "lasca.theme";
    try {
      return String(localStorage.getItem(key) ?? "").trim().toLowerCase();
    } catch {
      return "";
    }
  })();
  const useRedBlack = themeId === "checkers";

  // Chess-like games always use White/Black.
  if (rulesetId === "chess" || rulesetId === "chess_classic" || rulesetId === "columns_chess") {
    return { W: "White", B: "Black" };
  }

  if (rulesetId === "draughts_international") {
    if (useRedBlack) return { W: "Red", B: "Black" };
    if (INTERNATIONAL_DRAUGHTS_LIGHT_DARK_THEME_IDS.has(themeId)) return { W: "Light", B: "Dark" };
    return { W: "White", B: "Black" };
  }

  // Dama uses White/Black by default, unless the Checkers red/black pieces are active.
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
