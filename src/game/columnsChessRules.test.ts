import { describe, it, expect } from "vitest";
import { generateLegalMoves } from "./movegen.ts";
import { applyMove } from "./applyMove.ts";
import type { GameState } from "./state.ts";
import type { Stack, Rank } from "../types.ts";

function sq(id: string, owner: "W" | "B", rank: Rank): [string, Stack] {
  return [id, [{ owner, rank }]];
}

describe("Columns Chess rules", () => {
  it("allows capturing a stack even if it contains your own piece underneath", () => {
    const state: GameState = {
      board: new Map([
        // Black pawn that could capture diagonally.
        sq("r2c2", "B", "P"),
        // Target square has top White pawn but also a Black piece underneath.
        [
          "r3c3",
          [
            { owner: "B", rank: "P" },
            { owner: "W", rank: "P" },
          ],
        ],
        sq("r7c4", "W", "K"),
        sq("r0c4", "B", "K"),
      ]),
      toMove: "B",
      phase: "select",
      meta: { variantId: "columns_chess", rulesetId: "columns_chess", boardSize: 8 },
      chess: {
        castling: {
          W: { kingSide: false, queenSide: false },
          B: { kingSide: false, queenSide: false },
        },
      },
    };

    const moves = generateLegalMoves(state);
    expect(moves).toContainEqual({ kind: "capture", from: "r2c2", over: "r3c3", to: "r3c3" });

    // And applying the capture follows the stack-split capture semantics.
    const next = applyMove(state, { kind: "capture", from: "r2c2", over: "r3c3", to: "r3c3" } as any);
    expect(next.board.get("r3c3")).toEqual([
      { owner: "W", rank: "P" },
      { owner: "B", rank: "P" },
    ]);
    expect(next.board.get("r2c2")).toEqual([{ owner: "B", rank: "P" }]);
  });

  it("splits captured stacks: captured top goes under mover, remainder returns to origin", () => {
    const state: GameState = {
      board: new Map([
        [
          "r7c0",
          [
            { owner: "W", rank: "P" },
            { owner: "W", rank: "R" },
          ],
        ],
        [
          "r0c0",
          [
            { owner: "B", rank: "N" },
            { owner: "B", rank: "Q" },
          ],
        ],
      ]),
      toMove: "W",
      phase: "select",
      meta: { variantId: "columns_chess", rulesetId: "columns_chess", boardSize: 8 },
      chess: {
        castling: {
          W: { kingSide: true, queenSide: true },
          B: { kingSide: true, queenSide: true },
        },
      },
    };

    const next = applyMove(state, { kind: "capture", from: "r7c0", over: "r0c0", to: "r0c0" } as any);

    expect(next.board.get("r0c0")).toEqual([
      { owner: "B", rank: "Q" },
      { owner: "W", rank: "P" },
      { owner: "W", rank: "R" },
    ]);
    expect(next.board.get("r7c0")).toEqual([{ owner: "B", rank: "N" }]);
  });

  it("generates kingside castling when legal", () => {
    const state: GameState = {
      board: new Map([
        sq("r7c4", "W", "K"), // e1
        sq("r7c7", "W", "R"), // h1
      ]),
      toMove: "W",
      phase: "select",
      meta: { variantId: "columns_chess", rulesetId: "columns_chess", boardSize: 8 },
      chess: {
        castling: {
          W: { kingSide: true, queenSide: false },
          B: { kingSide: false, queenSide: false },
        },
      },
    };

    const moves = generateLegalMoves(state);
    expect(moves).toContainEqual({ kind: "move", from: "r7c4", to: "r7c6" }); // e1 -> g1

    // Applying castling also moves the rook.
    const next = applyMove(state, { kind: "move", from: "r7c4", to: "r7c6" });
    expect(next.board.has("r7c4")).toBe(false);
    expect(next.board.get("r7c6")?.at(-1)).toEqual({ owner: "W", rank: "K" });
    expect(next.board.has("r7c7")).toBe(false);
    expect(next.board.get("r7c5")?.at(-1)).toEqual({ owner: "W", rank: "R" });
  });

  it("generates en passant capture when available", () => {
    const state: GameState = {
      board: new Map([
        sq("r3c4", "W", "P"), // white pawn on e5
        sq("r3c3", "B", "P"), // black pawn on d5 (capturable)
        sq("r7c4", "W", "K"),
        sq("r0c4", "B", "K"),
      ]),
      toMove: "W",
      phase: "select",
      meta: { variantId: "columns_chess", rulesetId: "columns_chess", boardSize: 8 },
      chess: {
        castling: {
          W: { kingSide: false, queenSide: false },
          B: { kingSide: false, queenSide: false },
        },
        enPassantTarget: "r2c3", // d6 landing square
        enPassantPawn: "r3c3", // pawn to capture
      },
    };

    const moves = generateLegalMoves(state);
    expect(moves).toContainEqual({ kind: "capture", from: "r3c4", over: "r3c3", to: "r2c3" });

    const next = applyMove(state, { kind: "capture", from: "r3c4", over: "r3c3", to: "r2c3" } as any);
    expect(next.board.has("r3c4")).toBe(false);
    expect(next.board.has("r3c3")).toBe(false);

    const landed = next.board.get("r2c3")!;
    expect(landed.length).toBe(2);
    expect(landed[0]).toEqual({ owner: "B", rank: "P" });
    expect(landed[1]).toEqual({ owner: "W", rank: "P" });
  });

  it("filters out moves that leave king in check", () => {
    const state: GameState = {
      board: new Map([
        sq("r7c4", "W", "K"), // e1
        sq("r0c4", "B", "R"), // e8 rook giving check on open file
        sq("r6c0", "W", "P"), // a2 pawn (a quiet move should be illegal)
        sq("r0c0", "B", "K"),
      ]),
      toMove: "W",
      phase: "select",
      meta: { variantId: "columns_chess", rulesetId: "columns_chess", boardSize: 8 },
      chess: {
        castling: {
          W: { kingSide: false, queenSide: false },
          B: { kingSide: false, queenSide: false },
        },
      },
    };

    const moves = generateLegalMoves(state);

    // Pawn quiet move a2->a3 does not address check, so it must not be legal.
    expect(moves).not.toContainEqual({ kind: "move", from: "r6c0", to: "r5c0" });

    // King should have at least one legal response (e.g. move away).
    expect(moves.some((m) => m.from === "r7c4")).toBe(true);
  });

  it("does not allow kingside castling through an attacked transit square", () => {
    const state: GameState = {
      board: new Map([
        sq("r7c4", "W", "K"),
        sq("r7c7", "W", "R"),
        sq("r0c4", "B", "K"),
        sq("r4c2", "B", "Q"),
      ]),
      toMove: "W",
      phase: "select",
      meta: { variantId: "columns_chess", rulesetId: "columns_chess", boardSize: 8 },
      chess: {
        castling: {
          W: { kingSide: true, queenSide: false },
          B: { kingSide: false, queenSide: false },
        },
      },
    };

    const moves = generateLegalMoves(state);
    expect(moves).not.toContainEqual({ kind: "move", from: "r7c4", to: "r7c6" });
  });
});
