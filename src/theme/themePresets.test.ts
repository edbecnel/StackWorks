import { describe, expect, it } from "vitest";
import {
  getPairedCheckerboardTheme,
  getShellThemeValueFromStoredTheme,
  getStoredThemeIdFromShellThemeValue,
  NEO_STONE_CHESS_PRESET_ID,
  normalizeClassicShellThemeValue,
} from "./themePresets";

describe("themePresets", () => {
  it("maps the Neo Stone chess preset to the stone checkerboard", () => {
    expect(getPairedCheckerboardTheme(NEO_STONE_CHESS_PRESET_ID)).toBe("stone");
    expect(getStoredThemeIdFromShellThemeValue(NEO_STONE_CHESS_PRESET_ID)).toBe("neo");
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
});