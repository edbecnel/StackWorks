import { describe, it, expect } from "vitest";
import { serializeGameState, deserializeGameState, serializeSaveData, deserializeSaveData } from "./saveLoad";
import type { GameState } from "./state";
import { HistoryManager } from "./historyManager";

describe("saveLoad", () => {
  it("should serialize and deserialize a simple game state", () => {
    const state: GameState = {
      board: new Map([
        ["r3c3", [{ owner: "W", rank: "S" }]],
        ["r5c5", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };

    const serialized = serializeGameState(state);
    const deserialized = deserializeGameState(serialized);

    expect(deserialized.toMove).toBe("B");
    expect(deserialized.phase).toBe("idle");
    expect(deserialized.board.size).toBe(2);
    expect(deserialized.board.get("r3c3")).toEqual([{ owner: "W", rank: "S" }]);
    expect(deserialized.board.get("r5c5")).toEqual([{ owner: "B", rank: "O" }]);
  });

  it("should handle stacks with multiple pieces", () => {
    const state: GameState = {
      board: new Map([
        ["r4c4", [
          { owner: "B", rank: "S" },
          { owner: "W", rank: "S" },
          { owner: "B", rank: "O" },
        ]],
      ]),
      toMove: "W",
      phase: "select",
    };

    const serialized = serializeGameState(state);
    const deserialized = deserializeGameState(serialized);

    const stack = deserialized.board.get("r4c4");
    expect(stack).toBeDefined();
    expect(stack!.length).toBe(3);
    expect(stack![0]).toEqual({ owner: "B", rank: "S" });
    expect(stack![1]).toEqual({ owner: "W", rank: "S" });
    expect(stack![2]).toEqual({ owner: "B", rank: "O" });
  });

  it("should handle empty board", () => {
    const state: GameState = {
      board: new Map(),
      toMove: "W",
      phase: "idle",
    };

    const serialized = serializeGameState(state);
    const deserialized = deserializeGameState(serialized);

    expect(deserialized.board.size).toBe(0);
    expect(deserialized.toMove).toBe("W");
  });

  it("should preserve all piece properties", () => {
    const state: GameState = {
      board: new Map([
        ["r0c0", [{ owner: "B", rank: "O" }]],
        ["r6c6", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "anim",
    };

    const serialized = serializeGameState(state);
    
    // Verify serialized format is JSON-compatible
    const json = JSON.stringify(serialized);
    const parsed = JSON.parse(json);
    
    const deserialized = deserializeGameState(parsed);

    expect(deserialized.board.get("r0c0")).toEqual([{ owner: "B", rank: "O" }]);
    expect(deserialized.board.get("r6c6")).toEqual([{ owner: "W", rank: "S" }]);
    expect(deserialized.phase).toBe("anim");
  });

  it("should serialize and deserialize v3 save data with history", () => {
    const s0: GameState = {
      board: new Map([["r6c0", [{ owner: "W", rank: "S" }]]]),
      toMove: "W",
      phase: "idle",
    };
    const s1: GameState = {
      board: new Map([["r5c1", [{ owner: "W", rank: "S" }]]]),
      toMove: "B",
      phase: "idle",
    };
    const s2: GameState = {
      board: new Map([["r4c2", [{ owner: "W", rank: "S" }]]]),
      toMove: "W",
      phase: "idle",
    };

    const history = new HistoryManager();
    history.push(s0, "Start");
    history.push(s1, "A1 → B2");
    history.push(s2, "B2 → C3");

    const save = serializeSaveData(s2, history);
    const json = JSON.stringify(save);
    const parsed = JSON.parse(json);
    expect(parsed.saveVersion).toBe(3);
    expect(parsed.variantId).toBeDefined();
    expect(parsed.rulesetId).toBeDefined();
    expect(parsed.boardSize).toBeDefined();
    const loaded = deserializeSaveData(parsed);

    expect(loaded.history).toBeDefined();
    expect(loaded.history!.states.length).toBe(3);
    expect(loaded.history!.notation.length).toBe(3);
    expect(loaded.history!.notation[1]).toBe("A1 → B2");
    expect(loaded.state.toMove).toBe("W");
    expect(loaded.state.meta).toBeDefined();
    expect(loaded.state.meta!.variantId).toBeDefined();
  });

  it("omits recorded move times when includeTiming is false", () => {
    const s0: GameState = {
      board: new Map([["r6c0", [{ owner: "W", rank: "S" }]]]),
      toMove: "W",
      phase: "idle",
    };
    const s1: GameState = {
      board: new Map([["r5c1", [{ owner: "W", rank: "S" }]]]),
      toMove: "B",
      phase: "idle",
    };

    const history = new HistoryManager();
    history.push(s0, "Start", null);
    history.push(s1, "A1 → B2", 1234);

    const save = serializeSaveData(s1, history, { includeTiming: false }) as any;
    expect(save.history).toBeDefined();
    expect(save.history.emtMs).toBeUndefined();
  });

  it("should keep backward compatibility with v1 state-only saves", () => {
    const state: GameState = {
      board: new Map([["r3c3", [{ owner: "B", rank: "O" }]]]),
      toMove: "B",
      phase: "idle",
    };

    const v1 = serializeGameState(state);
    const loaded = deserializeSaveData(v1);
    expect(loaded.history).toBeUndefined();
    expect(loaded.state.board.get("r3c3")).toEqual([{ owner: "B", rank: "O" }]);
    expect(loaded.state.meta).toBeDefined();
  });

  it("should allow Dama Classic <-> Dama International saves to load each other (rewrites meta to current)", () => {
    const mkDamaState = (variantId: any, damaCaptureRemoval: any): GameState => ({
      board: new Map([["r3c3", [{ owner: "B", rank: "S" }]]]),
      toMove: "B",
      phase: "idle",
      meta: { variantId, rulesetId: "dama", boardSize: 8, damaCaptureRemoval },
    });

    const standard = mkDamaState("dama_8_classic_standard", "immediate");
    const international = mkDamaState("dama_8_classic_international", "end_of_sequence");

    const saveStandard = serializeSaveData(standard);
    const saveInternational = serializeSaveData(international);

    // Load Standard save while running International.
    const loadedAsInternational = deserializeSaveData(saveStandard as any, {
      variantId: "dama_8_classic_international",
      rulesetId: "dama",
      boardSize: 8,
    } as any);
    expect(loadedAsInternational.state.meta?.variantId).toBe("dama_8_classic_international");
    expect(loadedAsInternational.state.meta?.rulesetId).toBe("dama");
    expect(loadedAsInternational.state.meta?.boardSize).toBe(8);
    expect((loadedAsInternational.state.meta as any)?.damaCaptureRemoval).toBe("end_of_sequence");

    // Load International save while running Standard.
    const loadedAsStandard = deserializeSaveData(saveInternational as any, {
      variantId: "dama_8_classic_standard",
      rulesetId: "dama",
      boardSize: 8,
    } as any);
    expect(loadedAsStandard.state.meta?.variantId).toBe("dama_8_classic_standard");
    expect((loadedAsStandard.state.meta as any)?.damaCaptureRemoval).toBe("immediate");
  });

  it("rejects legacy hybrid ids with a clear message", () => {
    const legacy: any = {
      saveVersion: 3,
      variantId: "hybrid_8_damasca",
      rulesetId: "hybrid",
      boardSize: 8,
      current: {
        board: [["r3c3", [{ owner: "B", rank: "S" }]]],
        toMove: "B",
        phase: "idle",
        meta: { variantId: "hybrid_8_damasca", rulesetId: "hybrid", boardSize: 8 },
      },
    };

    expect(() => deserializeSaveData(legacy)).toThrow(/legacy 'hybrid' IDs/i);
  });

  it("loads v3 current state when history snapshot is stale/mismatched", () => {
    const save: any = {
      saveVersion: 3,
      variantId: "damasca_8",
      rulesetId: "damasca",
      boardSize: 8,
      current: {
        board: [["r0c0", [{ owner: "B", rank: "S" }]]],
        toMove: "B",
        phase: "idle",
        meta: { variantId: "damasca_8", rulesetId: "damasca", boardSize: 8 },
      },
      history: {
        // Stale history that doesn't match `current`.
        states: [
          {
            board: [["r7c7", [{ owner: "W", rank: "S" }]]],
            toMove: "W",
            phase: "select",
            meta: { variantId: "damasca_8", rulesetId: "damasca", boardSize: 8 },
          },
        ],
        notation: [""],
        currentIndex: 0,
      },
    };

    const loaded = deserializeSaveData(save);
    expect(Array.from(loaded.state.board.entries())).toEqual([["r0c0", [{ owner: "B", rank: "S" }]]]);
    expect(loaded.state.toMove).toBe("B");
    // History should still be restored; the current state is appended/selected.
    expect(loaded.history).toBeDefined();
    expect(loaded.history!.states.length).toBe(2);
    expect(loaded.history!.currentIndex).toBe(1);
  });
});
