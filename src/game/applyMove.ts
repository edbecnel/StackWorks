import type { GameState } from "./state.ts";
import type { Move } from "./moveTypes.ts";
import { applyMoveLasca } from "./applyMoveLasca.ts";
import { applyMoveDama } from "./applyMoveDama.ts";
import { applyMoveDamasca } from "./applyMoveDamasca.ts";
import { applyMoveCheckersUs } from "./applyMoveCheckersUs.ts";
import { applyMoveColumnsChess } from "./applyMoveColumnsChess.ts";
import { applyMoveChess } from "./applyMoveChess.ts";

function getRulesetId(state: GameState): string {
  return state.meta?.rulesetId ?? "lasca";
}

export function applyMove(
  state: GameState,
  move: Move
): GameState & { didPromote?: boolean } {
  const rulesetId = getRulesetId(state);

  let next: (GameState & { didPromote?: boolean }) | null = null;
  if (rulesetId === "columns_chess") next = applyMoveColumnsChess(state, move);
  else if (rulesetId === "chess") next = applyMoveChess(state, move);
  else if (rulesetId === "checkers_us") next = applyMoveCheckersUs(state, move);
  else if (rulesetId === "dama" || rulesetId === "draughts_international") next = applyMoveDama(state, move);
  else if (rulesetId === "damasca" || rulesetId === "damasca_classic") next = applyMoveDamasca(state, move);
  else next = applyMoveLasca(state, move);

  // Ephemeral UI hint: highlight the origin/destination squares of the last move.
  next.ui = {
    ...(next.ui ?? {}),
    lastMove: { from: move.from, to: move.to },
  };
  return next;
}
