import { describe, expect, it } from "vitest";

import { isPlayable } from "./coords";
import { applyMove } from "./applyMove";
import { finalizeDamaCaptureChain } from "./damaCaptureChain";
import { generateLegalMoves } from "./movegen";
import { createInitialGameStateForVariant } from "./state";
import type { GameState } from "./state";
import type { Stack } from "../types";

function mkState(boardEntries: Array<[string, Stack]>, toMove: "B" | "W" = "B"): GameState {
  return {
    board: new Map(boardEntries),
    toMove,
    phase: "idle",
    meta: {
      variantId: "draughts_10_international",
      rulesetId: "draughts_international",
      boardSize: 10,
    },
  };
}

describe("International Draughts rule reuse", () => {
  it("generates the expected legal opening moves on the 10x10 start position", () => {
    const state = createInitialGameStateForVariant("draughts_10_international");
    const moves = generateLegalMoves(state);

    expect(moves).toHaveLength(9);
    expect(moves).toEqual(
      expect.arrayContaining([
        { kind: "move", from: "r6c1", to: "r5c0" },
        { kind: "move", from: "r6c1", to: "r5c2" },
        { kind: "move", from: "r6c3", to: "r5c2" },
        { kind: "move", from: "r6c3", to: "r5c4" },
        { kind: "move", from: "r6c5", to: "r5c4" },
        { kind: "move", from: "r6c5", to: "r5c6" },
        { kind: "move", from: "r6c7", to: "r5c6" },
        { kind: "move", from: "r6c7", to: "r5c8" },
        { kind: "move", from: "r6c9", to: "r5c8" },
      ])
    );
  });

  it("keeps placement and legal movement on dark squares only", () => {
    const state = mkState([["r3c2", [{ owner: "B", rank: "S" }]]], "B");
    const moves = generateLegalMoves(state);

    expect(moves).toEqual([
      { kind: "move", from: "r3c2", to: "r4c1" },
      { kind: "move", from: "r3c2", to: "r4c3" },
    ]);
    for (const move of moves) {
      const match = /^r(\d+)c(\d+)$/.exec(move.to);
      expect(match).toBeTruthy();
      expect(isPlayable(Number(match?.[1]), Number(match?.[2]), 10)).toBe(true);
    }
  });

  it("reuses Dama-style man captures in both directions and mandatory capture", () => {
    const state = mkState(
      [
        ["r3c2", [{ owner: "B", rank: "S" }]],
        ["r2c1", [{ owner: "W", rank: "S" }]],
        ["r4c3", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    expect(generateLegalMoves(state)).toEqual([
      { kind: "capture", from: "r3c2", over: "r2c1", to: "r1c0" },
      { kind: "capture", from: "r3c2", over: "r4c3", to: "r5c4" },
    ]);
  });

  it("reuses flying-king movement and distance capture landing choices", () => {
    const quiet = mkState([["r4c3", [{ owner: "B", rank: "O" }]]], "B");
    const quietMoves = generateLegalMoves(quiet);
    expect(quietMoves).toEqual(
      expect.arrayContaining([
        { kind: "move", from: "r4c3", to: "r3c2" },
        { kind: "move", from: "r4c3", to: "r2c1" },
        { kind: "move", from: "r4c3", to: "r1c0" },
        { kind: "move", from: "r4c3", to: "r5c4" },
        { kind: "move", from: "r4c3", to: "r6c5" },
        { kind: "move", from: "r4c3", to: "r7c6" },
      ])
    );

    const capture = mkState(
      [
        ["r4c3", [{ owner: "B", rank: "O" }]],
        ["r5c4", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );
    expect(generateLegalMoves(capture)).toEqual(
      expect.arrayContaining([
        { kind: "capture", from: "r4c3", over: "r5c4", to: "r6c5" },
        { kind: "capture", from: "r4c3", over: "r5c4", to: "r7c6" },
        { kind: "capture", from: "r4c3", over: "r5c4", to: "r8c7" },
        { kind: "capture", from: "r4c3", over: "r5c4", to: "r9c8" },
      ])
    );
  });

  it("reuses occupied-square blocking, including friendly-piece blocking", () => {
    const state = mkState(
      [
        ["r4c3", [{ owner: "B", rank: "O" }]],
        ["r6c5", [{ owner: "B", rank: "S" }]],
        ["r5c2", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    const moves = generateLegalMoves(state);
    expect(moves).toEqual(
      expect.arrayContaining([
        { kind: "capture", from: "r4c3", over: "r5c2", to: "r6c1" },
        { kind: "capture", from: "r4c3", over: "r5c2", to: "r7c0" },
      ])
    );
    expect(moves.some((move) => move.to === "r5c4" || move.to === "r7c6")).toBe(false);
  });

  it("reuses maximum-capture filtering for the first selectable step", () => {
    const state = mkState(
      [
        ["r2c1", [{ owner: "B", rank: "S" }]],
        ["r3c2", [{ owner: "W", rank: "S" }]],
        ["r5c4", [{ owner: "W", rank: "S" }]],
        ["r3c0", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    expect(generateLegalMoves(state)).toEqual([
      { kind: "capture", from: "r2c1", over: "r3c2", to: "r4c3" },
    ]);
  });

  it("keeps captured pieces on-board until chain finalization", () => {
    const state = mkState(
      [
        ["r2c1", [{ owner: "B", rank: "S" }]],
        ["r3c2", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    const afterCapture = applyMove(state, { kind: "capture", from: "r2c1", over: "r3c2", to: "r4c3" });
    expect(afterCapture.board.get("r3c2")).toEqual([{ owner: "W", rank: "S" }]);

    const finalized = finalizeDamaCaptureChain(afterCapture, "r4c3", new Set(["r3c2"]));
    expect(finalized.board.has("r3c2")).toBe(false);
  });

  it("does not generate off-board quiet moves for a man on the far edge", () => {
    const state = mkState([["r0c1", [{ owner: "W", rank: "S" }]]], "W");

    expect(generateLegalMoves(state)).toEqual([]);
  });

  it("rejects a quiet move onto an occupied square", () => {
    const state = mkState(
      [
        ["r3c2", [{ owner: "B", rank: "S" }]],
        ["r4c3", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    expect(() => applyMove(state, { kind: "move", from: "r3c2", to: "r4c3" })).toThrow();
  });

  it("rejects a capture whose landing square is occupied", () => {
    const state = mkState(
      [
        ["r3c2", [{ owner: "B", rank: "S" }]],
        ["r4c3", [{ owner: "W", rank: "S" }]],
        ["r5c4", [{ owner: "W", rank: "O" }]],
      ],
      "B"
    );

    expect(() => applyMove(state, { kind: "capture", from: "r3c2", over: "r4c3", to: "r5c4" })).toThrow();
  });

  it("does not allow re-capturing the same enemy piece during one capture sequence", () => {
    const state = mkState(
      [
        ["r4c3", [{ owner: "B", rank: "O" }]],
        ["r5c4", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    const first = applyMove(state, { kind: "capture", from: "r4c3", over: "r5c4", to: "r6c5" });
    const illegalRecapture = generateLegalMoves(first, {
      forcedFrom: "r6c5",
      excludedJumpSquares: new Set(["r5c4"]),
    }).filter((move) => move.kind === "capture");

    expect(illegalRecapture.some((move) => move.over === "r5c4")).toBe(false);
  });

  it("allows reusing the same empty square during one king capture sequence", () => {
    const state = mkState(
      [
        ["r4c3", [{ owner: "B", rank: "O" }]],
        ["r5c4", [{ owner: "W", rank: "S" }]],
        ["r5c6", [{ owner: "W", rank: "S" }]],
        ["r3c6", [{ owner: "W", rank: "S" }]],
        ["r3c4", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    const first = applyMove(state, { kind: "capture", from: "r4c3", over: "r5c4", to: "r6c5" });
    const second = applyMove(first, { kind: "capture", from: "r6c5", over: "r5c6", to: "r4c7" });
    const third = applyMove(second, { kind: "capture", from: "r4c7", over: "r3c6", to: "r2c5" });

    const finalLeg = generateLegalMoves(third, {
      forcedFrom: "r2c5",
      excludedJumpSquares: new Set(["r5c4", "r5c6", "r3c6"]),
    }).filter((move) => move.kind === "capture");

    expect(finalLeg).toEqual(
      expect.arrayContaining([
        { kind: "capture", from: "r2c5", over: "r3c4", to: "r4c3" },
      ])
    );
  });

  it("continues king multi-capture after changing diagonals", () => {
    const state = mkState(
      [
        ["r2c1", [{ owner: "B", rank: "O" }]],
        ["r3c2", [{ owner: "W", rank: "S" }]],
        ["r3c4", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    const first = applyMove(state, { kind: "capture", from: "r2c1", over: "r3c2", to: "r4c3" });
    const nextCaptures = generateLegalMoves(first, {
      forcedFrom: "r4c3",
      excludedJumpSquares: new Set(["r3c2"]),
    }).filter((move) => move.kind === "capture");

    expect(nextCaptures).toEqual(
      expect.arrayContaining([
        { kind: "capture", from: "r4c3", over: "r3c4", to: "r2c5" },
        { kind: "capture", from: "r4c3", over: "r3c4", to: "r1c6" },
        { kind: "capture", from: "r4c3", over: "r3c4", to: "r0c7" },
      ])
    );
  });

  it("does not promote mid-sequence just for passing through the promotion row", () => {
    const state = mkState(
      [
        ["r2c1", [{ owner: "W", rank: "S" }]],
        ["r1c2", [{ owner: "B", rank: "S" }]],
        ["r1c4", [{ owner: "B", rank: "S" }]],
      ],
      "W"
    );

    const first = applyMove(state, { kind: "capture", from: "r2c1", over: "r1c2", to: "r0c3" });
    const nextCaptures = generateLegalMoves(first, {
      forcedFrom: "r0c3",
      excludedJumpSquares: new Set(["r1c2"]),
    }).filter((move) => move.kind === "capture");

    expect(nextCaptures).toEqual([{ kind: "capture", from: "r0c3", over: "r1c4", to: "r2c5" }]);

    const second = applyMove(first, nextCaptures[0]);
    const finalized = finalizeDamaCaptureChain(second, "r2c5", new Set(["r1c2", "r1c4"]));
    expect(finalized.board.get("r2c5")).toEqual([{ owner: "W", rank: "S" }]);
  });

  it("promotes only when the move ends on the far promotion row", () => {
    const quietPromotion = mkState([["r1c2", [{ owner: "W", rank: "S" }]]], "W");
    const quietResult = applyMove(quietPromotion, { kind: "move", from: "r1c2", to: "r0c1" });

    expect(Boolean((quietResult as any).didPromote)).toBe(true);
    expect(quietResult.board.get("r0c1")).toEqual([{ owner: "W", rank: "O" }]);

    const chainPromotion = mkState(
      [
        ["r2c1", [{ owner: "W", rank: "S" }]],
        ["r1c2", [{ owner: "B", rank: "S" }]],
      ],
      "W"
    );
    const capturedToBackRank = applyMove(chainPromotion, { kind: "capture", from: "r2c1", over: "r1c2", to: "r0c3" });
    const finalizedOnBackRank = finalizeDamaCaptureChain(capturedToBackRank, "r0c3", new Set(["r1c2"]));

    expect(Boolean((finalizedOnBackRank as any).didPromote)).toBe(true);
    expect(finalizedOnBackRank.board.get("r0c3")).toEqual([{ owner: "W", rank: "O" }]);
  });
});