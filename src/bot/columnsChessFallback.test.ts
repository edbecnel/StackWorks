import { describe, expect, it } from "vitest";
import type { GameState } from "../game/state.ts";
import { pickFallbackMoveColumnsChess } from "./columnsChessFallback.ts";
import { applyMove } from "../game/applyMove.ts";
import { generateLegalMovesColumnsChess } from "../game/movegenColumnsChess.ts";

function mkEmptyColumnsChessState(toMove: "W" | "B"): GameState {
  return {
    board: new Map(),
    toMove,
    phase: "select",
    meta: {
      variantId: "columns_chess" as any,
      rulesetId: "columns_chess",
      boardSize: 8,
    },
    chess: {
      castling: {
        W: { kingSide: false, queenSide: false },
        B: { kingSide: false, queenSide: false },
      },
    },
  };
}

describe("columns chess fallback", () => {
  it("returns a legal move from the initial position", () => {
    // A minimal legal position needs both kings.
    const s = mkEmptyColumnsChessState("W");
    s.board.set("r7c4", [{ owner: "W", rank: "K" } as any]);
    s.board.set("r0c4", [{ owner: "B", rank: "K" } as any]);
    s.board.set("r6c4", [{ owner: "W", rank: "P" } as any]);

    const legal = generateLegalMovesColumnsChess(s);
    expect(legal.length).toBeGreaterThan(0);

    const m = pickFallbackMoveColumnsChess(s, {
      tier: "intermediate",
      seed: "t",
      legalMoves: legal,
      timeBudgetMs: 60,
    });
    expect(m).toBeTruthy();

    // Should apply without throwing.
    const next = applyMove(s, m!);
    expect(next.toMove).toBe("B");
  });

  it("strongly prefers a high-value capture when available", () => {
    const s = mkEmptyColumnsChessState("W");
    s.board.set("r7c4", [{ owner: "W", rank: "K" } as any]);
    s.board.set("r0c4", [{ owner: "B", rank: "K" } as any]);

    // White rook can capture a black queen on the same rank.
    s.board.set("r4c0", [{ owner: "W", rank: "R" } as any]);
    s.board.set("r4c7", [{ owner: "B", rank: "Q" } as any]);

    const legal = generateLegalMovesColumnsChess(s);
    expect(legal.some((m) => m.kind === "capture")).toBe(true);

    const m = pickFallbackMoveColumnsChess(s, {
      tier: "intermediate",
      seed: "cap",
      legalMoves: legal,
      timeBudgetMs: 80,
    });
    expect(m).toBeTruthy();
    expect(m!.kind).toBe("capture");
    expect((m as any).to).toBe("r4c7");
  });

  it("keeps a preferred Stockfish move when stack-aware search does not strongly disagree", () => {
    const s = mkEmptyColumnsChessState("W");
    s.board.set("r7c4", [{ owner: "W", rank: "K" } as any]);
    s.board.set("r0c4", [{ owner: "B", rank: "K" } as any]);
    s.board.set("r6c4", [{ owner: "W", rank: "P" } as any]);

    const legal = generateLegalMovesColumnsChess(s);
    const preferred = legal.find((move) => (move as any).to === "r5c4");
    expect(preferred).toBeTruthy();

    const chosen = pickFallbackMoveColumnsChess(s, {
      tier: "beginner",
      seed: "preferred",
      legalMoves: legal,
      timeBudgetMs: 40,
      preferredMove: preferred!,
    });

    expect(chosen).toEqual(preferred);
  });
});
