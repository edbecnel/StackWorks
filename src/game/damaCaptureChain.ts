import type { GameState, NodeId } from "./state.ts";
import type { DamaCaptureRemoval } from "../variants/variantTypes";
import { promoteIfNeeded, promoteTopSoldierIfOwnedByToMove } from "./promote.ts";

export function getDamaCaptureRemovalMode(state: GameState): DamaCaptureRemoval {
  const rulesetId = state.meta?.rulesetId ?? "lasca";
  if (rulesetId === "draughts_international") return "end_of_sequence";
  if (rulesetId !== "dama") return "immediate";
  return state.meta?.damaCaptureRemoval ?? "immediate";
}

export function finalizeDamaCaptureChain(
  state: GameState,
  lastLanding: NodeId,
  jumpedSquares: Iterable<NodeId>
): GameState & { didPromote?: boolean } {
  const mode = getDamaCaptureRemovalMode(state);

  let board = state.board;
  if (mode === "end_of_sequence") {
    const nextBoard = new Map(board);
    for (const over of jumpedSquares) {
      if (over === lastLanding) continue;
      nextBoard.delete(over);
    }
    board = nextBoard;
  }

  const tempState: GameState = { ...state, board };

  // If the mover reached the promotion row at any point in the chain, apply promotion
  // now on the final landing square (even if that square is not on the promotion row).
  const didPromote = tempState.captureChain?.promotionEarned
    ? promoteTopSoldierIfOwnedByToMove(tempState, lastLanding)
    : promoteIfNeeded(tempState, lastLanding);

  return { ...tempState, didPromote, captureChain: undefined };
}
