import type { GameState } from "./state.ts";
import type { Move } from "./moveTypes.ts";
import { promoteIfNeeded } from "./promote.ts";
import { applyCheckersUsTurnProgress, finalizeCheckersUsTurnAtBoundary } from "./checkersUsDraw.ts";

/**
 * US Checkers / American draughts.
 * - No stacks/columns.
 * - Captures remove the jumped piece immediately.
 * - Captures do NOT switch the turn (controller handles multi-capture chains).
 * - Promotion is immediate; controller ends the capture chain when promotion happens.
 */
export function applyMoveCheckersUs(
  state: GameState,
  move: Move
): GameState & { didPromote?: boolean } {
  const nextBoard = new Map(state.board);

  if (move.kind === "capture") {
    const moving = nextBoard.get(move.from);
    if (!moving || moving.length === 0) {
      throw new Error(`applyMoveCheckersUs: no moving piece at ${move.from}`);
    }
    if (moving.length !== 1) {
      throw new Error(`applyMoveCheckersUs: stacks/columns are not allowed (from=${move.from})`);
    }

    const enemy = nextBoard.get(move.over);
    if (!enemy || enemy.length === 0) {
      throw new Error(`applyMoveCheckersUs: no enemy piece to capture at ${move.over}`);
    }
    if (enemy.length !== 1) {
      throw new Error(`applyMoveCheckersUs: stacks/columns are not allowed (over=${move.over})`);
    }

    const dest = nextBoard.get(move.to);
    if (dest && dest.length > 0) {
      throw new Error(`applyMoveCheckersUs: landing square ${move.to} is not empty`);
    }

    // Remove captured piece immediately.
    nextBoard.delete(move.over);

    // Move the capturing piece.
    nextBoard.set(move.to, moving);
    nextBoard.delete(move.from);

    const tempState = { ...state, board: nextBoard };
    const didPromote = promoteIfNeeded(tempState, move.to);

    // Track turn progress (capture resets the 40-move counter).
    const progressed = applyCheckersUsTurnProgress(state, move, moving[moving.length - 1].rank);

    return {
      ...state,
      ...(progressed.checkersUsDraw ? { checkersUsDraw: progressed.checkersUsDraw } : {}),
      board: nextBoard,
      toMove: state.toMove,
      phase: "idle",
      didPromote,
      captureChain: undefined,
    };
  }

  // Quiet move
  const moving = nextBoard.get(move.from);
  if (!moving || moving.length === 0) return state;
  if (moving.length !== 1) {
    throw new Error(`applyMoveCheckersUs: stacks/columns are not allowed (from=${move.from})`);
  }

  const dest = nextBoard.get(move.to);
  if (dest && dest.length > 0) {
    throw new Error(`applyMoveCheckersUs: landing square ${move.to} is not empty`);
  }

  nextBoard.set(move.to, moving);
  nextBoard.delete(move.from);

  const tempState = { ...state, board: nextBoard };
  const didPromote = promoteIfNeeded(tempState, move.to);

  const nextToMove = state.toMove === "B" ? "W" : "B";

  // Track turn progress (quiet move may or may not advance a man).
  const progressed = applyCheckersUsTurnProgress(state, move, moving[moving.length - 1].rank);

  // Quiet move ends the turn (toMove flips here), so finalize draw bookkeeping now.
  const afterQuiet: GameState & { didPromote?: boolean } = {
    ...state,
    ...(progressed.checkersUsDraw ? { checkersUsDraw: progressed.checkersUsDraw } : {}),
    board: nextBoard,
    toMove: nextToMove,
    phase: "idle",
    didPromote,
    captureChain: undefined,
  };

  return finalizeCheckersUsTurnAtBoundary(afterQuiet, state.toMove) as any;
}
