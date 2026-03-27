import type { Player } from "../types";
import { getThemeColorNomenclature } from "../theme/themeColorNomenclature";
import { THEME_SIDE_LABEL_RULESET_OVERRIDES, resolveThemeSideLabels } from "../theme/themeSideLabelMetadata";

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

function readThemeIdFromUi(): string {
  if (typeof document === "undefined") return "";
  const dropdown = document.getElementById("themeDropdown") as HTMLSelectElement | null;
  const selected = dropdown?.value?.trim().toLowerCase() ?? "";
  if (selected) return selected;
  const boardSvg = document.getElementById("boardSvg") as SVGSVGElement | null;
  const fromSvg = boardSvg?.getAttribute("data-theme-id")?.trim().toLowerCase() ?? "";
  return fromSvg;
}

function readThemeIdFromStorage(rulesetId: string | null | undefined): string {
  try {
    const activeVariantId = String(localStorage.getItem("lasca.variantId") ?? "").trim();
    if (activeVariantId) {
      const variantTheme = String(localStorage.getItem(`lasca.opt.${activeVariantId}.theme`) ?? "").trim().toLowerCase();
      if (variantTheme) return variantTheme;
    }
    // Legacy keys retained for backward compatibility.
    const legacyKey = rulesetId === "checkers_us" ? "lasca.checkers.theme" : "lasca.theme";
    return String(localStorage.getItem(legacyKey) ?? "").trim().toLowerCase();
  } catch {
    return "";
  }
}

function readThemeVariantIdFromUi(themeId: string): string {
  if (typeof document === "undefined") return "";
  if (themeId !== "glass") return "";
  const glassPaletteSelect = document.getElementById("glassPieceColorsSelect") as HTMLSelectElement | null;
  return glassPaletteSelect?.value?.trim().toLowerCase() ?? "";
}

function readThemeVariantIdFromStorage(themeId: string, rulesetId: string | null | undefined): string {
  if (themeId !== "glass") return "";
  try {
    const activeVariantId = String(localStorage.getItem("lasca.variantId") ?? "").trim();
    if (activeVariantId) {
      const variantGlassPalette = String(localStorage.getItem(`lasca.opt.${activeVariantId}.theme.glassPalette`) ?? "")
        .trim()
        .toLowerCase();
      if (variantGlassPalette) return variantGlassPalette;
    }
    const legacyKey = rulesetId === "checkers_us" ? "lasca.checkers.theme.glassPalette" : "lasca.theme.glassPalette";
    return String(localStorage.getItem(legacyKey) ?? "").trim().toLowerCase();
  } catch {
    return "";
  }
}

function resolveMetadataLabels(args: {
  rulesetId: string | null | undefined;
  themeId: string;
  themeVariantId: string;
}): SideLabels | null {
  const normalizedRulesetId = String(args.rulesetId ?? "").trim().toLowerCase();
  const normalizedThemeId = String(args.themeId ?? "").trim().toLowerCase();
  const normalizedThemeVariantId = String(args.themeVariantId ?? "").trim().toLowerCase();
  if (!normalizedThemeId) return null;

  const rulesetOverrides = THEME_SIDE_LABEL_RULESET_OVERRIDES[normalizedRulesetId];
  const rulesetThemeDef = rulesetOverrides?.[normalizedThemeId];
  if (rulesetThemeDef) {
    if (normalizedThemeVariantId && rulesetThemeDef.variants?.[normalizedThemeVariantId]) {
      return rulesetThemeDef.variants[normalizedThemeVariantId];
    }
    return rulesetThemeDef.default;
  }

  return resolveThemeSideLabels(normalizedThemeId, normalizedThemeVariantId);
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
    const uiThemeId = readThemeIdFromUi();
    if (uiThemeId) return uiThemeId;
    return readThemeIdFromStorage(rulesetId);
  })();
  const themeVariantId = (() => {
    const uiVariantId = readThemeVariantIdFromUi(themeId);
    if (uiVariantId) return uiVariantId;
    return readThemeVariantIdFromStorage(themeId, rulesetId);
  })();
  const metadataLabels = resolveMetadataLabels({ rulesetId, themeId, themeVariantId });
  if (metadataLabels) return metadataLabels;
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
