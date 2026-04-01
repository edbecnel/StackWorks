import { afterEach, describe, expect, it } from "vitest";

import { getSideLabelsForRuleset } from "./sideTerminology";

describe("sideTerminology", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });
  it("uses White/Black for International Draughts by default", () => {
    localStorage.clear();
    expect(getSideLabelsForRuleset("draughts_international")).toEqual({ W: "White", B: "Black" });
  });

  it("prefers active variant theme storage over legacy keys", () => {
    localStorage.clear();
    localStorage.setItem("lasca.variantId", "dama_8");
    localStorage.setItem("lasca.opt.dama_8.theme", "candy");
    localStorage.setItem("lasca.theme", "classic");
    expect(getSideLabelsForRuleset("dama")).toEqual({ W: "Pink", B: "Violet" });
  });

  it("uses metadata defaults for non-chess themes", () => {
    localStorage.clear();
    localStorage.setItem("lasca.theme", "metal");
    expect(getSideLabelsForRuleset("dama")).toEqual({ W: "Steel", B: "Copper" });

    localStorage.clear();
    localStorage.setItem("lasca.theme", "turtle");
    expect(getSideLabelsForRuleset("damasca")).toEqual({ W: "Khaki", B: "Green" });
  });

  it("uses metadata variant labels for glass palettes", () => {
    localStorage.clear();
    localStorage.setItem("lasca.variantId", "dama_8");
    localStorage.setItem("lasca.opt.dama_8.theme", "glass");
    localStorage.setItem("lasca.opt.dama_8.theme.glassPalette", "cyan_violet");
    expect(getSideLabelsForRuleset("dama")).toEqual({ W: "Cyan", B: "Violet" });
  });

  it("keeps Red/Black for International Draughts when the checkers theme is active", () => {
    localStorage.clear();
    localStorage.setItem("lasca.theme", "checkers");
    expect(getSideLabelsForRuleset("draughts_international")).toEqual({ W: "Red", B: "Black" });
  });

  it("keeps Red/Black for non-chess rulesets when the checkers theme is active", () => {
    localStorage.clear();
    localStorage.setItem("lasca.theme", "checkers");
    expect(getSideLabelsForRuleset("dama")).toEqual({ W: "Red", B: "Black" });

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
    localStorage.setItem("lasca.theme", "candy");
    expect(getSideLabelsForRuleset("chess")).toEqual({ W: "White", B: "Black" });
    expect(getSideLabelsForRuleset("chess_classic")).toEqual({ W: "White", B: "Black" });
    expect(getSideLabelsForRuleset("columns_chess")).toEqual({ W: "White", B: "Black" });
  });

  it("prefers live board data-theme-id over stale storage (theme listener ordering)", () => {
    localStorage.clear();
    localStorage.setItem("lasca.variantId", "dama_8");
    localStorage.setItem("lasca.opt.dama_8.theme", "classic");

    const wrap = document.createElement("div");
    wrap.id = "boardWrap";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("data-theme-id", "candy");
    wrap.appendChild(svg);
    document.body.appendChild(wrap);

    expect(getSideLabelsForRuleset("dama")).toEqual({ W: "Pink", B: "Violet" });
  });
});