import { describe, expect, it } from "vitest";

import { applyMove } from "./applyMove.ts";
import { finalizeInternationalDraughtsTurnAtBoundary } from "./internationalDraughtsDraw.ts";
import type { GameState } from "./state.ts";
import type { Stack } from "../types.ts";

function mkState(
  boardEntries: Array<[string, Stack]>,
  toMove: "W" | "B" = "W",
  internationalDraughtsDraw?: GameState["internationalDraughtsDraw"]
): GameState {
  return {
    board: new Map(boardEntries),
    toMove,
    phase: "idle",
    meta: {
      variantId: "draughts_10_international",
      rulesetId: "draughts_international",
      boardSize: 10,
    },
    ...(internationalDraughtsDraw ? { internationalDraughtsDraw } : {}),
  };
}

describe("internationalDraughtsDraw", () => {
  it("draws on the 50th king-only no-progress ply", () => {
    const state = mkState(
      [
        ["r4c3", [{ owner: "W", rank: "O" }]],
        ["r6c5", [{ owner: "B", rank: "O" }]],
      ],
      "W",
      {
        noProgressKingOnlyPlies: 49,
        turnDidCapture: false,
        turnDidManMove: false,
        turnCount: { W: 24, B: 25 },
      }
    );

    const next = applyMove(state, { kind: "move", from: "r4c3", to: "r3c2" });

    expect((next as any).internationalDraughtsDraw?.noProgressKingOnlyPlies).toBe(50);
    expect((next as any).forcedGameOver?.reasonCode).toBe("INTERNATIONAL_DRAUGHTS_25_MOVE_RULE");
    expect((next as any).forcedGameOver?.winner).toBeNull();
  });

  it("resets the king-only counter when a man moves", () => {
    const state = mkState(
      [
        ["r6c1", [{ owner: "W", rank: "S" }]],
        ["r3c4", [{ owner: "B", rank: "O" }]],
      ],
      "W",
      {
        noProgressKingOnlyPlies: 12,
        turnDidCapture: false,
        turnDidManMove: false,
        turnCount: { W: 3, B: 3 },
      }
    );

    const next = applyMove(state, { kind: "move", from: "r6c1", to: "r5c2" });

    expect((next as any).internationalDraughtsDraw?.noProgressKingOnlyPlies).toBe(0);
    expect((next as any).forcedGameOver).toBeUndefined();
  });

  it("draws after 16 moves each in a 3-kings-vs-1-king endgame", () => {
    const afterTurn = mkState(
      [
        ["r2c1", [{ owner: "W", rank: "O" }]],
        ["r4c3", [{ owner: "W", rank: "O" }]],
        ["r6c5", [{ owner: "W", rank: "O" }]],
        ["r7c6", [{ owner: "B", rank: "O" }]],
      ],
      "B",
      {
        noProgressKingOnlyPlies: 10,
        turnDidCapture: false,
        turnDidManMove: false,
        turnCount: { W: 15, B: 16 },
        reduced: {
          key: "W:3k_vs_1k",
          label: "16-move: W 3 kings vs B 1 king",
          limitTurnsEach: 16,
          activatedAtTurnCount: { W: 0, B: 0 },
        },
      }
    );

    const next = finalizeInternationalDraughtsTurnAtBoundary(afterTurn, "W");

    expect((next as any).forcedGameOver?.reasonCode).toBe("INTERNATIONAL_DRAUGHTS_16_MOVE_REDUCED_MATERIAL");
    expect((next as any).forcedGameOver?.winner).toBeNull();
  });

  it("draws after 5 moves each in a 1-king-vs-1-king endgame", () => {
    const state = mkState(
      [
        ["r4c3", [{ owner: "W", rank: "O" }]],
        ["r6c5", [{ owner: "B", rank: "O" }]],
      ],
      "W",
      {
        noProgressKingOnlyPlies: 8,
        turnDidCapture: false,
        turnDidManMove: false,
        turnCount: { W: 4, B: 5 },
        reduced: {
          key: "equal:1k_vs_1k",
          label: "5-move: 1 king vs 1 king",
          limitTurnsEach: 5,
          activatedAtTurnCount: { W: 0, B: 0 },
        },
      }
    );

    const next = applyMove(state, { kind: "move", from: "r4c3", to: "r3c2" });

    expect((next as any).forcedGameOver?.reasonCode).toBe("INTERNATIONAL_DRAUGHTS_5_MOVE_REDUCED_MATERIAL");
    expect((next as any).forcedGameOver?.winner).toBeNull();
  });

  it("does not override a terminal win with a reduced-material draw", () => {
    const afterTurn = mkState(
      [["r4c3", [{ owner: "W", rank: "O" }]]],
      "B",
      {
        noProgressKingOnlyPlies: 49,
        turnDidCapture: false,
        turnDidManMove: false,
        turnCount: { W: 15, B: 15 },
        reduced: {
          key: "equal:1k_vs_1k",
          label: "5-move: 1 king vs 1 king",
          limitTurnsEach: 5,
          activatedAtTurnCount: { W: 0, B: 0 },
        },
      }
    );

    const next = finalizeInternationalDraughtsTurnAtBoundary(afterTurn, "W");

    expect((next as any).forcedGameOver).toBeUndefined();
  });
});