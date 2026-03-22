import { describe, expect, it } from "vitest";

import { getSideLabelsForRuleset } from "./sideTerminology";

describe("sideTerminology", () => {
  const lightDarkThemeIds = ["candy", "wooden", "metal", "semiprecious", "glass", "turtle"];

  it("uses White/Black for International Draughts by default", () => {
    localStorage.clear();
    expect(getSideLabelsForRuleset("draughts_international")).toEqual({ W: "White", B: "Black" });
  });

  it("uses Light/Dark for International Draughts on non-black-non-white piece themes", () => {
    for (const themeId of lightDarkThemeIds) {
      localStorage.clear();
      localStorage.setItem("lasca.theme", themeId);
      expect(getSideLabelsForRuleset("draughts_international")).toEqual({ W: "Light", B: "Dark" });
    }
  });

  it("uses Light/Dark for all non-chess rulesets on non-black-non-white piece themes", () => {
    for (const rulesetId of ["dama", "lasca", "damasca", "damasca_classic"]) {
      for (const themeId of lightDarkThemeIds) {
        localStorage.clear();
        localStorage.setItem("lasca.theme", themeId);
        expect(getSideLabelsForRuleset(rulesetId)).toEqual({ W: "Light", B: "Dark" });
      }
    }
  });

  it("uses Light/Dark for US Checkers on supported non-black-non-white piece themes", () => {
    for (const themeId of lightDarkThemeIds) {
      localStorage.clear();
      localStorage.setItem("lasca.checkers.theme", themeId);
      expect(getSideLabelsForRuleset("checkers_us")).toEqual({ W: "Light", B: "Dark" });
    }
  });

  it("keeps Red/Black for International Draughts when the checkers theme is active", () => {
    localStorage.clear();
    localStorage.setItem("lasca.theme", "checkers");
    expect(getSideLabelsForRuleset("draughts_international")).toEqual({ W: "Red", B: "Black" });
  });

  it("keeps Red/Black for non-chess rulesets when the checkers theme is active", () => {
    for (const rulesetId of ["dama", "lasca", "damasca", "damasca_classic"]) {
      localStorage.clear();
      localStorage.setItem("lasca.theme", "checkers");
      expect(getSideLabelsForRuleset(rulesetId)).toEqual({ W: "Red", B: "Black" });
    }

    localStorage.clear();
    localStorage.setItem("lasca.checkers.theme", "checkers");
    expect(getSideLabelsForRuleset("checkers_us")).toEqual({ W: "Red", B: "Black" });
  });

  it("keeps White/Black for Dama on classic black and white themes", () => {
    localStorage.clear();
    expect(getSideLabelsForRuleset("dama")).toEqual({ W: "White", B: "Black" });
  });

  it("keeps White/Black for all non-chess rulesets on classic black and white themes", () => {
    for (const rulesetId of ["dama", "draughts_international", "lasca", "damasca", "damasca_classic"]) {
      localStorage.clear();
      localStorage.setItem("lasca.theme", "classic");
      expect(getSideLabelsForRuleset(rulesetId)).toEqual({ W: "White", B: "Black" });
    }

    localStorage.clear();
    localStorage.setItem("lasca.checkers.theme", "classic");
    expect(getSideLabelsForRuleset("checkers_us")).toEqual({ W: "White", B: "Black" });
  });

  it("uses White/Black for chess-like identifiers", () => {
    localStorage.clear();
    expect(getSideLabelsForRuleset("chess")).toEqual({ W: "White", B: "Black" });
    expect(getSideLabelsForRuleset("chess_classic")).toEqual({ W: "White", B: "Black" });
    expect(getSideLabelsForRuleset("columns_chess")).toEqual({ W: "White", B: "Black" });
  });
});