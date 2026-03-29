import { describe, expect, it } from "vitest";
import {
  getPairedCheckerboardTheme,
  getShellThemeValueFromStoredTheme,
  getStoredThemeIdFromShellThemeValue,
  NEO_STONE_CHESS_PRESET_ID,
  normalizeClassicShellThemeValue,
  normalizeColumnsShellThemeValue,
} from "./themePresets";

describe("themePresets", () => {
  it("maps the Neo Stone chess preset to the stone checkerboard", () => {
    expect(getPairedCheckerboardTheme(NEO_STONE_CHESS_PRESET_ID)).toBe("stone");
    expect(getStoredThemeIdFromShellThemeValue(NEO_STONE_CHESS_PRESET_ID)).toBe("neo");
  });

  it("pairs the Tournament chess theme with the Tournament checkerboard", () => {
    expect(getPairedCheckerboardTheme("staunton_glyphs")).toBe("tournament");
    expect(getStoredThemeIdFromShellThemeValue("staunton_glyphs")).toBe("staunton_glyphs");
    expect(normalizeClassicShellThemeValue("tournament")).toBe("staunton_glyphs");
  });

  it("normalizes and restores the Neo Stone chess preset from stored neo + stone", () => {
    expect(normalizeClassicShellThemeValue(NEO_STONE_CHESS_PRESET_ID)).toBe(NEO_STONE_CHESS_PRESET_ID);
    expect(
      getShellThemeValueFromStoredTheme({
        variantId: "chess_classic",
        themeId: "neo",
        checkerboardThemeId: "stone",
      }),
    ).toBe(NEO_STONE_CHESS_PRESET_ID);
  });

  it("restores the Tournament chess theme from stored theme id", () => {
    expect(
      getShellThemeValueFromStoredTheme({
        variantId: "chess_classic",
        themeId: "staunton_glyphs",
        checkerboardThemeId: "tournament",
      }),
    ).toBe("staunton_glyphs");
  });

  it("supports the Tournament theme for Columns Chess", () => {
    expect(normalizeColumnsShellThemeValue("tournament")).toBe("staunton_glyphs");
    expect(
      getShellThemeValueFromStoredTheme({
        variantId: "columns_chess",
        themeId: "staunton_glyphs",
        checkerboardThemeId: "tournament",
      }),
    ).toBe("staunton_glyphs");
  });

  it("pairs raster 2D/3D chess shell values with the classic checkerboard", () => {
    expect(getPairedCheckerboardTheme("raster2d")).toBe("classic");
    expect(getPairedCheckerboardTheme("raster3d")).toBe("classic");
  });
});