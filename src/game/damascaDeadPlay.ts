import type { GameState } from "./state.ts";
import type { Player, Piece } from "../types.ts";
import { evaluateState } from "../ai/evaluate.ts";

export const DAMASCA_NO_PROGRESS_LIMIT_PLIES = 40;
export const DAMASCA_OFFICER_ONLY_LIMIT_PLIES = 30;

function isDamascaRulesetId(rulesetId: string): boolean {
  return rulesetId === "damasca" || rulesetId === "damasca_classic" || rulesetId === "columns_draughts";
}

function pieceValue(p: Piece): number {
  return p.rank === "O" ? 1.6 : 1.0;
}

function sumMaterial(state: GameState, p: Player): number {
  let total = 0;
  for (const stack of state.board.values()) {
    if (!stack || stack.length === 0) continue;
    // Damasca uses Lasca-style stacks; count all pieces owned by p.
    for (const piece of stack) {
      if (piece.owner === p) total += pieceValue(piece);
    }
  }
  return total;
}

function countControlledStacks(state: GameState, p: Player): number {
  let n = 0;
  for (const stack of state.board.values()) {
    if (!stack || stack.length === 0) continue;
    const top = stack[stack.length - 1];
    if (top.owner === p) n++;
  }
  return n;
}

function getDamascaDeadPlay(state: GameState): { noProgressPlies: number; officerOnlyPlies: number } {
  const dp = (state as any).damascaDeadPlay as { noProgressPlies?: number; officerOnlyPlies?: number } | undefined;
  return {
    noProgressPlies: Math.max(0, Math.floor(dp?.noProgressPlies ?? 0)),
    officerOnlyPlies: Math.max(0, Math.floor(dp?.officerOnlyPlies ?? 0)),
  };
}

export function adjudicateDamascaDeadPlay(state: GameState, reasonCode: string, reasonLabel: string): GameState {
  if (!isDamascaRulesetId(state.meta?.rulesetId ?? "lasca")) return state;
  if (state.forcedGameOver) return state;

  const wMat = sumMaterial(state, "W");
  const bMat = sumMaterial(state, "B");

  const epsMat = 0.05;
  let winner: Player | null = null;
  let ladder = "material";

  if (Math.abs(wMat - bMat) >= epsMat) {
    winner = wMat > bMat ? "W" : "B";
  } else {
    // "Advantage points": use the engine's existing evaluation heuristic.
    // Positive => White advantage; negative => Black advantage.
    const adv = evaluateState(state, "W");
    if (adv !== 0) {
      winner = adv > 0 ? "W" : "B";
      ladder = "advantage";
    } else {
      const wCtrl = countControlledStacks(state, "W");
      const bCtrl = countControlledStacks(state, "B");
      if (wCtrl !== bCtrl) {
        winner = wCtrl > bCtrl ? "W" : "B";
        ladder = "control";
      } else {
        winner = null;
        ladder = "draw";
      }
    }
  }

  const winnerLabel = winner === "W" ? "White" : winner === "B" ? "Black" : "Draw";
  const extra =
    `material: White ${wMat.toFixed(1)} / Black ${bMat.toFixed(1)}; ` +
    `control: White ${countControlledStacks(state, "W")} / Black ${countControlledStacks(state, "B")}`;

  const message =
    winner === null
      ? `${winnerLabel} (adjudicated) — ${reasonLabel} (${extra})`
      : `${winnerLabel} wins (adjudicated) — ${reasonLabel} (${ladder}; ${extra})`;

  return {
    ...state,
    forcedGameOver: {
      winner,
      reasonCode,
      message,
    },
  };
}

export function maybeApplyDamascaDeadPlayEnd(state: GameState): GameState {
  if (!isDamascaRulesetId(state.meta?.rulesetId ?? "lasca")) return state;
  if (state.forcedGameOver) return state;

  const dp = getDamascaDeadPlay(state);
  if (dp.noProgressPlies >= DAMASCA_NO_PROGRESS_LIMIT_PLIES) {
    return adjudicateDamascaDeadPlay(state, "DAMASCA_NO_PROGRESS", `no-progress ≥ ${DAMASCA_NO_PROGRESS_LIMIT_PLIES} plies`);
  }
  if (dp.officerOnlyPlies >= DAMASCA_OFFICER_ONLY_LIMIT_PLIES) {
    return adjudicateDamascaDeadPlay(
      state,
      "DAMASCA_OFFICER_ONLY",
      `officer-only ≥ ${DAMASCA_OFFICER_ONLY_LIMIT_PLIES} plies`
    );
  }
  return state;
}

export function updateDamascaDeadPlayCounters(
  state: GameState,
  args: {
    movedTopRank: "S" | "O";
    didCapture: boolean;
    didPromote: boolean;
    didSoldierAdvance: boolean;
  }
): GameState {
  if (!isDamascaRulesetId(state.meta?.rulesetId ?? "lasca")) return state;
  if (state.forcedGameOver) return state;

  const prev = getDamascaDeadPlay(state);

  const noProgressReset = args.didCapture || args.didPromote || args.didSoldierAdvance;
  const officerOnlyReset = args.didCapture || args.didPromote || args.movedTopRank === "S";

  const noProgressPlies = noProgressReset ? 0 : prev.noProgressPlies + 1;

  let officerOnlyPlies = prev.officerOnlyPlies;
  if (officerOnlyReset) officerOnlyPlies = 0;
  else if (args.movedTopRank === "O" && !args.didCapture && !args.didPromote) officerOnlyPlies = prev.officerOnlyPlies + 1;

  const next: GameState = {
    ...state,
    damascaDeadPlay: {
      noProgressPlies,
      officerOnlyPlies,
    },
  };

  return maybeApplyDamascaDeadPlayEnd(next);
}
