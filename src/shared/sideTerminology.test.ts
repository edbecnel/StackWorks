import { describe, expect, it } from "vitest";

import { getSideLabelsForRuleset } from "./sideTerminology";

describe("sideTerminology", () => {
  it("uses White/Black for International Draughts by default", () => {
    localStorage.clear();
    expect(getSideLabelsForRuleset("draughts_international")).toEqual({ W: "White", B: "Black" });
  });

  it("uses Light/Dark for International Draughts on non-black-non-white piece themes", () => {
    for (const themeId of ["candy", "wooden", "metal", "semiprecious", "glass", "turtle"]) {
      localStorage.clear();
      localStorage.setItem("lasca.theme", themeId);
      expect(getSideLabelsForRuleset("draughts_international")).toEqual({ W: "Light", B: "Dark" });
    }
  });

  it("keeps Red/Black for International Draughts when the checkers theme is active", () => {
    localStorage.clear();
    localStorage.setItem("lasca.theme", "checkers");
    expect(getSideLabelsForRuleset("draughts_international")).toEqual({ W: "Red", B: "Black" });
  });

  it("uses White/Black for chess-like identifiers", () => {
    localStorage.clear();
    expect(getSideLabelsForRuleset("chess")).toEqual({ W: "White", B: "Black" });
    expect(getSideLabelsForRuleset("chess_classic")).toEqual({ W: "White", B: "Black" });
    expect(getSideLabelsForRuleset("columns_chess")).toEqual({ W: "White", B: "Black" });
  });
});