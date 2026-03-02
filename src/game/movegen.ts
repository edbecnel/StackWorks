import type { GameState, NodeId } from "./state.ts";
import type { Move, CaptureMove } from "./moveTypes.ts";
import { generateCaptureMovesLasca, generateLegalMovesLasca } from "./movegenLasca.ts";
import { generateCaptureMovesDama, generateLegalMovesDama } from "./movegenDama.ts";
import { generateCaptureMovesCheckersUs, generateLegalMovesCheckersUs } from "./movegenCheckersUs.ts";
import { generateCaptureMovesColumnsChess, generateLegalMovesColumnsChess } from "./movegenColumnsChess.ts";
import { generateCaptureMovesChess, generateLegalMovesChess } from "./movegenChess.ts";
import {
  generateCaptureMovesDamasca,
  generateCaptureMovesDamascaClassic,
  generateLegalMovesDamasca,
  generateLegalMovesDamascaClassic,
} from "./movegenDamasca.ts";

export type MovegenConstraints = {
  forcedFrom?: NodeId;
  excludedJumpSquares?: Set<NodeId>;
  /**
   * Direction of the previous capture step in a capture chain.
   * Used by rulesets that restrict follow-up captures (e.g., Officers must zigzag).
   */
  lastCaptureDir?: { dr: number; dc: number };
};

function getRulesetId(state: GameState): string {
  return state.meta?.rulesetId ?? "lasca";
}

export function generateCaptureMoves(
  state: GameState,
  constraints?: MovegenConstraints
): CaptureMove[] {
  const rulesetId = getRulesetId(state);
  if (rulesetId === "columns_chess") return generateCaptureMovesColumnsChess(state);
  if (rulesetId === "chess") return generateCaptureMovesChess(state);
  if (rulesetId === "checkers_us") return generateCaptureMovesCheckersUs(state, constraints);
  if (rulesetId === "dama") return generateCaptureMovesDama(state, constraints);
  if (rulesetId === "damasca") return generateCaptureMovesDamasca(state, constraints);
  if (rulesetId === "damasca_classic") return generateCaptureMovesDamascaClassic(state, constraints);
  return generateCaptureMovesLasca(state, constraints);
}

export function generateLegalMoves(
  state: GameState,
  constraints?: MovegenConstraints
): Move[] {
  const rulesetId = getRulesetId(state);
  if (rulesetId === "columns_chess") return generateLegalMovesColumnsChess(state);
  if (rulesetId === "chess") return generateLegalMovesChess(state);
  if (rulesetId === "checkers_us") return generateLegalMovesCheckersUs(state, constraints);
  if (rulesetId === "dama") return generateLegalMovesDama(state, constraints);
  if (rulesetId === "damasca") return generateLegalMovesDamasca(state, constraints);
  if (rulesetId === "damasca_classic") return generateLegalMovesDamascaClassic(state, constraints);
  return generateLegalMovesLasca(state, constraints);
}
