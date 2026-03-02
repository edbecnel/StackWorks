import { describe, it, expect } from "vitest";
import { generateLegalMoves } from "./movegen.ts";
import type { GameState } from "./state.ts";
import type { Stack } from "../types";

function mkCheckersState(boardEntries: Array<[string, Stack]>, toMove: "B" | "W" = "B"): GameState {
  return {
    board: new Map(boardEntries),
    toMove,
    phase: "idle",
    meta: { variantId: "checkers_8_us", rulesetId: "checkers_us", boardSize: 8 },
  };
}

describe("movegen Checkers (US)", () => {
  it("enforces mandatory capture (no quiet moves when a capture exists)", () => {
    const s = mkCheckersState(
      [
        ["r2c1", [{ owner: "B", rank: "S" }]],
        ["r3c2", [{ owner: "W", rank: "S" }]],
        // r4c3 empty by omission
      ],
      "B"
    );

    const moves = generateLegalMoves(s);
    expect(moves).toEqual([{ kind: "capture", from: "r2c1", over: "r3c2", to: "r4c3" }]);
  });

  it("men capture forward only (no backward captures)", () => {
    // Black man has an enemy behind it; US checkers does NOT allow backward capture for men.
    const s = mkCheckersState(
      [
        ["r3c2", [{ owner: "B", rank: "S" }]],
        ["r2c1", [{ owner: "W", rank: "S" }]],
        // r1c0 empty by omission (would be a backward capture landing square)
      ],
      "B"
    );

    const moves = generateLegalMoves(s);

    // Only quiet moves should be present.
    expect(moves.every((m) => m.kind === "move")).toBe(true);
    expect(moves).toEqual(
      expect.arrayContaining([
        { kind: "move", from: "r3c2", to: "r4c1" },
        { kind: "move", from: "r3c2", to: "r4c3" },
      ])
    );

    // No backward capture.
    expect(moves).not.toEqual(
      expect.arrayContaining([
        { kind: "capture", from: "r3c2", over: "r2c1", to: "r1c0" },
      ])
    );
  });

  it("kings can capture backward (step captures in any diagonal)", () => {
    const s = mkCheckersState(
      [
        ["r3c2", [{ owner: "B", rank: "O" }]],
        ["r2c1", [{ owner: "W", rank: "S" }]],
        // r1c0 empty by omission
      ],
      "B"
    );

    const moves = generateLegalMoves(s);
    expect(moves).toEqual(
      expect.arrayContaining([
        { kind: "capture", from: "r3c2", over: "r2c1", to: "r1c0" },
      ])
    );
    expect(moves.every((m) => m.kind === "capture")).toBe(true);
  });
});
