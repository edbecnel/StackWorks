import { describe, it, expect } from "vitest";
import { getWinner, checkCurrentPlayerLost } from "./gameOver";
import type { GameState } from "./state";

describe("getWinner", () => {
  it("should return null when game continues (both players have pieces and moves)", () => {
    const state: GameState = {
      board: new Map([
        ["r3c3", [{ owner: "W", rank: "S" }]], // White soldier in middle
        ["r5c5", [{ owner: "B", rank: "S" }]], // Black soldier in middle (can move forward)
      ]),
      toMove: "W",
      phase: "idle",
    };

    const result = getWinner(state);
    expect(result.winner).toBe(null);
    expect(result.reason).toBe(null);
  });

  it("should detect Light win when Dark has no pieces", () => {
    const state: GameState = {
      board: new Map([
        ["r3c3", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    const result = getWinner(state);
    expect(result.winner).toBe("W");
    expect(result.reason).toContain("Light wins");
    expect(result.reason).toContain("Dark has no pieces");
  });

  it("should detect Dark win when Light has no pieces", () => {
    const state: GameState = {
      board: new Map([
        ["r3c3", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };

    const result = getWinner(state);
    expect(result.winner).toBe("B");
    expect(result.reason).toContain("Dark wins");
    expect(result.reason).toContain("Light has no pieces");
  });

  it("should detect win when opponent pieces are all captured in stacks (tops are all owned by current player)", () => {
    const state: GameState = {
      board: new Map([
        // All stacks have White on top, even though Black pieces exist at bottom
        ["r3c3", [{ owner: "B", rank: "S" }, { owner: "W", rank: "O" }]],
        ["r4c4", [{ owner: "B", rank: "S" }, { owner: "W", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    const result = getWinner(state);
    expect(result.winner).toBe("W");
    expect(result.reason).toContain("Light wins");
    expect(result.reason).toContain("Dark has no pieces");
  });

  it("should detect win when opponent is blocked and has no legal moves", () => {
    // Black soldiers at the far edge (row 6) can't move forward off the board
    // and are blocked from moving diagonally by white pieces
    // It's White's turn, so we check if Black (opponent) has moves
    const state: GameState = {
      board: new Map([
        ["r6c0", [{ owner: "B", rank: "S" }]], // Black soldier at edge, can't move forward
        ["r5c1", [{ owner: "W", rank: "O" }]], // White officer blocking diagonal move
        ["r3c3", [{ owner: "W", rank: "O" }]], // Another white piece
      ]),
      toMove: "W",
      phase: "idle",
    };

    const result = getWinner(state);
    // Black should have no legal moves (soldier at edge with no forward moves)
    expect(result.winner).toBe("W");
    expect(result.reason).toContain("Light wins");
    expect(result.reason).toContain("Dark has no moves");
  });

  it("should not declare winner if opponent still has controlled stacks", () => {
    const state: GameState = {
      board: new Map([
        ["r1c1", [{ owner: "W", rank: "S" }]],
        ["r5c5", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    const result = getWinner(state);
    expect(result.winner).toBe(null);
    expect(result.reason).toBe(null);
  });

  it("should handle empty board (no winner if no pieces at all)", () => {
    const state: GameState = {
      board: new Map(),
      toMove: "W",
      phase: "idle",
    };

    // With no pieces, White (current player) wins because opponent has no pieces
    const result = getWinner(state);
    expect(result.winner).toBe("W");
    expect(result.reason).toContain("Dark has no pieces");
  });

  it("should reuse International Draughts win by eliminating all opponent pieces", () => {
    const state: GameState = {
      board: new Map([
        ["r6c5", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
      meta: { variantId: "draughts_10_international", rulesetId: "draughts_international", boardSize: 10 },
    };

    const result = getWinner(state);
    expect(result.winner).toBe("W");
    expect(result.reason).toContain("White wins");
    expect(result.reason).toContain("Black has no pieces");
  });

  it("should reuse International Draughts win when the opponent has no legal move", () => {
    const state: GameState = {
      board: new Map([
        ["r4c3", [{ owner: "W", rank: "O" }]],
        ["r9c0", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
      meta: { variantId: "draughts_10_international", rulesetId: "draughts_international", boardSize: 10 },
    };

    const result = getWinner(state);
    expect(result.winner).toBe("W");
    expect(result.reason).toContain("White wins");
    expect(result.reason).toContain("Black has no moves");
  });
});

describe("checkCurrentPlayerLost", () => {
  it("should use the requested Columns Chess checkmate reason text", () => {
    // Black to move, in check, with no legal moves.
    const state: GameState = {
      board: new Map([
        ["r0c0", [{ owner: "B", rank: "K" }]], // a8 black king
        ["r1c1", [{ owner: "W", rank: "Q" }]], // b7 white queen delivering check
        ["r2c2", [{ owner: "W", rank: "K" }]], // c6 white king defending the queen
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

    const result = checkCurrentPlayerLost(state);
    expect(result.winner).toBe("W");
    expect(result.reason).toBe("Checkmate! White Wins");
  });

  it("should detect that current player has lost when they have no pieces", () => {
    const state: GameState = {
      board: new Map([
        ["r3c3", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "B", // Black's turn, but Black has no pieces
      phase: "idle",
    };

    const result = checkCurrentPlayerLost(state);
    expect(result.winner).toBe("W");
    expect(result.reason).toContain("Light wins");
    expect(result.reason).toContain("Dark has no pieces");
  });

  it("should detect that current player has lost when they have no legal moves", () => {
    const state: GameState = {
      board: new Map([
        ["r6c0", [{ owner: "B", rank: "S" }]], // Black soldier at edge, can't move forward
        ["r5c1", [{ owner: "W", rank: "O" }]], // White officer blocking
        ["r3c3", [{ owner: "W", rank: "O" }]], // Another white piece
      ]),
      toMove: "B", // Black's turn, but Black has no moves
      phase: "idle",
    };

    const result = checkCurrentPlayerLost(state);
    expect(result.winner).toBe("W");
    expect(result.reason).toContain("Light wins");
    expect(result.reason).toContain("Dark has no moves");
  });

  it("should return null when current player can still play", () => {
    const state: GameState = {
      board: new Map([
        ["r3c3", [{ owner: "W", rank: "S" }]],
        ["r5c5", [{ owner: "B", rank: "S" }]], // Black can move forward
      ]),
      toMove: "B",
      phase: "idle",
    };

    const result = checkCurrentPlayerLost(state);
    expect(result.winner).toBe(null);
    expect(result.reason).toBe(null);
  });

  it("should handle pieces buried in stacks correctly", () => {
    const state: GameState = {
      board: new Map([
        // Black pieces exist but are all on bottom of stacks
        ["r3c3", [{ owner: "B", rank: "S" }, { owner: "W", rank: "O" }]],
        ["r4c4", [{ owner: "B", rank: "S" }, { owner: "W", rank: "S" }]],
      ]),
      toMove: "B", // Black's turn but has no controlled stacks
      phase: "idle",
    };

    const result = checkCurrentPlayerLost(state);
    expect(result.winner).toBe("W");
    expect(result.reason).toContain("Light wins");
    expect(result.reason).toContain("Dark has no pieces");
  });

  it("should detect International Draughts loss when the side to move has no legal moves", () => {
    const state: GameState = {
      board: new Map([
        ["r4c3", [{ owner: "W", rank: "O" }]],
        ["r9c0", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
      meta: { variantId: "draughts_10_international", rulesetId: "draughts_international", boardSize: 10 },
    };

    const result = checkCurrentPlayerLost(state);
    expect(result.winner).toBe("W");
    expect(result.reason).toContain("White wins");
    expect(result.reason).toContain("Black has no moves");
  });
});
