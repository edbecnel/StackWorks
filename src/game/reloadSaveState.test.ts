import { describe, expect, it } from "vitest";

import type { GameState } from "./state.ts";
import { HistoryManager } from "./historyManager.ts";
import { consumeReloadSaveState, stashReloadSaveState } from "./reloadSaveState.ts";

const STORAGE_KEY = "test.reloadSaveState";

const LASCA_META = {
  variantId: "lasca_8_dama_board",
  rulesetId: "lasca",
  boardSize: 8,
} as const;

function makeState(args: {
  nodeId: string;
  owner: "W" | "B";
  rank: "S" | "O" | "K";
  toMove: "W" | "B";
}): GameState {
  return {
    board: new Map([[args.nodeId, [{ owner: args.owner, rank: args.rank }]]]),
    toMove: args.toMove,
    phase: "idle",
    meta: LASCA_META,
  };
}

describe("reloadSaveState", () => {
  it("restores the current state and history after a one-shot reload handoff", () => {
    sessionStorage.clear();

    const s0 = makeState({ nodeId: "r6c0", owner: "W", rank: "S", toMove: "W" });
    const s1 = makeState({ nodeId: "r5c1", owner: "W", rank: "S", toMove: "B" });

    const history = new HistoryManager();
    history.push(s0, "Start");
    history.push(s1, "A1 -> B2");

    stashReloadSaveState(STORAGE_KEY, s1, history);

    const restored = consumeReloadSaveState(STORAGE_KEY, LASCA_META as any);

    expect(restored).not.toBeNull();
    expect(restored?.state.board.get("r5c1")).toEqual([{ owner: "W", rank: "S" }]);
    expect(restored?.state.toMove).toBe("B");
    expect(restored?.history?.states).toHaveLength(2);
    expect(restored?.history?.notation).toEqual(["Start", "A1 -> B2"]);
    expect(restored?.history?.currentIndex).toBe(1);
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(consumeReloadSaveState(STORAGE_KEY, LASCA_META as any)).toBeNull();
  });

  it("returns null when the stored snapshot is for a different variant", () => {
    sessionStorage.clear();

    const state = makeState({ nodeId: "r6c0", owner: "W", rank: "S", toMove: "W" });
    const history = new HistoryManager();
    history.push(state, "Start");

    stashReloadSaveState(STORAGE_KEY, state, history);

    const restored = consumeReloadSaveState(STORAGE_KEY, {
      variantId: "lasca_7_classic",
      rulesetId: "lasca",
      boardSize: 7,
    });

    expect(restored).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});