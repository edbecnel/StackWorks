import { describe, expect, it } from "vitest";

import { getSideLabelsForRuleset } from "./sideTerminology";

describe("sideTerminology", () => {
  it("uses White/Black for chess-like identifiers", () => {
    expect(getSideLabelsForRuleset("chess")).toEqual({ W: "White", B: "Black" });
    expect(getSideLabelsForRuleset("chess_classic")).toEqual({ W: "White", B: "Black" });
    expect(getSideLabelsForRuleset("columns_chess")).toEqual({ W: "White", B: "Black" });
  });
});