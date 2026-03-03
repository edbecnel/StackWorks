import { describe, it, expect } from "vitest";
import type { GameState } from "./state";
import { finalizeCheckersUsTurnAtBoundary } from "./checkersUsDraw";
import { checkCurrentPlayerLost } from "./gameOver";

describe("checkersUsDraw", () => {
  it("does not declare 'Draw by insufficient material' when a player has no pieces", () => {
    // Scenario: Black just captured the last White piece.
    // Turn boundary means `toMove` is now White, but White has 0 pieces.
    const afterTurn: GameState = {
      board: new Map([
        ["r4c4", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "W",
      phase: "idle",
      meta: { rulesetId: "checkers_us" as any, boardSize: 8 as any, variantId: "checkers_8_us" as any },
      checkersUsDraw: {
        noProgressPlies: 79,
        turnDidCapture: true,
        turnDidManAdvance: false,
        turnCount: { W: 10, B: 10 },
        lastOfferTurn: { W: -999, B: -999 },
      } as any,
    };

    const next = finalizeCheckersUsTurnAtBoundary(afterTurn, "B");

    // Must not override a terminal win with an automatic draw.
    expect((next as any).forcedGameOver).toBeUndefined();

    const lost = checkCurrentPlayerLost(next);
    expect(lost.winner).toBe("B");
    expect(lost.reason?.toLowerCase()).toContain("wins");
    expect(lost.reason?.toLowerCase()).toContain("no pieces");
  });

  it("does not force 40-move draw when the player to move has no legal moves", () => {
    // White to move with a single man on the last row (no legal moves).
    const afterTurn: GameState = {
      board: new Map([
        ["r0c1", [{ owner: "W", rank: "S" }]],
        ["r7c0", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
      meta: { rulesetId: "checkers_us" as any, boardSize: 8 as any, variantId: "checkers_8_us" as any },
      checkersUsDraw: {
        noProgressPlies: 80,
        turnDidCapture: false,
        turnDidManAdvance: false,
        turnCount: { W: 1, B: 1 },
        lastOfferTurn: { W: -999, B: -999 },
      } as any,
    };

    const next = finalizeCheckersUsTurnAtBoundary(afterTurn, "B");
    expect((next as any).forcedGameOver).toBeUndefined();

    const lost = checkCurrentPlayerLost(next);
    expect(lost.winner).toBe("B");
    expect(lost.reason?.toLowerCase()).toContain("no moves");
  });
});
