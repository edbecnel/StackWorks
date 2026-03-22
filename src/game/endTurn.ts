import type { GameState } from "./state.ts";
import { maybeApplyDamascaDeadPlayEnd } from "./damascaDeadPlay.ts";
import { finalizeCheckersUsTurnAtBoundary, isCheckersUsRuleset } from "./checkersUsDraw.ts";
import { finalizeInternationalDraughtsTurnAtBoundary, isInternationalDraughtsRuleset } from "./internationalDraughtsDraw.ts";

/**
 * End a turn: flip `toMove`, set `phase: idle`, and apply any turn-boundary rules.
 */
export function endTurn(state: GameState): GameState {
  const next: GameState = {
    ...state,
    toMove: state.toMove === "B" ? "W" : "B",
    phase: "idle",
  };

  // US Checkers: turn boundary is where we apply 40-move / 13-move / insufficient rules.
  // (Capture chains end here; quiet moves already flip `toMove` inside applyMoveCheckersUs.)
  const afterCheckers = isCheckersUsRuleset(state)
    ? (finalizeCheckersUsTurnAtBoundary({ ...next, checkersUsDraw: (state as any).checkersUsDraw }, state.toMove) as GameState)
    : next;

  const afterInternationalDraughts = isInternationalDraughtsRuleset(state)
    ? (finalizeInternationalDraughtsTurnAtBoundary(
        { ...afterCheckers, internationalDraughtsDraw: (state as any).internationalDraughtsDraw },
        state.toMove
      ) as GameState)
    : afterCheckers;

  // Safety: if a save/load or external caller advanced counters to a threshold,
  // ensure Damasca dead-play ends are applied at a turn boundary.
  return maybeApplyDamascaDeadPlayEnd(afterInternationalDraughts);
}
