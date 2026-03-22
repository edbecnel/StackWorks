export type ThemeColorNomenclature = "white-black" | "light-dark" | "red-black";

export const THEME_COLOR_NOMENCLATURE: Record<string, ThemeColorNomenclature> = {
  classic: "white-black",
  checkers: "red-black",
  neo: "white-black",
  candy: "light-dark",
  raster2d: "white-black",
  columns_classic: "white-black",
  raster3d: "white-black",
  wooden: "light-dark",
  metal: "light-dark",
  stone: "white-black",
  semiprecious: "light-dark",
  glass: "light-dark",
  turtle: "light-dark",
  porcelain: "white-black",
  luminous: "white-black",
};

export function getThemeColorNomenclature(themeId: string | null | undefined): ThemeColorNomenclature {
  const normalizedThemeId = String(themeId ?? "").trim().toLowerCase();
  return THEME_COLOR_NOMENCLATURE[normalizedThemeId] ?? "white-black";
}