import { describe, it, expect } from "vitest";
import { applyMove } from "./applyMove.ts";
import type { GameState } from "./state.ts";

function mkCheckersState(boardEntries: Array<[string, any]>, toMove: "B" | "W" = "B"): GameState {
  return {
    board: new Map(boardEntries),
    toMove,
    phase: "idle",
    meta: { variantId: "checkers_8_us", rulesetId: "checkers_us", boardSize: 8 },
  };
}

describe("applyMove Checkers (US)", () => {
  it("capture removes jumped piece immediately, does not switch turn, and promotes immediately", () => {
    // Black man captures to the last row (r7) and should promote immediately.
    const s = mkCheckersState(
      [
        ["r5c0", [{ owner: "B", rank: "S" }]],
        ["r6c1", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    const next = applyMove(s, { kind: "capture", from: "r5c0", over: "r6c1", to: "r7c2" });

    expect(next.toMove).toBe("B");
    expect(next.board.has("r5c0")).toBe(false);
    expect(next.board.has("r6c1")).toBe(false);

    expect(Boolean((next as any).didPromote)).toBe(true);
    expect(next.board.get("r7c2")?.[0]).toEqual({ owner: "B", rank: "O" });
  });

  it("quiet move switches turn and can promote", () => {
    const s = mkCheckersState([["r6c1", [{ owner: "B", rank: "S" }]]], "B");

    const next = applyMove(s, { kind: "move", from: "r6c1", to: "r7c0" });

    expect(next.toMove).toBe("W");
    expect(Boolean((next as any).didPromote)).toBe(true);
    expect(next.board.get("r7c0")?.[0]).toEqual({ owner: "B", rank: "O" });
  });
});
