import { describe, expect, it } from "vitest";

import { pieceTooltip } from "./pieceLabel";

describe("pieceTooltip", () => {
  it("uses Dama terminology", () => {
    expect(pieceTooltip({ owner: "W", rank: "S" }, { rulesetId: "dama" })).toBe("White Man");
    expect(pieceTooltip({ owner: "B", rank: "O" }, { rulesetId: "dama" })).toBe("Black King");
  });

  it("uses International Draughts terminology", () => {
    expect(pieceTooltip({ owner: "W", rank: "S" }, { rulesetId: "draughts_international" })).toBe("White Man");
    expect(pieceTooltip({ owner: "B", rank: "O" }, { rulesetId: "draughts_international" })).toBe("Black King");
  });
});