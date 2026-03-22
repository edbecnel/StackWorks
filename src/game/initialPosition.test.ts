import { describe, expect, it } from "vitest";

import { isPlayable } from "./coords.ts";
import { computeStartNodeIds } from "./initialPosition.ts";
import { createInitialGameStateForVariant } from "./state.ts";

describe("International Draughts initial position", () => {
  it("places 20 black men on nodes 1-20 and 20 white men on nodes 31-50", () => {
    const { blackStartNodeIds, whiteStartNodeIds } = computeStartNodeIds({
      boardSize: 10,
      piecesPerSide: 20,
    });

    expect(blackStartNodeIds).toEqual([
      "r0c1", "r0c3", "r0c5", "r0c7", "r0c9",
      "r1c0", "r1c2", "r1c4", "r1c6", "r1c8",
      "r2c1", "r2c3", "r2c5", "r2c7", "r2c9",
      "r3c0", "r3c2", "r3c4", "r3c6", "r3c8",
    ]);
    expect(whiteStartNodeIds).toEqual([
      "r9c0", "r9c2", "r9c4", "r9c6", "r9c8",
      "r8c1", "r8c3", "r8c5", "r8c7", "r8c9",
      "r7c0", "r7c2", "r7c4", "r7c6", "r7c8",
      "r6c1", "r6c3", "r6c5", "r6c7", "r6c9",
    ]);
  });

  it("creates the expected 10x10 opening state with white to move", () => {
    const state = createInitialGameStateForVariant("draughts_10_international");

    expect(state.toMove).toBe("W");
    expect(state.meta).toMatchObject({
      variantId: "draughts_10_international",
      rulesetId: "draughts_international",
      boardSize: 10,
    });
    expect(state.board.size).toBe(40);

    for (const [nodeId, stack] of state.board) {
      expect(stack).toEqual([{ owner: stack[0].owner, rank: "S" }]);
      const match = /^r(\d+)c(\d+)$/.exec(nodeId);
      expect(match).toBeTruthy();
      const row = Number(match?.[1]);
      const col = Number(match?.[2]);
      expect(isPlayable(row, col, 10)).toBe(true);
      expect(row === 4 || row === 5).toBe(false);
    }

    expect(state.board.get("r0c1")).toEqual([{ owner: "B", rank: "S" }]);
    expect(state.board.get("r3c8")).toEqual([{ owner: "B", rank: "S" }]);
    expect(state.board.get("r6c1")).toEqual([{ owner: "W", rank: "S" }]);
    expect(state.board.get("r9c8")).toEqual([{ owner: "W", rank: "S" }]);
    expect(state.board.has("r4c1")).toBe(false);
    expect(state.board.has("r5c8")).toBe(false);
  });
});