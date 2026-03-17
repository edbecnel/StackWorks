import { describe, expect, it } from "vitest";
import { uciToLegalMove } from "./bot/chessMoveMap.ts";
import { applyMove } from "./game/applyMove.ts";
import { HistoryManager } from "./game/historyManager.ts";
import { createInitialGameStateForVariant, type GameState } from "./game/state.ts";
import { buildStandardAlgebraicHistory } from "./chessMoveHistoryNotation.ts";

function buildHistoryFromMoves(moves: string[]): ReturnType<HistoryManager["exportSnapshots"]> {
  const history = new HistoryManager();
  let state = createInitialGameStateForVariant("chess_classic");
  history.push(state);

  for (const uci of moves) {
    const move = uciToLegalMove(state, uci);
    if (!move) throw new Error(`Illegal move in test sequence: ${uci}`);
    state = applyMove(state, move);
    history.push(state, "");
  }

  return history.exportSnapshots();
}

function mkEmptyChessState(toMove: "W" | "B"): GameState {
  return {
    board: new Map(),
    toMove,
    phase: "select",
    meta: {
      variantId: "chess_classic",
      rulesetId: "chess",
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

describe("chessMoveHistoryNotation", () => {
  it("renders pawn captures in standard algebraic notation", () => {
    const notation = buildStandardAlgebraicHistory(buildHistoryFromMoves(["d2d4", "d7d5", "c2c4", "d5c4"]));
    expect(notation[4]).toBe("dxc4");
  });

  it("renders disambiguation when two pieces can reach the same square", () => {
    const before = mkEmptyChessState("W");
    before.board.set("r7c4", [{ owner: "W", rank: "K" }]);
    before.board.set("r0c4", [{ owner: "B", rank: "K" }]);
    before.board.set("r7c1", [{ owner: "W", rank: "N" }]);
    before.board.set("r5c5", [{ owner: "W", rank: "N" }]);

    const after = applyMove(before, { kind: "move", from: "r7c1", to: "r6c3" });

    const history = new HistoryManager();
    history.push(before);
    history.push(after, "B1 → D2");

    const notation = buildStandardAlgebraicHistory(history.exportSnapshots());
    expect(notation[1]).toBe("Nbd2");
  });

  it("renders castling with standard notation", () => {
    const notation = buildStandardAlgebraicHistory(
      buildHistoryFromMoves(["e2e4", "e7e5", "g1f3", "b8c6", "f1e2", "g8f6", "e1g1"])
    );
    expect(notation[7]).toBe("O-O");
  });

  it("renders promotion from a non-standard starting snapshot", () => {
    const before = mkEmptyChessState("W");
    before.board.set("r7c4", [{ owner: "W", rank: "K" }]);
    before.board.set("r1c7", [{ owner: "B", rank: "K" }]);
    before.board.set("r1c0", [{ owner: "W", rank: "P" }]);

    const after = applyMove(before, { kind: "move", from: "r1c0", to: "r0c0" });

    const history = new HistoryManager();
    history.push(before);
    history.push(after, "A7 → A8");

    const notation = buildStandardAlgebraicHistory(history.exportSnapshots());
    expect(notation[1]).toBe("a8=Q");
  });

  it("renders check and mate suffixes", () => {
    const checkNotation = buildStandardAlgebraicHistory(buildHistoryFromMoves(["e2e4", "f7f6", "d1h5"]));
    expect(checkNotation[3]).toBe("Qh5+");

    const mateNotation = buildStandardAlgebraicHistory(buildHistoryFromMoves(["f2f3", "e7e5", "g2g4", "d8h4"]));
    expect(mateNotation[4]).toBe("Qh4#");
  });
});