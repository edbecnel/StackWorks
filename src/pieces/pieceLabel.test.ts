import { describe, expect, it } from "vitest";

import { pieceTooltip } from "./pieceLabel";

describe("pieceTooltip", () => {
  it("uses Dama terminology with classic black and white themes", () => {
    expect(pieceTooltip({ owner: "W", rank: "S" }, { rulesetId: "dama", themeId: "classic" })).toBe("White Man");
    expect(pieceTooltip({ owner: "B", rank: "O" }, { rulesetId: "dama", themeId: "classic" })).toBe("Black King");
  });

  it("uses Light/Dark nomenclature for tooltips on supported non-chess themes", () => {
    expect(pieceTooltip({ owner: "W", rank: "S" }, { rulesetId: "dama", themeId: "candy" })).toBe("Light Man");
    expect(pieceTooltip({ owner: "B", rank: "O" }, { rulesetId: "draughts_international", themeId: "glass" })).toBe("Dark King");
  });

  it("uses Red/Black nomenclature for tooltips on the checkers theme", () => {
    expect(pieceTooltip({ owner: "W", rank: "S" }, { rulesetId: "checkers_us", themeId: "checkers" })).toBe("Red Man");
    expect(pieceTooltip({ owner: "B", rank: "O" }, { rulesetId: "checkers_us", themeId: "checkers" })).toBe("Black King");
  });
});