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

/** Prefer the live board SVG that carries `data-theme-id` (set by themeManager.setTheme). */
function resolveBoardThemeSvg(): SVGSVGElement | null {
  if (typeof document === "undefined") return null;
  const withAttr: (SVGSVGElement | null)[] = [
    document.querySelector("#boardWrap > svg[data-theme-id]") as SVGSVGElement | null,
    document.querySelector("#boardWrap svg[data-theme-id]") as SVGSVGElement | null,
    document.querySelector("#boardWithEvalBar svg[data-theme-id]") as SVGSVGElement | null,
  ];
  for (const el of withAttr) {
    if (el?.getAttribute("data-theme-id")?.trim()) return el;
  }
  const fallback: (SVGSVGElement | null)[] = [
    document.querySelector("#boardWrap > svg") as SVGSVGElement | null,
    document.querySelector("#boardWrap svg") as SVGSVGElement | null,
    document.querySelector("#boardWithEvalBar svg") as SVGSVGElement | null,
    document.getElementById("boardSvg") as SVGSVGElement | null,
  ];
  for (const el of fallback) {
    if (el) return el;
  }
  return null;
}

function readThemeIdFromUi(): string {
  if (typeof document === "undefined") return "";
  // Authoritative during theme apply: setTheme() updates this before THEME_CHANGE, while
  // localStorage may not be saved until after synchronous theme listeners run.
  const boardSvg = resolveBoardThemeSvg();
  const fromBoard = boardSvg?.getAttribute("data-theme-id")?.trim().toLowerCase() ?? "";
  if (fromBoard) return fromBoard;

  const columnsSel = document.getElementById("columnsThemeSelect");
  if (columnsSel instanceof HTMLSelectElement) {
    const v = columnsSel.value?.trim().toLowerCase() ?? "";
    if (v) return v;
  }

  // `themeDropdown` is a div + custom menu on most pages — not a <select>; ignore unless it is a real select.
  const themeDropdownEl = document.getElementById("themeDropdown");
  if (themeDropdownEl instanceof HTMLSelectElement) {
    const v = themeDropdownEl.value?.trim().toLowerCase() ?? "";
    if (v) return v;
  }
  return "";
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
