import { describe, expect, it } from "vitest";
import { buildPgnMoveComment, formatEvalForPgn, parsePgnMoveAnnotations } from "./chessPgnAnnotations";

describe("chessPgnAnnotations", () => {
  it("parses timing and eval annotations from PGN comments", () => {
    const annotations = parsePgnMoveAnnotations(
      `[Event "?"]\n\n1. e4 { [%emt 0:00:03] [%eval 0.34] } e5 { [%eval #-2] } 2. Nf3 *`
    );

    expect(annotations).toEqual([
      { emtMs: 3000, evalScore: { cp: 34 } },
      { emtMs: null, evalScore: { mate: -2 } },
      { emtMs: null, evalScore: null },
    ]);
  });

  it("formats PGN move comments with both emt and eval fields", () => {
    expect(buildPgnMoveComment({ emtMs: 4200, evalScore: { cp: -125 } })).toBe(
      "{ [%emt 0:00:04] [%eval -1.25] }"
    );
    expect(formatEvalForPgn({ mate: 3 })).toBe("#3");
  });
});