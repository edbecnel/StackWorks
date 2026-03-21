import type { CheckerboardThemeId } from "../render/checkerboardTheme";
import type { VariantId } from "../variants/variantTypes";

export const WOODY_CHESS_PRESET_ID = "wooden3d" as const;

export type ShellChessThemeValue = "raster2d" | "raster3d" | "neo" | "candy" | typeof WOODY_CHESS_PRESET_ID;
export type ShellColumnsThemeValue = "columns_classic" | "raster2d" | "raster3d" | "neo" | "candy" | typeof WOODY_CHESS_PRESET_ID;

export function getPairedCheckerboardTheme(themeId: string | null | undefined): CheckerboardThemeId | null {
  switch (String(themeId ?? "").trim().toLowerCase()) {
    case "classic":
    case "columns_classic":
    case "metal":
      return "classic";
    case "checkers":
      return "checkers";
    case "glass":
      return "blue";
    case "turtle":
      return "green";
    case "luminous":
    case "neo":
      return "blue";
    case "porcelain":
      return "stone";
    case "wooden":
    case WOODY_CHESS_PRESET_ID:
      return "burled";
    case "stone":
    case "semiprecious":
      return "stone";
    case "candy":
      return "candy";
    default:
      return null;
  }
}

export function normalizeClassicShellThemeValue(raw: string | null | undefined): ShellChessThemeValue {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "neo") return "neo";
  if (value === "candy") return "candy";
  if (value === WOODY_CHESS_PRESET_ID) return WOODY_CHESS_PRESET_ID;
  if (value === "raster2d" || value === "2d") return "raster2d";
  if (value === "raster3d" || value === "3d") return "raster3d";
  return "raster3d";
}

export function normalizeColumnsShellThemeValue(raw: string | null | undefined): ShellColumnsThemeValue {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "neo") return "neo";
  if (value === "candy") return "candy";
  if (value === WOODY_CHESS_PRESET_ID) return WOODY_CHESS_PRESET_ID;
  if (value === "raster3d" || value === "3d") return "raster3d";
  if (value === "raster2d" || value === "2d") return "raster2d";
  if (value === "columns_classic" || value === "classic" || value === "discs" || value === "disc") return "columns_classic";
  return "columns_classic";
}

export function getShellThemeValueFromStoredTheme(args: {
  variantId: VariantId;
  themeId: string | null | undefined;
  checkerboardThemeId: CheckerboardThemeId | null | undefined;
}): ShellChessThemeValue | ShellColumnsThemeValue {
  const themeId = String(args.themeId ?? "").trim().toLowerCase();
  if (themeId === "raster3d" && args.checkerboardThemeId === "burled") {
    return WOODY_CHESS_PRESET_ID;
  }
  return args.variantId === "columns_chess"
    ? normalizeColumnsShellThemeValue(themeId)
    : normalizeClassicShellThemeValue(themeId);
}

export function getStoredThemeIdFromShellThemeValue(value: ShellChessThemeValue | ShellColumnsThemeValue): "columns_classic" | "raster2d" | "raster3d" | "neo" | "candy" {
  if (value === WOODY_CHESS_PRESET_ID) return "raster3d";
  if (value === "neo") return "neo";
  if (value === "candy") return "candy";
  if (value === "raster2d") return "raster2d";
  if (value === "columns_classic") return "columns_classic";
  return "raster3d";
}