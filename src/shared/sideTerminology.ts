import type { Player } from "../types";
import { getThemeColorNomenclature } from "../theme/themeColorNomenclature";

export type SideLabels = { W: string; B: string };

function sideLabelsFromThemeNomenclature(themeColorNomenclature: ReturnType<typeof getThemeColorNomenclature>): SideLabels {
  switch (themeColorNomenclature) {
    case "red-black":
      return { W: "Red", B: "Black" };
    case "light-dark":
      return { W: "Light", B: "Dark" };
    default:
      return { W: "White", B: "Black" };
  }
}

export function getSideLabelsForRuleset(
  rulesetId: string | null | undefined,
  opts: { boardSize?: number | null | undefined; themeId?: string | null | undefined } = {}
): SideLabels {
  // Standard:
  // - When using Checkers (Red/Black) *pieces*: use Red/Black for disc games.
  // - Non-chess games use Light/Dark for non-black/non-white piece themes.
  // - Dama and International Draughts keep White/Black for classic black/white themes.
  // Internal saved state remains W/B (treated as Light/Dark semantics).
  const themeId = (() => {
    if (typeof opts.themeId === "string" && opts.themeId.trim()) {
      return opts.themeId.trim().toLowerCase();
    }
    const key = rulesetId === "checkers_us" ? "lasca.checkers.theme" : "lasca.theme";
    try {
      return String(localStorage.getItem(key) ?? "").trim().toLowerCase();
    } catch {
      return "";
    }
  })();
  const themeColorNomenclature = getThemeColorNomenclature(themeId);
  const themeLabels = sideLabelsFromThemeNomenclature(themeColorNomenclature);

  // Chess-like games always use White/Black.
  if (rulesetId === "chess" || rulesetId === "chess_classic" || rulesetId === "columns_chess") {
    return { W: "White", B: "Black" };
  }

  if (rulesetId === "draughts_international") {
    return themeLabels;
  }

  // Non-chess disc games use the piece-theme nomenclature table directly.
  if (rulesetId === "dama") {
    return themeLabels;
  }

  return themeLabels;
}

export function sideLabelForRuleset(
  rulesetId: string | null | undefined,
  color: Player,
  opts: { boardSize?: number | null | undefined; themeId?: string | null | undefined } = {}
): string {
  const labels = getSideLabelsForRuleset(rulesetId, opts);
  return color === "W" ? labels.W : labels.B;
}
