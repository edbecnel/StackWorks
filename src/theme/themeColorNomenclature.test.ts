import { describe, expect, it } from "vitest";

import { getThemeColorNomenclature } from "./themeColorNomenclature";

describe("themeColorNomenclature", () => {
  it("maps white-black piece themes", () => {
    for (const themeId of ["classic", "staunton_glyphs", "stone", "porcelain", "luminous"]) {
      expect(getThemeColorNomenclature(themeId)).toBe("white-black");
    }
  });

  it("maps light-dark piece themes", () => {
    for (const themeId of ["candy", "wooden", "metal", "semiprecious", "glass", "turtle"]) {
      expect(getThemeColorNomenclature(themeId)).toBe("light-dark");
    }
  });

  it("maps the checkers theme to red-black", () => {
    expect(getThemeColorNomenclature("checkers")).toBe("red-black");
  });

  it("defaults unknown themes to white-black", () => {
    expect(getThemeColorNomenclature("unknown-theme")).toBe("white-black");
  });
});